-- Which questions each department's vendor and invoice forms ask, as the owner
-- chose them on the Department fields screen (src/app/department-fields).
-- Run once in the Supabase SQL editor. Idempotent: safe to run again.
--
-- One row is one tick box: this department, this form, this question, asked or not. A
-- department with no rows asks exactly what the code lists in src/lib/vendorFields.ts and
-- src/lib/invoiceFields.ts say, so an empty table changes nothing on any screen. Rows are
-- only written when somebody changes a box, and a change is an update, never a delete.
--
-- Sections (Clothing, Gifts, Garden Center) have no rows of their own: they follow the
-- department above them, which the app resolves through department.parent_department_id.
--
-- Payment fields are not here. The form check below is the place to add 'payment' when the
-- requester names which payment questions should vary.
create table if not exists public.department_field (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.store(id),
  department_id uuid not null references public.department(id),
  form text not null check (form in ('vendor','invoice')),
  field_key text not null,
  asked boolean not null,
  updated_by uuid references public.app_user(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (department_id, form, field_key)
);
create index if not exists department_field_store_idx on public.department_field(store_id);

-- Row-level security. The demo database gets the open dev policy like every other table.
-- A database with login on gets its real policies here as well, rather than waiting for
-- somebody to rerun auth_setup.sql: until then the table would deny everyone, the forms
-- would fall back to the code lists, and the settings screen could not save. Every member
-- of the store reads the choices, because every form needs them. Only the owner
-- writes them, and only for a department of their own store. Nobody deletes.
alter table public.department_field enable row level security;
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice' and policyname = 'dev_all') then
    drop policy if exists dev_all on public.department_field;
    create policy dev_all on public.department_field for all using (true) with check (true);
  elsif to_regprocedure('app_auth.my_store_id()') is not null and to_regprocedure('app_auth.my_role()') is not null then
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
  end if;
end $$;
