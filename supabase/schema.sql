-- Robinsons General Store, v1 schema
-- Run this first in the Supabase SQL editor, then seed.sql.
-- Money is stored as numeric in dollars, in production and everywhere else. Integer cents is not planned.

create extension if not exists pgcrypto;

create table store (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_entity text,
  address text,
  created_at timestamptz default now()
);

create table department (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  name text not null,
  parent_department_id uuid references department(id),
  accent_color text,
  target_margin numeric,            -- default retail margin percent for the margin calculator
  created_at timestamptz default now()
);

create table app_user (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  full_name text not null,
  role text not null check (role in ('staff','lead','manager','owner')),
  email text unique,                -- the Supabase Auth account email; auth_setup.sql links auth_id by this
  created_at timestamptz default now()
);

create table vendor (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store: scope vendors to one store
  department_id uuid references department(id),
  name text not null,
  rep_name text,
  phone text,
  email text,
  products_we_carry text,
  default_terms text,
  status text default 'active' check (status in ('active','skip','discontinue','bankrupt')),
  notes text,
  -- The ordering profile: what the buyer needs in front of them before placing an order.
  -- Mirrors supabase/vendor_ordering_fields.sql, which adds these to a live database.
  minimum_order_amount numeric,
  no_minimum_order boolean not null default false,
  summer_order_timeline text,           -- "Before mid-January", in the buyer's own words
  order_location text[],                -- gift show, email, rep visit; more than one applies
  order_location_other text,            -- the free text behind "Other"
  reorder_status text check (reorder_status is null or reorder_status in ('reordered','no_reorder')),
  reorder_comments text,
  -- Property Maintenance only: the trade this contractor does, from the owner's
  -- MaintenancePayments tab. Mirrors supabase/vendor_specializes_in.sql for a live database.
  specializes_in text,
  -- An amount and "no minimum" are mutually exclusive: a row claiming both is not a state
  -- anyone can act on, so the database refuses it rather than trusting the form.
  constraint vendor_minimum_order_check check (
    not (no_minimum_order and minimum_order_amount is not null)
    and (minimum_order_amount is null or minimum_order_amount > 0)
  ),
  created_at timestamptz default now()
);

create table item (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  department_id uuid references department(id),
  vendor_id uuid references vendor(id),
  sku text,
  name text not null,
  uom text,
  retail_price numeric,
  cost_price numeric,
  is_regulated boolean default false,
  created_at timestamptz default now()
);

create table receiving_event (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  department_id uuid references department(id),
  vendor_id uuid references vendor(id),
  vendor_name text,                 -- raw extracted vendor name before matching
  received_date date,
  notes text,                       -- free-text notes typed on the capture confirm screen
  source_file_path text,            -- the original invoice or photo in storage
  status text default 'confirmed' check (status in ('pending_document','parsed','validation_error','awaiting_arrival','partial_received','fully_received','disputed','confirmed','closed','cancelled')),
  discrepancy_ack boolean default false,  -- set true when a human acknowledged an order-vs-invoiced difference
  low_confidence_ack boolean default false, -- set true when a human confirmed the low-confidence (amber) lines
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

create table receiving_line (
  id uuid primary key default gen_random_uuid(),
  receiving_event_id uuid references receiving_event(id) on delete cascade,
  item_id uuid references item(id),
  description text,
  qty numeric,
  unit_cost numeric,
  retail_price_note numeric,        -- the price scribbled on the invoice
  confidence numeric                -- model confidence 0 to 1, low values get flagged
);

-- Database backstop for the human-in-the-loop rule on dollars: a line the model read with low
-- confidence and that carries a unit cost can only post when its receiving event records the
-- capture screen's explicit acknowledgement. The UI enforces this first; the trigger makes the
-- rule hold for any other write path too.
create or replace function public.enforce_line_confidence()
returns trigger
language plpgsql
as $$
begin
  if new.confidence is not null and new.confidence < 0.7 and new.unit_cost is not null then
    if not exists (
      select 1 from public.receiving_event e
      where e.id = new.receiving_event_id and e.low_confidence_ack
    ) then
      raise exception 'low-confidence dollar line needs the capture acknowledgement before it posts';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists receiving_line_confidence_gate on public.receiving_line;
create trigger receiving_line_confidence_gate
  before insert or update on public.receiving_line
  for each row execute function public.enforce_line_confidence();

create table invoice (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  receiving_event_id uuid references receiving_event(id),
  vendor_id uuid references vendor(id),
  invoice_number text,
  invoice_date date,                    -- drives the HST-by-department financial-year report
  amount numeric,
  hst_amount numeric,
  freight_charges numeric,              -- freight as its own line; total owed = amount + freight + HST
  -- How the invoice states its tax: separate = the HST figure is added on top; included =
  -- the HST is already inside amount (recorded for the tax report, never added again);
  -- none = a no-tax vendor; invoice = refer to the actual invoice. See invoice_owed_total.
  tax_mode text check (tax_mode is null or tax_mode in ('separate','included','none','invoice')),
  delivery_status text check (delivery_status is null or delivery_status in ('delivered','partially_delivered','not_delivered')),
  delivered_date date,                  -- the day the goods actually arrived
  delivery_comments text,               -- short-shipped or damaged, in the receiver's words
  -- Where the final invoice itself is filed, and the link or path when any of it is digital.
  invoice_filing text check (invoice_filing is null or invoice_filing in ('physical','digital','both')),
  digital_file_location text,
  -- Property Maintenance payouts only (null for merchandise invoices): estimate number when
  -- the work was preplanned, repair vs upgrade, service category, and a short description.
  estimate_number text,
  work_type text check (work_type is null or work_type in ('repair','upgrade')),
  service_category text,                -- Electrical, Plumbing, HVAC, ... or free text via Others
  work_description text,
  po_number text,                       -- the purchase order number on Hardware invoices
  terms text,
  due_date date,
  -- Derived by recompute_invoice_status from the payment allocations:
  -- unpaid -> partially_paid -> paid; postdated = covered only by future-dated payments.
  -- Overdue is computed from due_date in the UI, never stored.
  status text default 'unpaid' check (status in ('unpaid','partially_paid','paid','postdated')),
  source_file_path text,
  created_at timestamptz default now()
);

-- A payment belongs to a vendor. Which invoices it settles lives in payment_allocation,
-- so one cheque can cover several invoices (even across departments) and still reconcile
-- as one payment against the bank statement. invoice_id remains for legacy single-invoice
-- rows; the autoallocate trigger turns it into an allocation.
create table payment (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendor(id),
  invoice_id uuid references invoice(id),   -- legacy link, kept for old write paths
  amount numeric,
  -- The owner's locked method list; 'cc' stays valid for rows recorded before the card split.
  method text check (method in ('cash','cheque','cc_visa','cc_mastercard','cc_amex','cc_debit','etransfer','eft','other','cc')),
  paid_date date,                           -- a future date means post-dated: not settled until it arrives
  reference text,                           -- cheque number, e-transfer ref, card confirmation
  notes text,                               -- required by the UI when method = other
  confirmation_filing text check (confirmation_filing is null or confirmation_filing in ('digital','physical','both')),
  digital_file_location text,               -- where the payment confirmation lives, when it is digital
  confirmation_file_path text,
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

-- How a payment splits across invoices. A partial payment is an allocation smaller than
-- the invoice balance.
create table payment_allocation (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payment(id) on delete cascade,
  invoice_id uuid not null references invoice(id),
  amount numeric not null,
  created_at timestamptz default now()
);
create index payment_allocation_payment_idx on payment_allocation(payment_id);
create index payment_allocation_invoice_idx on payment_allocation(invoice_id);

-- Vendor credits that reduce what is owed on an invoice (damaged goods, returns,
-- overcharges, short shipments). Fresh installs get this here; existing databases get the
-- identical table from supabase/credit_notes.sql.
create table credit_note (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  vendor_id uuid not null references vendor(id),
  invoice_id uuid references invoice(id),
  invoice_number text,              -- the invoice number this credit applies to
  credit_amount numeric not null,
  reason text not null,
  comments text,
  credit_type text check (credit_type is null or credit_type in ('bank_account','vendor_account')),
  status text not null default 'pending' check (status in ('pending','applied','disputed')),
  created_by uuid references app_user(id),
  created_at timestamptz default now(),
  voided_at timestamptz,
  voided_by uuid references app_user(id)
);
create index credit_note_vendor_idx on credit_note(vendor_id);
create index credit_note_invoice_idx on credit_note(invoice_id);

-- Owner suggestion box: ideas, problems, and screenshots land here instead of WhatsApp.
-- Fresh installs get this here; existing databases get the identical table from
-- supabase/feedback.sql.
create table feedback (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  author_id uuid references app_user(id),
  kind text not null default 'idea' check (kind in ('idea','problem','question','praise')),
  page text,                -- which screen it is about, in the author's words
  body text,
  screenshot_path text,     -- storage path under <store_id>/feedback/ in the documents bucket
  audio_path text,          -- voice recording path under <store_id>/feedback/
  status text not null default 'new' check (status in ('new','planned','done','declined')),
  created_at timestamptz default now(),
  voided_at timestamptz,
  voided_by uuid references app_user(id)
);
create index feedback_store_idx on feedback(store_id);
create index feedback_status_idx on feedback(status);

-- What the AI read off a suggestion's screenshot, one row per suggestion. Kept apart from the
-- suggestion because, once login is enforced, it opens only to the people who may open the
-- screenshot (auth_setup.sql 3g). screenshot_path is the file it was read from. Existing
-- databases get the identical table from supabase/feedback_summary.sql.
create table feedback_summary (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null unique references feedback(id),
  store_id uuid references store(id),   -- multi-store
  screenshot_path text,
  summary text not null,
  created_at timestamptz default now()
);
create index feedback_summary_store_idx on feedback_summary(store_id);

-- The database dates every save of a description, whatever the writer sends (auth_setup.sql 3g
-- counts only a file saved by then).
create or replace function public.feedback_summary_dated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists feedback_summary_dated on public.feedback_summary;
create trigger feedback_summary_dated
  before insert or update on public.feedback_summary
  for each row execute function public.feedback_summary_dated();

-- One row per AI model call, for the daily per-store cap (src/lib/aiUsage.ts). Metadata
-- only: never the prompt, the store data sent with it, or the answer. Fresh installs get
-- this here; existing databases get the identical table and functions from
-- supabase/ai_call.sql, which explains each column and why the functions are definer.
create table ai_call (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references store(id),   -- multi-store
  route text not null,          -- extract, ask, reorder, feedback-triage
  model text,
  outcome text not null check (outcome in ('pending','ok','refused','cut_off','failed','capped')),
  failure_kind text,            -- for failed: timeout, overloaded, bad_request, upstream
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index ai_call_store_day_idx on ai_call(store_id, created_at);

-- Which questions each department's vendor and invoice forms ask, as chosen on the
-- Department fields screen. No rows means the code lists in src/lib/vendorFields.ts and
-- src/lib/invoiceFields.ts apply unchanged. Fresh installs get this here; existing databases
-- get the identical table and its login-on policies from supabase/department_field.sql.
create table department_field (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references store(id),   -- multi-store
  department_id uuid not null references department(id),
  form text not null check (form in ('vendor','invoice')),
  field_key text not null,
  asked boolean not null,
  updated_by uuid references app_user(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (department_id, form, field_key)
);
create index department_field_store_idx on department_field(store_id);

-- Reserve one call under the store's daily cap, or refuse it, counting and inserting under a
-- per-store lock so parallel requests cannot all fit. Definer: members write only through
-- this and ai_call_finish, and only the owner reads the rows. A signed-in caller always uses
-- their own store. plpgsql so the auth_id branch, which this demo schema cannot take, is only
-- planned when it runs.
create or replace function public.ai_call_begin(p_store_id uuid, p_route text, p_model text, p_cap integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid := p_store_id;
  v_used integer;
  v_id uuid;
begin
  if auth.uid() is not null then
    select u.store_id into v_store from public.app_user u where u.auth_id = auth.uid() limit 1;
  end if;
  if v_store is null then
    return jsonb_build_object('allowed', true, 'id', null);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_call:' || v_store::text, 0));
  select count(*) into v_used from public.ai_call c
  where c.store_id = v_store
    and c.outcome <> 'capped'
    and c.created_at >= date_trunc('day', now() at time zone 'America/Toronto') at time zone 'America/Toronto';
  if v_used >= greatest(coalesce(p_cap, 1), 1) then
    insert into public.ai_call (store_id, route, model, outcome)
    values (v_store, left(p_route, 40), left(p_model, 100), 'capped');
    return jsonb_build_object('allowed', false, 'id', null);
  end if;
  insert into public.ai_call (store_id, route, model, outcome)
  values (v_store, left(p_route, 40), left(p_model, 100), 'pending')
  returning id into v_id;
  return jsonb_build_object('allowed', true, 'id', v_id);
end;
$$;

-- Say how a reserved call ended: only a pending row of the caller's own store, once, and
-- never as capped, so finishing cannot take a call out of today's count.
create or replace function public.ai_call_finish(
  p_id uuid, p_outcome text, p_model text, p_failure_kind text,
  p_input_tokens integer, p_output_tokens integer,
  p_cache_read_tokens integer, p_cache_write_tokens integer, p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid;
begin
  if p_outcome is null or p_outcome not in ('ok','refused','cut_off','failed') then
    raise exception 'ai_call_finish: outcome % is not allowed', p_outcome;
  end if;
  if auth.uid() is not null then
    select u.store_id into v_store from public.app_user u where u.auth_id = auth.uid() limit 1;
    if v_store is null then
      return;
    end if;
  end if;
  update public.ai_call c
  set outcome = p_outcome,
      model = coalesce(left(p_model, 100), c.model),
      failure_kind = left(p_failure_kind, 40),
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      cache_read_tokens = p_cache_read_tokens,
      cache_write_tokens = p_cache_write_tokens,
      duration_ms = p_duration_ms
  where c.id = p_id
    and c.outcome = 'pending'
    and (v_store is null or c.store_id = v_store);
end;
$$;

-- Payments engine: one atomic path every screen records through. Bodies reference tables
-- created later in this file (activity_log); plpgsql resolves them at call time.

-- One definition of what an invoice owes, mirroring invoiceTotal() in src/lib/payments.ts.
-- Tax already inside the invoice amount (tax_mode 'included') is recorded for the HST
-- report but never added on top, or the engine would demand more than the vendor billed.
create or replace function public.invoice_owed_total(
  p_amount numeric, p_freight numeric, p_hst numeric, p_tax_mode text
) returns numeric
language sql
immutable
as $$
  select coalesce(p_amount, 0) + coalesce(p_freight, 0)
       + case when p_tax_mode = 'included' then 0 else coalesce(p_hst, 0) end;
$$;

-- Derive one invoice's status from its allocations. paid_date in the future means the money
-- has not left yet (post-dated cheque). A null paid_date counts as settled (legacy imports).
create or replace function public.recompute_invoice_status(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_total numeric;
  v_settled numeric;
  v_scheduled numeric;
  v_status text;
begin
  -- Total owed = goods + freight + HST, matching invoiceTotal() in src/lib/payments.ts.
  -- Freight was omitted here at first, which let a partial payment of goods+HST flip an
  -- invoice to paid with the freight still owed. Tax already inside the amount is not
  -- added again.
  select public.invoice_owed_total(amount, freight_charges, hst_amount, tax_mode) into v_total
  from public.invoice where id = p_invoice_id;
  if not found then
    return;
  end if;

  select
    coalesce(sum(a.amount) filter (where p.paid_date is null or p.paid_date <= (now() at time zone 'America/Toronto')::date), 0),
    coalesce(sum(a.amount) filter (where p.paid_date > (now() at time zone 'America/Toronto')::date), 0)
  into v_settled, v_scheduled
  from public.payment_allocation a
  join public.payment p on p.id = a.payment_id
  where a.invoice_id = p_invoice_id and p.voided_at is null;

  if v_total <= 0 then
    v_status := case when v_settled + v_scheduled > 0 then 'paid' else 'unpaid' end;
  elsif v_settled >= v_total then
    v_status := 'paid';
  elsif v_settled + v_scheduled >= v_total then
    v_status := 'postdated';
  elsif v_settled + v_scheduled > 0 then
    v_status := 'partially_paid';
  else
    v_status := 'unpaid';
  end if;

  update public.invoice set status = v_status
  where id = p_invoice_id and status is distinct from v_status;
end;
$$;

-- Record a payment atomically: payment row, allocations, invoice statuses, audit entries.
-- p_allocations: jsonb array of {"invoice_id": uuid, "amount": number}. A payment with no
-- allocations is a deposit/prepayment and needs p_amount instead. Returns the payment id.
create or replace function public.record_payment(
  p_vendor_id uuid,
  p_method text,
  p_paid_date date,
  p_reference text default null,
  p_notes text default null,
  p_actor uuid default null,
  p_allocations jsonb default '[]'::jsonb,
  p_amount numeric default null,
  p_confirmation_filing text default null  -- digital or physical, per the workflow sheet
) returns uuid
language plpgsql
as $$
declare
  v_total numeric := 0;
  v_payment_id uuid;
  a record;
begin
  select coalesce(sum((x->>'amount')::numeric), 0) into v_total
  from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) x;

  if v_total <= 0 then
    if p_amount is null or p_amount <= 0 then
      raise exception 'a payment needs invoice allocations or an amount';
    end if;
    v_total := p_amount;
  end if;

  insert into public.payment (vendor_id, amount, method, paid_date, reference, notes, confirmation_filing, created_by)
  values (p_vendor_id, v_total, p_method, p_paid_date, nullif(p_reference, ''), nullif(p_notes, ''), nullif(p_confirmation_filing, ''), p_actor)
  returning id into v_payment_id;

  for a in
    select (x->>'invoice_id')::uuid as invoice_id, (x->>'amount')::numeric as amount
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) x
  loop
    if a.invoice_id is null or a.amount is null or a.amount <= 0 then
      raise exception 'each allocation needs an invoice and an amount above zero';
    end if;
    insert into public.payment_allocation (payment_id, invoice_id, amount)
    values (v_payment_id, a.invoice_id, a.amount);
    perform public.recompute_invoice_status(a.invoice_id);
    if p_actor is not null then
      insert into public.activity_log (actor_id, action, entity, entity_id)
      values (p_actor, 'payment_recorded', 'invoice', a.invoice_id);
    end if;
  end loop;

  if p_actor is not null then
    insert into public.activity_log (actor_id, action, entity, entity_id)
    values (p_actor, 'payment_recorded', 'payment', v_payment_id);
  end if;

  return v_payment_id;
end;
$$;

-- Void a payment (soft delete) and put every invoice it touched back to its true status.
create or replace function public.void_payment(p_payment_id uuid, p_actor uuid default null)
returns void
language plpgsql
as $$
declare
  r record;
begin
  update public.payment set voided_at = now(), voided_by = p_actor
  where id = p_payment_id and voided_at is null;
  if not found then
    return;
  end if;

  for r in select distinct invoice_id from public.payment_allocation where payment_id = p_payment_id
  loop
    perform public.recompute_invoice_status(r.invoice_id);
  end loop;

  if p_actor is not null then
    insert into public.activity_log (actor_id, action, entity, entity_id)
    values (p_actor, 'voided', 'payment', p_payment_id);
  end if;
end;
$$;

-- Fix a recorded payment's facts (a wrong date must be correctable): date, method,
-- reference, notes, and filing are editable in one transaction, and every invoice the
-- payment touches gets its status re-derived, because a date change can move money
-- between settled and post-dated. The amount is NOT editable here: allocations hang off
-- it, so a wrong amount means void the payment and record it again.
create or replace function public.edit_payment(
  p_payment_id uuid,
  p_method text,
  p_paid_date date,
  p_reference text default null,
  p_notes text default null,
  p_confirmation_filing text default null,
  p_actor uuid default null
) returns void
language plpgsql
as $$
declare
  r record;
begin
  if p_paid_date is null then
    raise exception 'a paid date is required';
  end if;

  update public.payment
  set method = p_method,
      paid_date = p_paid_date,
      reference = nullif(p_reference, ''),
      notes = nullif(p_notes, ''),
      confirmation_filing = nullif(p_confirmation_filing, '')
  where id = p_payment_id and voided_at is null;
  if not found then
    raise exception 'payment not found or already voided';
  end if;

  for r in select distinct invoice_id from public.payment_allocation where payment_id = p_payment_id
  loop
    perform public.recompute_invoice_status(r.invoice_id);
  end loop;

  if p_actor is not null then
    insert into public.activity_log (actor_id, action, entity, entity_id)
    values (p_actor, 'payment_edited', 'payment', p_payment_id);
  end if;
end;
$$;

-- Flip post-dated invoices whose payment dates have arrived. The payments screens call it
-- on load, so nothing needs a cron.
create or replace function public.reconcile_postdated()
returns integer
language plpgsql
as $$
declare
  r record;
  n integer := 0;
begin
  for r in select id from public.invoice where status = 'postdated' and voided_at is null
  loop
    perform public.recompute_invoice_status(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Backstop for legacy write paths (seed data, the Excel import) that insert payment rows
-- with invoice_id: give them an allocation and a vendor automatically, and recompute.
create or replace function public.payment_autoallocate()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_id is not null then
    insert into public.payment_allocation (payment_id, invoice_id, amount)
    select new.id, new.invoice_id, coalesce(new.amount, 0)
    where not exists (select 1 from public.payment_allocation a where a.payment_id = new.id);
    if new.vendor_id is null then
      update public.payment
      set vendor_id = (select vendor_id from public.invoice where id = new.invoice_id)
      where id = new.id;
    end if;
    perform public.recompute_invoice_status(new.invoice_id);
  end if;
  return new;
end;
$$;

drop trigger if exists payment_autoallocate on public.payment;
create trigger payment_autoallocate
  after insert on public.payment
  for each row execute function public.payment_autoallocate();

create table retail_price (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references item(id),
  price numeric,
  effective_date date,
  source_file_path text,
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

create table inventory_count (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  department_id uuid references department(id),
  counted_date date,
  source_file_path text,
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

create table inventory_count_line (
  id uuid primary key default gen_random_uuid(),
  inventory_count_id uuid references inventory_count(id) on delete cascade,
  item_id uuid references item(id),
  counted_qty numeric,
  notes text                        -- movement flags (FAST/SLOW/DEAD) and overstock locations from imported sheets
);

create table purchase_order (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  vendor_id uuid references vendor(id),
  department_id uuid references department(id),
  season_year int,
  order_amount numeric,
  ship_date date,
  delivery_commit date,
  -- The owner's two states are in_progress and approved; the rest are the older lifecycle
  -- values that orders imported from the bookings ledger still carry.
  status text default 'in_progress' check (status in ('in_progress','approved','draft','ordered','confirmed','shipped','received','cancelled')),
  order_filing text check (order_filing is null or order_filing in ('digital','physical','both')),
  digital_file_location text,           -- where the order confirmation lives, when it is digital
  notes text,
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

create table knowledge_note (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  department_id uuid references department(id),
  topic text,
  body text,
  tags text[],
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

-- Evidence-driven: the store sells regulated pesticides under an Ontario licence with a tracked expiry.
create table licence (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  name text not null,
  authority text,
  number text,
  holder text,
  expiry_date date,
  source_file_path text,
  created_at timestamptz default now()
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references app_user(id),
  action text,
  entity text,
  entity_id uuid,
  created_at timestamptz default now()
);

-- Tax rules keyed by province for portability. rate is the combined effective decimal.
-- The app only ever multiplies a subtotal by the Ontario rate; the other rows are reference data.
create table tax_rules (
  id uuid primary key default gen_random_uuid(),
  region text not null unique,
  rate numeric not null,            -- combined effective rate as a decimal, e.g. 0.13 for Ontario
  label text,                       -- e.g. "13% HST"
  note text,
  effective_date date,
  created_at timestamptz default now()
);

-- Property and Maintenance (Phase: later). Assets are the things we maintain (building,
-- refrigeration, equipment, grounds, safety) and the operating service accounts. Tasks are
-- the recurring and one-off jobs against them. The dev RLS DO-block below covers these too;
-- replace it with Supabase Auth plus per-role, per-store policies before production.
create table maintenance_asset (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  department_id uuid references department(id),
  name text not null,
  category text check (category in ('building','refrigeration','equipment','grounds','safety','other')),
  location text,
  notes text,
  created_at timestamptz default now()
);

create table maintenance_task (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  asset_id uuid references maintenance_asset(id),
  title text not null,
  detail text,
  due_date date,
  recurrence text default 'none' check (recurrence in ('none','daily','weekly','monthly','seasonal','annual')),
  status text default 'open' check (status in ('open','in_progress','done')),
  assigned_to uuid references app_user(id),
  completed_at timestamptz,
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

create table insurance_policy (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  name text not null,
  provider text,
  policy_number text,
  coverage text,
  premium numeric,
  renewal_date date,
  notes text,
  created_at timestamptz default now()
);

-- HR (Phase: later).
-- PRIVACY: employee, pay_rate, and shift hold PIPEDA personal data (names, contact details,
-- pay, and hours). PIPEDA requires consent for collection and use, employee access to their
-- own data, and reasonable security safeguards. Keep this data in the Canadian region, limit
-- who can read it, and replace the dev RLS DO-block below with Supabase Auth plus per-role
-- policies before production. Quebec Law 25 only applies if Quebec-resident data enters scope.
create table employee (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  department_id uuid references department(id),
  full_name text not null,
  role text,
  phone text,
  email text,
  hire_date date,
  status text default 'active' check (status in ('active','inactive')),
  notes text,
  created_at timestamptz default now()
);

-- Effective-dated pay rates: insert a new row when pay changes, keep the history.
create table pay_rate (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employee(id),
  rate numeric,
  unit text check (unit in ('hour','salary')),
  effective_date date,
  created_at timestamptz default now()
);

create table shift (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employee(id),
  department_id uuid references department(id),  -- the department this shift covers (staff float across departments)
  work_date date,
  start_time time,
  end_time time,
  notes text,
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

-- Soft delete (void). Transactions and records are kept for the audit trail and the six-year
-- tax history; "delete" in the app sets voided_at and voided_by and the row drops out of every
-- list and total (queries filter voided_at is null). Shifts are the exception: they are hard
-- deleted, so they get no void columns. Additive and idempotent, so this also runs as a migration.
do $$
declare t text;
begin
  foreach t in array array[
    'vendor','purchase_order','invoice','payment','receiving_event','knowledge_note',
    'inventory_count','maintenance_asset','maintenance_task','insurance_policy','licence',
    'employee','pay_rate'
  ]
  loop
    execute format('alter table public.%I add column if not exists voided_at timestamptz;', t);
    execute format('alter table public.%I add column if not exists voided_by uuid references public.app_user(id);', t);
  end loop;
end $$;

-- Money-free views (ARCH-03). Staff screens read these instead of the tables that carry a dollar
-- figure: vendor_directory has every vendor column but the minimum order, invoice_due says which
-- invoices are open and when they fall due, insurance_renewal has policy names and dates. In the
-- demo they read the tables directly and the open policies apply. auth_setup.sql section 3e
-- replaces them, at the login cutover, with versions that return only the member's own store
-- while the tables themselves close to staff.
create or replace view public.vendor_directory with (security_invoker = true) as
  select v.id, v.store_id, v.department_id, v.name, v.rep_name, v.phone, v.email,
         v.products_we_carry, v.default_terms, v.status, v.notes, v.summer_order_timeline,
         v.order_location, v.order_location_other, v.reorder_status, v.reorder_comments,
         v.specializes_in, v.created_at, v.voided_at
  from public.vendor v;

create or replace view public.invoice_due with (security_invoker = true) as
  select i.id, i.store_id, i.vendor_id, i.invoice_number, i.terms, i.due_date, i.status, i.voided_at
  from public.invoice i;

create or replace view public.insurance_renewal with (security_invoker = true) as
  select p.id, p.store_id, p.name, p.renewal_date, p.voided_at
  from public.insurance_policy p;

grant select on public.vendor_directory, public.invoice_due, public.insurance_renewal
  to anon, authenticated;

-- DEV ONLY row-level security.
-- These policies allow the anon key to read and write so the demo runs without login.
-- Replace every one of these with Supabase Auth plus per-role policies before production.
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists dev_all on public.%I;', t);
    execute format('create policy dev_all on public.%I for all using (true) with check (true);', t);
  end loop;
end $$;

-- DEV ONLY storage access for the captured documents (invoice photos, payment confirmations).
-- Supabase enables row-level security on storage.objects, so without a policy even the anon key
-- cannot upload and every capture fails with "new row violates row-level security policy".
-- This opens the `documents` bucket for the demo exactly like dev_all opens the public tables.
-- auth_setup.sql replaces this with an authenticated-only policy at the production cutover.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "documents_dev_all" on storage.objects;
create policy "documents_dev_all" on storage.objects
  for all
  to public
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');
