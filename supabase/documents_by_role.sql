-- Stored files are fenced by store and by role, enforced by the database (ARCH-04).
-- The decision and the alternatives it rejected: docs/adr/ADR-004-stored-files-by-store-and-role.md.
-- Runs from supabase/run-order.txt on every merge to main, after money_by_role.sql, whose
-- app_auth.can_see_money() it uses. Idempotent: safe to run again.
--
-- It does one of two things, decided by the database it runs on (the same test money_by_role.sql
-- uses):
--   Demo (the open dev_all policies are still on invoice): nothing changes. The documents bucket
--     stays open for the demo, and the app's store folders save and read under that policy.
--   Enforced login (auth_setup.sql has run): exactly sections 3d and 3f of auth_setup.sql. Files
--     are saved under <store_id>/<kind>/; a member opens only their own store's files, invoice
--     photos only as lead, manager or owner, suggestion files also when they attached them, and
--     the workbook archive only as owner or manager. Older files are recorded with their store
--     once, so none has to move. Keep this and auth_setup.sql 3d and 3f identical;
--     supabase/documents_by_role_test.sql checks both.
--
-- Each mode is written as a function in pg_temp, which disappears when the session ends, so the
-- statements read as plain SQL rather than as strings passed to execute.

create or replace function pg_temp.documents_by_role_demo()
returns void
language plpgsql
as $fn$
begin
  raise notice 'documents_by_role: demo database, the documents bucket stays open';
end;
$fn$;

create or replace function pg_temp.documents_by_role_enforced()
returns void
language plpgsql
as $fn$
declare recorded integer;
begin
  -- 3d. The bucket is private; the app reads every stored file through signed, expiring URLs.
  insert into storage.buckets (id, name, public)
  values ('documents', 'documents', false)
  on conflict (id) do update set public = excluded.public;

  -- 3f. Files saved before the store folders keep their old names: <department_id>/<file>,
  -- feedback/<file> and imports/<file>. Rather than move them, each is recorded once here with
  -- the store it belongs to. Members can neither read nor write this table, and nothing a member
  -- saves later adds to it. Row-level security is on with no policy: only its owner, which runs
  -- this script and the functions below, reads it.
  create table if not exists app_auth.legacy_document (
    name text primary key,
    kind text not null check (kind in ('invoices', 'feedback', 'imports')),
    store_id uuid
  );
  alter table app_auth.legacy_document enable row level security;
  revoke all on app_auth.legacy_document from public, anon, authenticated;

  -- Records every older file not yet recorded, with its store: a photo's department; otherwise
  -- the store of the member who uploaded it; otherwise, for a suggestion file, the store of the
  -- one suggestion that names it; otherwise the only store, when the database has just one. When
  -- none of those settles it, the store stays empty and nobody opens the file in the app.
  create or replace function app_auth.record_legacy_documents()
  returns integer
  language sql
  security definer
  set search_path = public
  as $body$
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
  $body$;
  revoke execute on function app_auth.record_legacy_documents() from public, anon, authenticated;
  recorded := app_auth.record_legacy_documents();
  raise notice 'documents_by_role: % older files recorded', recorded;

  -- Whether the signed-in member may open a stored file, from its name and who uploaded it. The
  -- store and kind come from the name's first two folders or, for an older file, from
  -- app_auth.legacy_document. Store ids are compared as text, so a malformed name matches nothing.
  create or replace function app_auth.can_open_document(object_name text, uploader text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  as $body$
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
  $body$;

  -- Whether the signed-in member may save a file under this name: only into their own store's
  -- folder and one of the three kind folders, a workbook only as an owner or manager, and never
  -- under an older-style name.
  create or replace function app_auth.can_save_document(object_name text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  as $body$
    select coalesce(
      object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(invoices|feedback|imports)/.'
      and split_part(object_name, '/', 1) = app_auth.my_store_id()::text
      and (split_part(object_name, '/', 2) <> 'imports' or app_auth.my_role() in ('owner', 'manager')),
      false);
  $body$;

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
end;
$fn$;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice' and policyname = 'dev_all') then
    perform pg_temp.documents_by_role_demo();
  else
    perform pg_temp.documents_by_role_enforced();
  end if;
end $$;
