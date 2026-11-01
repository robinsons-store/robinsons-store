-- Staff never see a dollar figure, enforced by the database and not only by the screens (ARCH-03).
-- The decision and the alternatives it rejected: docs/adr/ADR-003-money-by-role-at-the-database.md.
-- Runs from supabase/run-order.txt on every merge to main. Idempotent: safe to run again.
--
-- It does one of two things, decided by the database it runs on (the same test ai_call.sql uses):
--   Demo (the open dev_all policies are still on invoice): nothing is locked. It only creates the
--     three money-free views, reading the tables directly, so screens that use them work.
--   Enforced login (auth_setup.sql has run): exactly section 3e of auth_setup.sql. The nine tables
--     that carry a dollar figure open only to lead, manager and owner, the same rule as
--     canSeeMoney in src/lib/auth.ts; staff read three views with no dollar column instead.
--     Keep this and auth_setup.sql 3e identical; supabase/money_by_role_test.sql checks both.
--
-- Each mode is written as a function in pg_temp, which disappears when the session ends, so the
-- statements read as plain SQL rather than as strings passed to execute.

create or replace function pg_temp.money_by_role_demo()
returns void
language plpgsql
as $fn$
begin
  drop view if exists public.vendor_directory;
  drop view if exists public.invoice_due;
  drop view if exists public.insurance_renewal;

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
end;
$fn$;

create or replace function pg_temp.money_by_role_enforced()
returns void
language plpgsql
as $fn$
declare tbl text;
begin
  -- True only for a signed-in member whose role sees money. Unlinked, anonymous, or a role not
  -- on the list is false, so money fails closed here exactly as it does in the app.
  create or replace function app_auth.can_see_money()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  as $body$
    select coalesce(app_auth.my_role() in ('lead','manager','owner'), false);
  $body$;
  grant execute on function app_auth.can_see_money() to authenticated, anon;

  -- Tables with their own store_id: the store fence from 3a plus the money fence.
  foreach tbl in array array['vendor','purchase_order','invoice','credit_note','insurance_policy']
  loop
    if to_regclass('public.' || tbl) is null then
      raise notice 'money_by_role: table % not found, skipping (rerun after creating it)', tbl;
      continue;
    end if;
    execute format('drop policy if exists member_store_rw on public.%I;', tbl);
    execute format('drop policy if exists money_store_rw on public.%I;', tbl);
    execute format($f$
      create policy money_store_rw on public.%I
        for all
        to authenticated
        using (store_id = app_auth.my_store_id() and app_auth.can_see_money())
        with check (store_id = app_auth.my_store_id() and app_auth.can_see_money());
    $f$, tbl);
  end loop;

  -- payment via its vendor, falling back to the invoice link for legacy rows without vendor_id.
  drop policy if exists member_store_rw on public.payment;
  drop policy if exists money_store_rw on public.payment;
  create policy money_store_rw on public.payment
    for all
    to authenticated
    using (app_auth.can_see_money() and (
      exists (
        select 1 from public.vendor v
        where v.id = payment.vendor_id and v.store_id = app_auth.my_store_id())
      or exists (
        select 1 from public.invoice i
        where i.id = payment.invoice_id and i.store_id = app_auth.my_store_id())))
    with check (app_auth.can_see_money() and (
      exists (
        select 1 from public.vendor v
        where v.id = payment.vendor_id and v.store_id = app_auth.my_store_id())
      or exists (
        select 1 from public.invoice i
        where i.id = payment.invoice_id and i.store_id = app_auth.my_store_id())));

  -- payment_allocation via its payment's vendor or invoice. A write also needs the invoice it
  -- settles to be in the member's store, so a payment cannot be allocated across stores.
  drop policy if exists member_store_rw on public.payment_allocation;
  drop policy if exists money_store_rw on public.payment_allocation;
  create policy money_store_rw on public.payment_allocation
    for all
    to authenticated
    using (app_auth.can_see_money() and exists (
      select 1 from public.payment p
      left join public.vendor v on v.id = p.vendor_id
      left join public.invoice i on i.id = p.invoice_id
      where p.id = payment_allocation.payment_id
        and coalesce(v.store_id, i.store_id) = app_auth.my_store_id()))
    with check (app_auth.can_see_money() and exists (
      select 1 from public.payment p
      left join public.vendor v on v.id = p.vendor_id
      left join public.invoice i on i.id = p.invoice_id
      where p.id = payment_allocation.payment_id
        and coalesce(v.store_id, i.store_id) = app_auth.my_store_id())
      and exists (
      select 1 from public.invoice ai
      where ai.id = payment_allocation.invoice_id and ai.store_id = app_auth.my_store_id()));

  -- pay_rate via its employee. Pay, and PIPEDA personal data besides.
  drop policy if exists member_store_rw on public.pay_rate;
  drop policy if exists money_store_rw on public.pay_rate;
  create policy money_store_rw on public.pay_rate
    for all
    to authenticated
    using (app_auth.can_see_money() and exists (
      select 1 from public.employee e
      where e.id = pay_rate.employee_id and e.store_id = app_auth.my_store_id()))
    with check (app_auth.can_see_money() and exists (
      select 1 from public.employee e
      where e.id = pay_rate.employee_id and e.store_id = app_auth.my_store_id()));

  -- receiving_line via its receiving_event. Staff save captures, so any member of the store may
  -- add a line, unit cost included (it comes off the invoice in their hand), but only a money
  -- role reads, changes or removes one. Capture inserts without asking for the row back, so the
  -- insert needs no read.
  drop policy if exists member_store_rw on public.receiving_line;
  drop policy if exists money_store_rw on public.receiving_line;
  drop policy if exists member_store_insert on public.receiving_line;
  create policy money_store_rw on public.receiving_line
    for all
    to authenticated
    using (app_auth.can_see_money() and exists (
      select 1 from public.receiving_event e
      where e.id = receiving_line.receiving_event_id and e.store_id = app_auth.my_store_id()))
    with check (app_auth.can_see_money() and exists (
      select 1 from public.receiving_event e
      where e.id = receiving_line.receiving_event_id and e.store_id = app_auth.my_store_id()));
  create policy member_store_insert on public.receiving_line
    for insert
    to authenticated
    with check (exists (
      select 1 from public.receiving_event e
      where e.id = receiving_line.receiving_event_id and e.store_id = app_auth.my_store_id()));

  -- The three money-free views. Each reads through a definer function that returns only the
  -- caller's own store, so the view runs as the caller and is never itself a definer view.
  -- The functions live in app_auth, which the API does not expose, so nobody calls them directly.
  -- Dropped and made again on every run: create or replace cannot change a function's columns,
  -- so this is what lets a column be added to a view later.
  drop view if exists public.vendor_directory;
  drop view if exists public.invoice_due;
  drop view if exists public.insurance_renewal;
  drop function if exists app_auth.vendor_directory_rows();
  drop function if exists app_auth.invoice_due_rows();
  drop function if exists app_auth.insurance_renewal_rows();
  create or replace function app_auth.vendor_directory_rows()
  returns table (
    id uuid, store_id uuid, department_id uuid, name text, rep_name text, phone text, email text,
    products_we_carry text, default_terms text, status text, notes text,
    summer_order_timeline text, order_location text[], order_location_other text,
    reorder_status text, reorder_comments text, specializes_in text,
    created_at timestamptz, voided_at timestamptz)
  language sql
  stable
  security definer
  set search_path = public
  as $body$
    select v.id, v.store_id, v.department_id, v.name, v.rep_name, v.phone, v.email,
           v.products_we_carry, v.default_terms, v.status, v.notes, v.summer_order_timeline,
           v.order_location, v.order_location_other, v.reorder_status, v.reorder_comments,
           v.specializes_in, v.created_at, v.voided_at
    from public.vendor v
    where v.store_id = app_auth.my_store_id();
  $body$;

  create or replace function app_auth.invoice_due_rows()
  returns table (
    id uuid, store_id uuid, vendor_id uuid, invoice_number text, terms text, due_date date,
    status text, voided_at timestamptz)
  language sql
  stable
  security definer
  set search_path = public
  as $body$
    select i.id, i.store_id, i.vendor_id, i.invoice_number, i.terms, i.due_date, i.status, i.voided_at
    from public.invoice i
    where i.store_id = app_auth.my_store_id();
  $body$;

  create or replace function app_auth.insurance_renewal_rows()
  returns table (id uuid, store_id uuid, name text, renewal_date date, voided_at timestamptz)
  language sql
  stable
  security definer
  set search_path = public
  as $body$
    select p.id, p.store_id, p.name, p.renewal_date, p.voided_at
    from public.insurance_policy p
    where p.store_id = app_auth.my_store_id();
  $body$;

  revoke execute on function app_auth.vendor_directory_rows(), app_auth.invoice_due_rows(),
    app_auth.insurance_renewal_rows() from public, anon;
  grant execute on function app_auth.vendor_directory_rows(), app_auth.invoice_due_rows(),
    app_auth.insurance_renewal_rows() to authenticated;

  create or replace view public.vendor_directory with (security_invoker = true) as
    select * from app_auth.vendor_directory_rows();
  create or replace view public.invoice_due with (security_invoker = true) as
    select * from app_auth.invoice_due_rows();
  create or replace view public.insurance_renewal with (security_invoker = true) as
    select * from app_auth.insurance_renewal_rows();

  revoke all on public.vendor_directory, public.invoice_due, public.insurance_renewal
    from anon, authenticated;
  grant select on public.vendor_directory, public.invoice_due, public.insurance_renewal
    to authenticated;
end;
$fn$;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice' and policyname = 'dev_all') then
    perform pg_temp.money_by_role_demo();
  else
    perform pg_temp.money_by_role_enforced();
  end if;
end $$;
