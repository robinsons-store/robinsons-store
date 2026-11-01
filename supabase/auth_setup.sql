-- Robinsons General Store, production auth and row-level security cutover.
--
-- WHAT THIS IS
-- This file is the deliberate production cutover. It links Supabase Auth to app_user and
-- replaces the dev "anonymous full access" policies with authenticated, per-store, per-role
-- policies. The owner runs it once, after enabling Email auth and creating the owner account.
-- It is intentionally NOT part of schema.sql so the demo keeps its open dev policies until
-- you choose to cut over. schema.sql still ships the dev_all DO-block for the demo.
--
-- ORDER OF OPERATIONS (see RUNBOOK.md "Turn on login"):
--   1. Enable Email auth in Supabase (Authentication, Providers, Email). No public sign-up.
--   2. Create one account per member (Authentication, Users, Add user), each with the SAME email
--      as its app_user row. The demo emails are owner@/manager@/staff@/lead@robinsons.demo.
--   3. Run this whole file in the SQL editor. Section 4 links every account to its app_user row
--      automatically, by email. Re-run it any time you add more accounts (it is idempotent).
--   4. Set NEXT_PUBLIC_REQUIRE_AUTH=true in Vercel and redeploy.
--
-- supabase/money_by_role_test.sql, documents_by_role_test.sql, feedback_summary_test.sql test it.
-- TEST BEFORE TRUSTING: sign in as one owner and one staff and confirm staff cannot read
-- another store's rows and cannot see costs. RLS is only as good as its test.
--
-- This script is idempotent: re-running it drops and recreates the policies and functions.

-- 1. Link auth.users to app_user. Nullable so existing demo rows stay valid until linked.
alter table public.app_user
  add column if not exists auth_id uuid unique references auth.users(id);

-- 1a. The email used to match a Supabase Auth account to its app_user row. Added defensively so
-- this script also works on a database created before email was part of schema.sql.
alter table public.app_user
  add column if not exists email text;

-- 1b. Demo email backfill. Sets the known demo emails on the seeded members only where the email
-- is still null, so auto-linking (section 4) works even if seed.sql was loaded before emails were
-- added. Harmless on a fresh seed (the emails already match) and safe to keep: it never overwrites.
update public.app_user set email = 'owner@robinsons.demo'   where full_name = 'Ravi Kiran'   and email is null;
update public.app_user set email = 'manager@robinsons.demo' where full_name = 'Demo Manager' and email is null;
update public.app_user set email = 'staff@robinsons.demo'   where full_name = 'Demo Staff'    and email is null;
update public.app_user set email = 'lead@robinsons.demo'    where full_name = 'Outpost Lead'  and email is null;

-- 2. Helper functions in a dedicated, safe schema (not public, so they are not exposed as
-- PostgREST RPC by default). They are SECURITY DEFINER and STABLE with a pinned search_path.
-- SECURITY DEFINER lets them read app_user without being subject to RLS, which both avoids
-- recursive policy evaluation (a policy on app_user that needs to read app_user) and keeps
-- the lookup cheap. They key off auth.uid(), the id of the currently signed-in auth user.
create schema if not exists app_auth;

-- The app_user row for the current auth user, or no row when unauthenticated or unlinked.
create or replace function app_auth.app_member()
returns public.app_user
language sql
stable
security definer
set search_path = public
as $$
  select u.* from public.app_user u where u.auth_id = auth.uid() limit 1;
$$;

-- The current member's store id, or null when unauthenticated or unlinked. A null compared
-- to any store_id is NULL (not true), so every per-store policy denies by default. Safe.
create or replace function app_auth.my_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select store_id from public.app_user where auth_id = auth.uid() limit 1;
$$;

-- The current member's role, or null when unauthenticated or unlinked.
create or replace function app_auth.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.app_user where auth_id = auth.uid() limit 1;
$$;

-- Let signed-in users execute the helpers. anon keeps execute too so the helpers simply
-- return null/no-row for an unauthenticated caller rather than erroring.
grant usage on schema app_auth to authenticated, anon;
grant execute on function app_auth.app_member() to authenticated, anon;
grant execute on function app_auth.my_store_id() to authenticated, anon;
grant execute on function app_auth.my_role() to authenticated, anon;

-- 3. Replace the dev_all policies with authenticated, per-store, per-role policies.
-- Every table keeps RLS enabled. We drop dev_all first so anonymous full access is gone.
-- A table left with RLS on and no policy denies all access by design; we cover every table.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists dev_all on public.%I;', t);
  end loop;
end $$;

-- 3a. Store-scoped tables with a direct store_id column. A signed-in member may select and
-- write rows whose store_id equals their store. USING gates reads and the pre-image of
-- writes; WITH CHECK gates the post-image so a row cannot be moved to another store.
-- The tables that carry a dollar figure (vendor, purchase_order, invoice, insurance_policy,
-- credit_note) are NOT in this array: they get the same store fence plus a money fence in 3e.
-- Adding one of them back here would reopen its amounts to staff.
do $$
declare t text;
begin
  foreach t in array array[
    'item','receiving_event',
    'inventory_count','knowledge_note','maintenance_asset','maintenance_task',
    'employee','licence','feedback'
  ]
  loop
    -- Skip tables that do not exist yet (for example credit_note before credit_notes.sql has
    -- run). Without this guard the script would abort here AFTER dropping every dev policy,
    -- leaving the database deny-all; with it, rerunning after the table arrives covers it.
    if to_regclass('public.' || t) is null then
      raise notice 'auth_setup: table % not found, skipping (rerun after creating it)', t;
      continue;
    end if;
    execute format('drop policy if exists member_store_rw on public.%I;', t);
    execute format($f$
      create policy member_store_rw on public.%I
        for all
        to authenticated
        using (store_id = app_auth.my_store_id())
        with check (store_id = app_auth.my_store_id());
    $f$, t);
  end loop;
end $$;

-- ai_call (3a, its own block): store-scoped like the tables above but kept out of that array,
-- which lets every member read and write. Only the owner reads their store's rows. Nobody
-- writes the table directly: an AI call reserves and finishes its row through
-- public.ai_call_begin and public.ai_call_finish (supabase/ai_call.sql), which run as definer,
-- stamp the caller's own store, and are the only way a staff call counts against the cap.
-- Anonymous callers get no execute on them: once login is on, every AI route already
-- requires a signed-in member.
do $$
begin
  if to_regclass('public.ai_call') is null then
    raise notice 'auth_setup: table ai_call not found, skipping (rerun after creating it)';
    return;
  end if;
  drop policy if exists owner_read on public.ai_call;
  create policy owner_read on public.ai_call
    for select
    to authenticated
    using (store_id = app_auth.my_store_id() and app_auth.my_role() = 'owner');
  revoke execute on function public.ai_call_begin(uuid, text, text, integer) from public, anon;
  revoke execute on function public.ai_call_finish(uuid, text, text, text, integer, integer, integer, integer, integer) from public, anon;
  grant execute on function public.ai_call_begin(uuid, text, text, integer) to authenticated;
  grant execute on function public.ai_call_finish(uuid, text, text, text, integer, integer, integer, integer, integer) to authenticated;
end $$;

-- department_field (3a, its own block): store-scoped like the tables above but kept out of
-- that array, which lets every member write. Every member reads the choices because every
-- vendor and invoice form needs them; only the owner changes them, and only for a
-- department of their own store. No delete policy: a choice is changed, never removed.
-- supabase/department_field.sql applies the same policies to a live database with login on.
do $$
begin
  if to_regclass('public.department_field') is null then
    raise notice 'auth_setup: table department_field not found, skipping (rerun after creating it)';
    return;
  end if;
  drop policy if exists member_read on public.department_field;
  create policy member_read on public.department_field
    for select
    to authenticated
    using (store_id = app_auth.my_store_id());
  drop policy if exists manager_insert on public.department_field;
  drop policy if exists owner_insert on public.department_field;
  create policy owner_insert on public.department_field
    for insert
    to authenticated
    with check (
      store_id = app_auth.my_store_id()
      and app_auth.my_role() = 'owner'
      and exists (select 1 from public.department d
                  where d.id = department_field.department_id and d.store_id = department_field.store_id));
  drop policy if exists manager_update on public.department_field;
  drop policy if exists owner_update on public.department_field;
  create policy owner_update on public.department_field
    for update
    to authenticated
    using (store_id = app_auth.my_store_id() and app_auth.my_role() = 'owner')
    with check (
      store_id = app_auth.my_store_id()
      and app_auth.my_role() = 'owner'
      and exists (select 1 from public.department d
                  where d.id = department_field.department_id and d.store_id = department_field.store_id));
end $$;

-- 3b. Child tables with no store_id of their own. Scope through the parent so a member only
-- reaches rows that roll up to their store. Membership is enforced at the parent.
-- receiving_line, payment, payment_allocation and pay_rate carry dollar figures and are in 3e.

-- inventory_count_line via its inventory_count.
drop policy if exists member_store_rw on public.inventory_count_line;
create policy member_store_rw on public.inventory_count_line
  for all
  to authenticated
  using (exists (
    select 1 from public.inventory_count c
    where c.id = inventory_count_line.inventory_count_id and c.store_id = app_auth.my_store_id()))
  with check (exists (
    select 1 from public.inventory_count c
    where c.id = inventory_count_line.inventory_count_id and c.store_id = app_auth.my_store_id()));

-- shift via its employee. PIPEDA personal data, kept inside the member's store.
drop policy if exists member_store_rw on public.shift;
create policy member_store_rw on public.shift
  for all
  to authenticated
  using (exists (
    select 1 from public.employee e
    where e.id = shift.employee_id and e.store_id = app_auth.my_store_id()))
  with check (exists (
    select 1 from public.employee e
    where e.id = shift.employee_id and e.store_id = app_auth.my_store_id()));

-- retail_price via its item. Not named in the cutover list, but RLS-on with no policy would
-- deny it for everyone, so scope it through item like the other store-scoped children.
drop policy if exists member_store_rw on public.retail_price;
create policy member_store_rw on public.retail_price
  for all
  to authenticated
  using (exists (
    select 1 from public.item it
    where it.id = retail_price.item_id and it.store_id = app_auth.my_store_id()))
  with check (exists (
    select 1 from public.item it
    where it.id = retail_price.item_id and it.store_id = app_auth.my_store_id()));

-- 3c. Reference and shared tables.

-- department: readable by any member of the store. Writes scoped to the member's store
-- (the cutover only restricts app_user and store writes to manager/owner; department edits
-- stay open to members of the store, but never cross-store).
drop policy if exists member_store_read on public.department;
create policy member_store_read on public.department
  for select
  to authenticated
  using (store_id = app_auth.my_store_id());
drop policy if exists member_store_write on public.department;
create policy member_store_write on public.department
  for all
  to authenticated
  using (store_id = app_auth.my_store_id())
  with check (store_id = app_auth.my_store_id());

-- store: readable by its members. Writes restricted to managers and owners of that store.
drop policy if exists member_store_read on public.store;
create policy member_store_read on public.store
  for select
  to authenticated
  using (id = app_auth.my_store_id());
drop policy if exists manager_store_write on public.store;
create policy manager_store_write on public.store
  for all
  to authenticated
  using (id = app_auth.my_store_id() and app_auth.my_role() in ('manager','owner'))
  with check (id = app_auth.my_store_id() and app_auth.my_role() in ('manager','owner'));

-- app_user: every member can read their store's roster. Only managers and owners of the
-- store may insert, update, or delete members, and only within their own store. NOTE: the
-- first owner's app_user.auth_id is set by the auto-link in section 4, which runs as the table
-- owner in the SQL editor and bypasses RLS, so it bootstraps access before anyone is linked.
drop policy if exists member_store_read on public.app_user;
create policy member_store_read on public.app_user
  for select
  to authenticated
  using (store_id = app_auth.my_store_id());
drop policy if exists manager_store_write on public.app_user;
create policy manager_store_write on public.app_user
  for all
  to authenticated
  using (store_id = app_auth.my_store_id() and app_auth.my_role() in ('manager','owner'))
  with check (store_id = app_auth.my_store_id() and app_auth.my_role() in ('manager','owner'));

-- tax_rules: global reference data (province rates), readable by any signed-in member.
-- Conservative choice: writes restricted to managers and owners. The cutover spec only names
-- app_user and store for the manager/owner write limit, but the tax rate drives every total,
-- so we deny edits to staff and leads rather than over-expose. Adjust if a broader write is
-- wanted. (Noted in the PR.)
drop policy if exists member_read on public.tax_rules;
create policy member_read on public.tax_rules
  for select
  to authenticated
  using (true);
drop policy if exists manager_write on public.tax_rules;
create policy manager_write on public.tax_rules
  for all
  to authenticated
  using (app_auth.my_role() in ('manager','owner'))
  with check (app_auth.my_role() in ('manager','owner'));

-- activity_log: the audit trail. activity_log has no store_id, only actor_id. A member may
-- read entries whose actor belongs to their store, and may insert only entries attributed to
-- themselves, so the log cannot be forged for another member or store. No update or delete
-- policy is defined, so the audit trail is append-only for members (the service role, used by
-- migrations and server jobs, still bypasses RLS).
drop policy if exists member_store_read on public.activity_log;
create policy member_store_read on public.activity_log
  for select
  to authenticated
  using (exists (
    select 1 from public.app_user a
    where a.id = activity_log.actor_id and a.store_id = app_auth.my_store_id()));
drop policy if exists member_insert_self on public.activity_log;
create policy member_insert_self on public.activity_log
  for insert
  to authenticated
  with check (actor_id = (app_auth.app_member()).id);

-- 3d. Storage. The `documents` bucket goes PRIVATE here: the app reads every stored file through
-- signed, expiring URLs (src/lib/docs.ts), so no permanent public link to an invoice photo exists
-- and a logged-out visitor gets nothing. Who may save and open which file is section 3f, after
-- 3e, because it uses app_auth.can_see_money().
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = excluded.public;

-- 3e. Money by role (ARCH-03; docs/adr/ADR-003-money-by-role-at-the-database.md). Every signed-in
-- member shares the one authenticated Postgres role, so a column cannot be shown to one member
-- and hidden from another. Instead the rows of the nine tables that carry a dollar figure open
-- only to a role that sees money, the same rule as canSeeMoney in src/lib/auth.ts: lead,
-- manager, owner. Staff, and a member whose role is missing, get no rows, and the payment
-- functions (security invoker) refuse them for the same reason. Staff screens read what they
-- still need through three views that carry no dollar column. supabase/money_by_role.sql
-- applies this same section to a live database: change both together.

-- True only for a signed-in member whose role sees money. Unlinked, anonymous, or a role not
-- on the list is false, so money fails closed here exactly as it does in the app.
create or replace function app_auth.can_see_money()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app_auth.my_role() in ('lead','manager','owner'), false);
$$;
grant execute on function app_auth.can_see_money() to authenticated, anon;

-- Tables with their own store_id: the store fence from 3a plus the money fence.
do $$
declare tbl text;
begin
  foreach tbl in array array['vendor','purchase_order','invoice','credit_note','insurance_policy']
  loop
    if to_regclass('public.' || tbl) is null then
      raise notice 'auth_setup: table % not found, skipping (rerun after creating it)', tbl;
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
end $$;

-- payment via its vendor (payments can exist without an invoice, e.g. a deposit or
-- prepayment), falling back to the invoice link for legacy rows without vendor_id.
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
--   vendor_directory    every vendor column except the minimum order (Capture, Ask)
--   invoice_due         which invoices are open and when they fall due (the bell, Due)
--   insurance_renewal   policy names and renewal dates (the bell, Compliance)
-- The views and functions are dropped and made again on every run: create or replace cannot
-- change a function's columns, so this is what lets a column be added to a view later.
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
as $$
  select v.id, v.store_id, v.department_id, v.name, v.rep_name, v.phone, v.email,
         v.products_we_carry, v.default_terms, v.status, v.notes, v.summer_order_timeline,
         v.order_location, v.order_location_other, v.reorder_status, v.reorder_comments,
         v.specializes_in, v.created_at, v.voided_at
  from public.vendor v
  where v.store_id = app_auth.my_store_id();
$$;

create or replace function app_auth.invoice_due_rows()
returns table (
  id uuid, store_id uuid, vendor_id uuid, invoice_number text, terms text, due_date date,
  status text, voided_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.store_id, i.vendor_id, i.invoice_number, i.terms, i.due_date, i.status, i.voided_at
  from public.invoice i
  where i.store_id = app_auth.my_store_id();
$$;

create or replace function app_auth.insurance_renewal_rows()
returns table (id uuid, store_id uuid, name text, renewal_date date, voided_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.store_id, p.name, p.renewal_date, p.voided_at
  from public.insurance_policy p
  where p.store_id = app_auth.my_store_id();
$$;

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

-- 3f. Stored files by store and role (ARCH-04; docs/adr/ADR-004-stored-files-by-store-and-role.md).
-- Supabase enables row-level security on storage.objects, so every upload, signed URL, download
-- and listing passes the two policies below. The app saves each file under its store's folder,
-- then a folder for its kind (src/lib/documentPath.ts):
--   <store_id>/invoices/<department_id>/<file>   Capture's invoice photos
--   <store_id>/feedback/<file>                   Suggestions' screenshots and voice notes
--   <store_id>/imports/<file>                    the archive of imported workbooks
-- A member opens only their own store's files, and by kind:
--   invoices   lead, manager, owner: an invoice shows prices, so the money rule of 3e applies
--   feedback   lead, manager, owner, and the member who attached it
--   imports    owner and manager, the roles that may import
-- Any member saves an invoice photo or a suggestion file, so Capture works for staff, who upload
-- the invoice in their hand without opening it again; only an owner or manager saves a workbook.
-- No policy lets a member change or delete a stored file. supabase/documents_by_role.sql applies
-- 3d and this section to a live database: change them together.

-- Files saved before the store folders keep their old names: <department_id>/<file>,
-- feedback/<file> and imports/<file>. Rather than move them, each is recorded once here with the
-- store it belongs to. Members can neither read nor write this table, and nothing a member saves
-- later adds to it. Row-level security is on with no policy: only its owner, which runs this
-- script and the functions below, reads it.
create table if not exists app_auth.legacy_document (
  name text primary key,
  kind text not null check (kind in ('invoices', 'feedback', 'imports')),
  store_id uuid
);
alter table app_auth.legacy_document enable row level security;
revoke all on app_auth.legacy_document from public, anon, authenticated;

-- Records every older file not yet recorded, with its store: a photo's department; otherwise the
-- store of the member who uploaded it; otherwise, for a suggestion file, the store of the one
-- suggestion that names it; otherwise the only store, when the database has just one. When none
-- of those settles it, the store stays empty and nobody opens the file in the app.
create or replace function app_auth.record_legacy_documents()
returns integer
language sql
security definer
set search_path = public
as $$
  with recorded as (
    insert into app_auth.legacy_document (name, kind, store_id)
    select o.name, k.kind, coalesce(
        case when k.kind = 'invoices' then
          (select d.store_id from public.department d where d.id::text = split_part(o.name, '/', 1))
        end,
        (select u.store_id from public.app_user u where u.auth_id::text = o.owner_id),
        case when k.kind = 'feedback' then
          (select min(f.store_id::text)::uuid from public.feedback f
           where o.name in (f.screenshot_path, f.audio_path)
           having count(distinct f.store_id) = 1)
        end,
        (select s.id from public.store s where (select count(*) from public.store) = 1))
    from storage.objects o
    cross join lateral (select case
        when o.name like 'feedback/%' then 'feedback'
        when o.name like 'imports/%' then 'imports'
        when o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$' then 'invoices'
      end as kind) k
    where o.bucket_id = 'documents' and k.kind is not null
    on conflict (name) do nothing
    returning 1)
  select count(*)::integer from recorded;
$$;
revoke execute on function app_auth.record_legacy_documents() from public, anon, authenticated;
select app_auth.record_legacy_documents() as older_files_recorded;

-- Whether the signed-in member may open a stored file, from its name and who uploaded it. The
-- store and kind come from the name's first two folders or, for an older file, from
-- app_auth.legacy_document. Store ids are compared as text, so a malformed name matches nothing.
create or replace function app_auth.can_open_document(object_name text, uploader text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(bool_or(
      f.store_id = app_auth.my_store_id()::text
      and case f.kind
        when 'invoices' then app_auth.can_see_money()
        when 'feedback' then app_auth.can_see_money() or uploader = auth.uid()::text
        when 'imports' then app_auth.my_role() in ('owner', 'manager')
        else false
      end), false)
  from (
    select split_part(object_name, '/', 1) as store_id, split_part(object_name, '/', 2) as kind
    where object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(invoices|feedback|imports)/.'
    union all
    select l.store_id::text, l.kind from app_auth.legacy_document l where l.name = object_name
  ) f;
$$;

-- Whether the signed-in member may save a file under this name: only into their own store's
-- folder and one of the three kind folders, a workbook only as an owner or manager, and never
-- under an older-style name.
create or replace function app_auth.can_save_document(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(invoices|feedback|imports)/.'
    and split_part(object_name, '/', 1) = app_auth.my_store_id()::text
    and (split_part(object_name, '/', 2) <> 'imports' or app_auth.my_role() in ('owner', 'manager')),
    false);
$$;

revoke execute on function app_auth.can_open_document(text, text), app_auth.can_save_document(text)
  from public, anon;
grant execute on function app_auth.can_open_document(text, text), app_auth.can_save_document(text)
  to authenticated;

drop policy if exists "documents_dev_all" on storage.objects;
drop policy if exists "documents_auth_rw" on storage.objects;
drop policy if exists "documents_open" on storage.objects;
drop policy if exists "documents_save" on storage.objects;
create policy "documents_open" on storage.objects
  for select
  to authenticated
  using (bucket_id = 'documents' and app_auth.can_open_document(name, owner_id));
create policy "documents_save" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'documents' and app_auth.can_save_document(name));

-- 3g. Screenshot descriptions follow the screenshot (docs/adr/ADR-005-screenshot-descriptions-follow-the-screenshot.md).
-- When a suggestion has a screenshot, /api/feedback-triage has the AI describe it and saves the
-- text in public.feedback_summary, not on the suggestion, which every member of the store reads
-- (3a). A description opens to the members of its store who may open the file it was read from
-- (3f): for a suggestion screenshot, lead, manager, owner and the member who attached it. The
-- table, its save date and the move of older descriptions off feedback.ai_summary are the same as
-- in supabase/feedback_summary.sql, which applies this section to a live database: change both
-- together. supabase/feedback_summary_test.sql checks it.

-- screenshot_path is the stored file the description was read from, kept on this row so that
-- who may read the description follows that file, whatever later happens to the suggestion.
create table if not exists public.feedback_summary (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null unique references public.feedback(id),
  store_id uuid references public.store(id),
  screenshot_path text,
  summary text not null,
  created_at timestamptz default now()
);
create index if not exists feedback_summary_store_idx on public.feedback_summary(store_id);
alter table public.feedback_summary enable row level security;

-- The database dates every save, whatever the writer sends, so a description read again from a
-- replacement screenshot counts that file and its uploader keeps reading it.
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

-- Copies any description saved on feedback.ai_summary before this table existed into it, once,
-- dated now, then drops that column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'feedback' and column_name = 'ai_summary'
  ) then
    insert into public.feedback_summary (feedback_id, store_id, screenshot_path, summary)
      select f.id, f.store_id, f.screenshot_path, f.ai_summary
      from public.feedback f
      where nullif(btrim(f.ai_summary), '') is not null
      on conflict (feedback_id) do nothing;
    alter table public.feedback drop column ai_summary;
  end if;
end $$;

-- Whether the signed-in member may read the description of this screenshot: a member of the
-- description's store who may open the file it was read from (3f), which for a suggestion file
-- means lead, manager, owner and the member who attached it. Only the file saved under that name
-- by the time the description was saved counts. A description whose file is not found that way,
-- or that names no file, opens to nobody.
create or replace function app_auth.can_read_screenshot_summary(
  summary_store uuid, path text, written_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(bool_or(
      summary_store = app_auth.my_store_id()
      and app_auth.can_open_document(o.name, o.owner_id)), false)
  from storage.objects o
  where o.bucket_id = 'documents' and o.name = path and o.created_at <= written_at;
$$;
revoke execute on function app_auth.can_read_screenshot_summary(uuid, text, timestamptz)
  from public, anon;
grant execute on function app_auth.can_read_screenshot_summary(uuid, text, timestamptz)
  to authenticated;

-- Whoever may read a description may write it, for the suggestion it belongs to and the file that
-- suggestion names, dated by the database, so the reader runs as the member who asked for it.
-- No policy lets a member remove one.
drop policy if exists dev_all on public.feedback_summary;
drop policy if exists member_store_rw on public.feedback_summary;
drop policy if exists feedback_summary_read on public.feedback_summary;
drop policy if exists feedback_summary_save on public.feedback_summary;
drop policy if exists feedback_summary_resave on public.feedback_summary;
create policy feedback_summary_read on public.feedback_summary
  for select
  to authenticated
  using (app_auth.can_read_screenshot_summary(store_id, screenshot_path, created_at));
create policy feedback_summary_save on public.feedback_summary
  for insert
  to authenticated
  with check (app_auth.can_read_screenshot_summary(store_id, screenshot_path, created_at)
    and created_at <= now()
    and exists (
      select 1 from public.feedback f
      where f.id = feedback_summary.feedback_id
        and f.store_id = feedback_summary.store_id
        and f.screenshot_path = feedback_summary.screenshot_path));
create policy feedback_summary_resave on public.feedback_summary
  for update
  to authenticated
  using (app_auth.can_read_screenshot_summary(store_id, screenshot_path, created_at))
  with check (app_auth.can_read_screenshot_summary(store_id, screenshot_path, created_at)
    and created_at <= now()
    and exists (
      select 1 from public.feedback f
      where f.id = feedback_summary.feedback_id
        and f.store_id = feedback_summary.store_id
        and f.screenshot_path = feedback_summary.screenshot_path));

-- 4. Link Supabase Auth accounts to app_user rows BY EMAIL. Run this AFTER you create each
-- account in Authentication, Users with the same email as the app_user row (the demo emails are
-- in section 1b and seed.sql). This runs as the table owner in the SQL editor, which bypasses
-- RLS, so it bootstraps access before anyone is linked. Idempotent: re-run it after adding more
-- accounts. Case-insensitive match. A member with no auth_id cannot sign in to any store's data
-- (every policy denies), which is the safe default.
update public.app_user u
  set auth_id = a.id
  from auth.users a
  where lower(a.email) = lower(u.email)
    and u.auth_id is distinct from a.id;

-- Verify the links took (every member you created an account for should show an auth_id):
--   select full_name, role, store_id, email, auth_id from public.app_user order by full_name;
--
-- Manual fallback, if you ever need to link one row by hand (e.g. an email that does not match):
--   select id, email from auth.users order by created_at desc;   -- find the auth user id
--   update public.app_user set auth_id = '<auth.users.id>' where full_name = 'Ravi Kiran';
