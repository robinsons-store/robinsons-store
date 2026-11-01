-- Proves ARCH-04 at the database: a member opens only their own store's stored files, invoice
-- photos only as lead, manager or owner, suggestion files also when they attached them, and the
-- workbook archive only as owner or manager; any member still saves an invoice photo or a
-- suggestion file into their own store's folder, nobody saves anywhere else, and nobody changes
-- or deletes a stored file. Files saved before the store folders are recorded with the right
-- store. docs/adr/ADR-004-stored-files-by-store-and-role.md says why it is built this way.
--
-- Run it on a DISPOSABLE database, never the store's, with the storage schema that Supabase's
-- storage service creates (a local Supabase stack has it):
--   psql "<disposable database>" -v ON_ERROR_STOP=1 -f supabase/documents_by_role_test.sql
-- It makes its own two stores, members, suggestions and stored-file rows, including rows in
-- auth.users and storage.objects, inside one transaction and rolls every one of them back. It
-- writes no file contents. It is not in run-order.txt, so the migration workflow never runs it.
--
-- Two kinds of database:
--   enforced login (auth_setup.sql has run): the full role, store and path matrix below.
--   demo (dev_all still open): only that the bucket stays open and the store folders work.
-- Prints one row per check, then fails with the names of any check that did not pass.

begin;

create temp table check_result (n serial, name text, expected text, actual text);
create temp table mode as
  select not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoice' and policyname = 'dev_all') as enforced;

-- Who to act as. Store A has an owner, a manager, a lead and two staff; store B has an owner.
-- "unlinked" is a signed-in account with no member row; "anon" is nobody signed in.
create temp table actor (name text primary key, auth_id uuid, store_id uuid, role text);
insert into actor values
  ('owner',    'a0400000-0000-4000-8000-0000000000a1', 'a0400000-0000-4000-8000-00000000000a', 'owner'),
  ('manager',  'a0400000-0000-4000-8000-0000000000a2', 'a0400000-0000-4000-8000-00000000000a', 'manager'),
  ('lead',     'a0400000-0000-4000-8000-0000000000a3', 'a0400000-0000-4000-8000-00000000000a', 'lead'),
  ('staff',    'a0400000-0000-4000-8000-0000000000a4', 'a0400000-0000-4000-8000-00000000000a', 'staff'),
  ('staff2',   'a0400000-0000-4000-8000-0000000000a5', 'a0400000-0000-4000-8000-00000000000a', 'staff'),
  ('owner_b',  'a0400000-0000-4000-8000-0000000000b1', 'a0400000-0000-4000-8000-00000000000b', 'owner'),
  ('unlinked', 'a0400000-0000-4000-8000-0000000000c1', null, null),
  ('anon',     null, null, null);

-- Short names for the two stores' folders and departments.
create temp table place (key text primary key, value text);
insert into place values
  ('A',  'a0400000-0000-4000-8000-00000000000a'),
  ('B',  'a0400000-0000-4000-8000-00000000000b'),
  ('dA', 'a0400000-0000-4000-8001-00000000000a'),
  ('dB', 'a0400000-0000-4000-8001-00000000000b');
create function pg_temp.p(p_key text) returns text language sql as $$
  select value from place where key = p_key;
$$;

-- The stored files. "uploader" is the actor whose account saved it (null: saved before login
-- was on); "openers" is who may open it. The older-style names (legacy) are recorded by
-- app_auth.record_legacy_documents below, the way the migration records the store's own.
create temp table doc (key text primary key, name text, uploader text, legacy boolean, openers text);
insert into doc values
  ('A invoice photo',          pg_temp.p('A') || '/invoices/' || pg_temp.p('dA') || '/1_a04_invoice.jpg', 'staff', false, 'owner,manager,lead'),
  ('A staff screenshot',       pg_temp.p('A') || '/feedback/1_a04_staff.png',  'staff',   false, 'owner,manager,lead,staff'),
  ('A owner screenshot',       pg_temp.p('A') || '/feedback/2_a04_owner.png',  'owner',   false, 'owner,manager,lead'),
  ('A workbook',               pg_temp.p('A') || '/imports/2026-10-25_a04.xlsx', 'manager', false, 'owner,manager'),
  ('B invoice photo',          pg_temp.p('B') || '/invoices/' || pg_temp.p('dB') || '/1_a04_invoice.jpg', 'owner_b', false, 'owner_b'),
  ('B screenshot',             pg_temp.p('B') || '/feedback/1_a04_owner_b.png', 'owner_b', false, 'owner_b'),
  ('B workbook',               pg_temp.p('B') || '/imports/2026-10-25_a04.xlsx', 'owner_b', false, 'owner_b'),
  ('older A photo, no uploader', pg_temp.p('dA') || '/1_a04_old.jpg',          null,      true, 'owner,manager,lead'),
  ('older B photo',            pg_temp.p('dB') || '/1_a04_old.jpg',            'owner_b', true, 'owner_b'),
  ('older A staff screenshot', 'feedback/1_a04_old_staff.png',                 'staff',   true, 'owner,manager,lead,staff'),
  ('older A screenshot, no uploader', 'feedback/2_a04_old_anon.png',           null,      true, 'owner,manager,lead'),
  ('older screenshot named by both stores', 'feedback/3_a04_old_both.png',     null,      true, ''),
  ('older A workbook',         'imports/2026-01-01_a04_old.xlsx',              'owner',   true, 'owner,manager'),
  ('older workbook, no uploader', 'imports/2026-01-02_a04_old.xlsx',           null,      true, ''),
  ('file outside any folder',  'a04_notes.txt',                                'owner',   true, '');

-- Fixtures, written as the table owner so row-level security does not apply.
insert into store (id, name) values
  ('a0400000-0000-4000-8000-00000000000a', 'ARCH-04 test store A'),
  ('a0400000-0000-4000-8000-00000000000b', 'ARCH-04 test store B');
insert into department (id, store_id, name) values
  ('a0400000-0000-4000-8001-00000000000a', 'a0400000-0000-4000-8000-00000000000a', 'ARCH-04 Hardware'),
  ('a0400000-0000-4000-8001-00000000000b', 'a0400000-0000-4000-8000-00000000000b', 'ARCH-04 Hardware');
-- Suggestions that name older files: one in store A, and one each in A and B for the same file.
insert into feedback (store_id, kind, body, screenshot_path) values
  ('a0400000-0000-4000-8000-00000000000a', 'idea', 'ARCH-04 older screenshot', 'feedback/2_a04_old_anon.png'),
  ('a0400000-0000-4000-8000-00000000000a', 'idea', 'ARCH-04 named twice', 'feedback/3_a04_old_both.png'),
  ('a0400000-0000-4000-8000-00000000000b', 'idea', 'ARCH-04 named twice', 'feedback/3_a04_old_both.png');
-- The bucket exists on both kinds of database (schema.sql makes it), so a demo check can save.
insert into storage.objects (bucket_id, name, owner_id)
  select 'documents', d.name, a.auth_id::text from doc d left join actor a on a.name = d.uploader;

do $$
begin
  -- Members exist only once login is enforced; a demo database has no auth_id column.
  if (select enforced from mode) then
    insert into auth.users (id, email, aud, role)
      select a.auth_id, 'arch04-' || a.name || '@test.invalid', 'authenticated', 'authenticated'
      from actor a where a.auth_id is not null;
    insert into app_user (store_id, full_name, role, email, auth_id)
      select a.store_id, 'ARCH-04 ' || a.name, a.role, 'arch04-' || a.name || '@test.invalid', a.auth_id
      from actor a where a.store_id is not null;
  end if;
end $$;

-- Act as an actor until reset role. Sets the JWT claims the way the API does for each request.
create function pg_temp.become(p_actor text) returns void language plpgsql as $$
declare a record;
begin
  select * into a from actor where name = p_actor;
  if not found then
    raise exception 'documents_by_role_test: no actor %', p_actor;
  end if;
  if a.auth_id is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', a.auth_id, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', a.auth_id::text, true);
    execute 'set local role authenticated';
  end if;
end $$;

-- How many rows the actor sees from a query, 'denied' when the role may not read it at all, or
-- 'error <sqlstate>' when the query cannot run.
create function pg_temp.rows_as(p_actor text, p_sql text) returns text language plpgsql as $$
declare result text;
begin
  perform pg_temp.become(p_actor);
  begin
    execute format('select count(*)::text from (%s) q', p_sql) into result;
  exception
    when insufficient_privilege then result := 'denied';
    when others then result := 'error ' || sqlstate;
  end;
  execute 'reset role';
  return result;
end $$;

-- Runs a statement as the actor: 'ok <rows>' or 'refused <sqlstate>'. A refused statement rolls
-- back; an ok one stays until the final rollback.
create function pg_temp.run_as(p_actor text, p_sql text) returns text language plpgsql as $$
declare n bigint; result text;
begin
  perform pg_temp.become(p_actor);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    result := 'ok ' || n;
  exception when others then
    result := 'refused ' || sqlstate;
  end;
  execute 'reset role';
  return result;
end $$;

-- Whether the actor sees one stored file, as a signed URL or a download would look it up.
create function pg_temp.opens(p_actor text, p_name text) returns text language sql as $$
  select pg_temp.rows_as(p_actor, format(
    'select 1 from storage.objects where bucket_id = %L and name = %L', 'documents', p_name));
$$;

-- Saves a file row as the actor, the way an upload is checked, with the actor as its uploader.
create function pg_temp.saves(p_actor text, p_name text) returns text language sql as $$
  select pg_temp.run_as(p_actor, format(
    'insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, auth.uid()::text)',
    'documents', p_name));
$$;

create function pg_temp.expect(p_name text, p_expected text, p_actual text) returns void language sql as $$
  insert into check_result (name, expected, actual) values (p_name, p_expected, p_actual);
$$;

-- Demo: the open policy stays, the bucket stays public, and the store folders save and read.
do $$
begin
  if (select enforced from mode) then return; end if;
  perform pg_temp.expect('demo: documents_dev_all is still the only documents policy', 'documents_dev_all',
    (select string_agg(policyname, ',' order by policyname) from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like 'documents%'));
  perform pg_temp.expect('demo: bucket is public', 'true',
    (select public::text from storage.buckets where id = 'documents'));
  perform pg_temp.expect('demo: anon saves into a store folder', 'ok 1',
    pg_temp.saves('anon', pg_temp.p('A') || '/invoices/' || pg_temp.p('dA') || '/2_a04_demo.jpg'));
  perform pg_temp.expect('demo: anon opens it', '1',
    pg_temp.opens('anon', pg_temp.p('A') || '/invoices/' || pg_temp.p('dA') || '/2_a04_demo.jpg'));
  perform pg_temp.expect('demo: anon opens an older-style file', '1',
    pg_temp.opens('anon', 'feedback/2_a04_old_anon.png'));
end $$;

-- Enforced login: the full matrix.
do $$
declare
  d record;
  who text;
begin
  if not (select enforced from mode) then return; end if;

  -- 1. The rules are in place: a private bucket and exactly two policies on storage.objects.
  -- Policies add up, so any other one (say, made in the dashboard) could open these files again.
  perform pg_temp.expect('bucket is private', 'false',
    (select public::text from storage.buckets where id = 'documents'));
  perform pg_temp.expect('every policy on storage.objects', 'documents_open SELECT authenticated,documents_save INSERT authenticated',
    (select string_agg(policyname || ' ' || cmd || ' ' || array_to_string(roles, ','), ',' order by policyname)
     from pg_policies where schemaname = 'storage' and tablename = 'objects'));

  -- 2. Older files are recorded with their store, once, and only these kinds of name.
  perform app_auth.record_legacy_documents();
  for d in select * from doc where legacy loop
    perform pg_temp.expect('recorded store: ' || d.key,
      case d.key
        when 'older A photo, no uploader' then pg_temp.p('A')
        when 'older B photo' then pg_temp.p('B')
        when 'older A staff screenshot' then pg_temp.p('A')
        when 'older A screenshot, no uploader' then pg_temp.p('A')
        when 'older A workbook' then pg_temp.p('A')
        when 'file outside any folder' then 'not recorded'
        else 'none'
      end,
      coalesce((select coalesce(l.store_id::text, 'none') from app_auth.legacy_document l where l.name = d.name),
               'not recorded'));
  end loop;
  perform pg_temp.expect('a second recording adds nothing', '0', app_auth.record_legacy_documents()::text);

  -- 3. Who opens what: every actor against every file.
  for d in select * from doc loop
    foreach who in array array['owner','manager','lead','staff','staff2','owner_b','unlinked','anon'] loop
      perform pg_temp.expect(who || ' opens ' || d.key,
        case when who = any(string_to_array(d.openers, ',')) then '1' else '0' end,
        pg_temp.opens(who, d.name));
    end loop;
  end loop;

  -- 4. A suggestion written later cannot claim another store's older file.
  perform pg_temp.expect('owner_b writes a suggestion naming a store A file', 'ok 1',
    pg_temp.run_as('owner_b', format(
      'insert into public.feedback (store_id, kind, body, screenshot_path) values (%L, %L, %L, %L)',
      pg_temp.p('B'), 'idea', 'ARCH-04 claim', 'feedback/2_a04_old_anon.png')));
  perform app_auth.record_legacy_documents();
  perform pg_temp.expect('owner_b still cannot open it', '0',
    pg_temp.opens('owner_b', 'feedback/2_a04_old_anon.png'));
  perform pg_temp.expect('it is still recorded to store A', pg_temp.p('A'),
    (select store_id::text from app_auth.legacy_document where name = 'feedback/2_a04_old_anon.png'));

  -- 5. Saving: any member into their own store's invoice and suggestion folders; a workbook only
  -- as owner or manager; never into another store, another folder, or an older-style name.
  perform pg_temp.expect('staff saves an invoice photo', 'ok 1',
    pg_temp.saves('staff', pg_temp.p('A') || '/invoices/' || pg_temp.p('dA') || '/3_a04_staff.jpg'));
  perform pg_temp.expect('staff cannot open the photo they just saved', '0',
    pg_temp.opens('staff', pg_temp.p('A') || '/invoices/' || pg_temp.p('dA') || '/3_a04_staff.jpg'));
  perform pg_temp.expect('manager opens it', '1',
    pg_temp.opens('manager', pg_temp.p('A') || '/invoices/' || pg_temp.p('dA') || '/3_a04_staff.jpg'));
  perform pg_temp.expect('staff saves a screenshot', 'ok 1',
    pg_temp.saves('staff', pg_temp.p('A') || '/feedback/3_a04_staff.png'));
  perform pg_temp.expect('staff opens the screenshot they just saved', '1',
    pg_temp.opens('staff', pg_temp.p('A') || '/feedback/3_a04_staff.png'));
  perform pg_temp.expect('staff2 cannot open it', '0',
    pg_temp.opens('staff2', pg_temp.p('A') || '/feedback/3_a04_staff.png'));
  perform pg_temp.expect('lead saves an invoice photo', 'ok 1',
    pg_temp.saves('lead', pg_temp.p('A') || '/invoices/' || pg_temp.p('dA') || '/4_a04_lead.jpg'));
  perform pg_temp.expect('manager saves a workbook', 'ok 1',
    pg_temp.saves('manager', pg_temp.p('A') || '/imports/2026-10-26_a04.xlsx'));
  perform pg_temp.expect('owner saves a workbook', 'ok 1',
    pg_temp.saves('owner', pg_temp.p('A') || '/imports/2026-10-27_a04.xlsx'));
  perform pg_temp.expect('lead cannot save a workbook', 'refused 42501',
    pg_temp.saves('lead', pg_temp.p('A') || '/imports/2026-10-28_a04.xlsx'));
  perform pg_temp.expect('staff cannot save a workbook', 'refused 42501',
    pg_temp.saves('staff', pg_temp.p('A') || '/imports/2026-10-28_a04.xlsx'));
  perform pg_temp.expect('staff cannot save into store B', 'refused 42501',
    pg_temp.saves('staff', pg_temp.p('B') || '/invoices/' || pg_temp.p('dB') || '/5_a04.jpg'));
  perform pg_temp.expect('owner_b cannot save into store A', 'refused 42501',
    pg_temp.saves('owner_b', pg_temp.p('A') || '/feedback/5_a04.png'));
  perform pg_temp.expect('staff cannot save under an older-style photo name', 'refused 42501',
    pg_temp.saves('staff', pg_temp.p('dA') || '/5_a04.jpg'));
  perform pg_temp.expect('staff cannot save under an older-style suggestion name', 'refused 42501',
    pg_temp.saves('staff', 'feedback/5_a04.png'));
  perform pg_temp.expect('owner cannot save under an older-style workbook name', 'refused 42501',
    pg_temp.saves('owner', 'imports/5_a04.xlsx'));
  perform pg_temp.expect('staff cannot save into another folder of their store', 'refused 42501',
    pg_temp.saves('staff', pg_temp.p('A') || '/payments/5_a04.png'));
  perform pg_temp.expect('staff cannot save a folder with no file name', 'refused 42501',
    pg_temp.saves('staff', pg_temp.p('A') || '/feedback/'));
  perform pg_temp.expect('staff cannot save with the store id in capitals', 'refused 42501',
    pg_temp.saves('staff', upper(pg_temp.p('A')) || '/feedback/5_a04.png'));
  perform pg_temp.expect('unlinked cannot save', 'refused 42501',
    pg_temp.saves('unlinked', pg_temp.p('A') || '/feedback/5_a04.png'));
  perform pg_temp.expect('anon cannot save', 'refused 42501',
    pg_temp.saves('anon', pg_temp.p('A') || '/feedback/5_a04.png'));

  -- 6. Nobody changes or removes a stored file, their own included.
  perform pg_temp.expect('owner cannot rename an invoice photo', 'ok 0',
    pg_temp.run_as('owner', format('update storage.objects set name = name || %L where name = %L',
      '.x', (select name from doc where key = 'A invoice photo'))));
  perform pg_temp.expect('staff cannot change their own screenshot', 'ok 0',
    pg_temp.run_as('staff', format('update storage.objects set metadata = %L where name = %L',
      '{}', (select name from doc where key = 'A staff screenshot'))));
  -- No delete policy leaves nothing to delete; Supabase's storage schema also refuses a direct
  -- delete outright, which shows as refused.
  perform pg_temp.expect('owner cannot delete an invoice photo', 'ok 0|refused 42501',
    pg_temp.run_as('owner', format('delete from storage.objects where name = %L',
      (select name from doc where key = 'A invoice photo'))));
  perform pg_temp.expect('the photo is still there', '1',
    (select count(*)::text from storage.objects where name = (select name from doc where key = 'A invoice photo')));

  -- 7. Members cannot read the record of older files or run the recording.
  perform pg_temp.expect('app_auth.legacy_document has row-level security on', 'true',
    (select relrowsecurity::text from pg_class where oid = 'app_auth.legacy_document'::regclass));
  perform pg_temp.expect('owner cannot read app_auth.legacy_document', 'denied',
    pg_temp.rows_as('owner', 'select 1 from app_auth.legacy_document'));
  perform pg_temp.expect('owner cannot run app_auth.record_legacy_documents', 'refused 42501',
    pg_temp.run_as('owner', 'select app_auth.record_legacy_documents()'));
  perform pg_temp.expect('anon cannot run app_auth.can_open_document', 'refused 42501',
    pg_temp.run_as('anon', 'select app_auth.can_open_document(''x'', null)'));
end $$;

select n, case when actual = any(string_to_array(expected, '|')) then 'PASS' else 'FAIL' end as result,
       name, left(actual, 40) as actual
from check_result order by n;

do $$
declare
  total int;
  failed text;
begin
  select count(*) into total from check_result;
  select string_agg(name || ' (expected ' || expected || ', got ' || coalesce(actual, 'null') || ')', '; ' order by n)
    into failed
    from check_result where not (coalesce(actual, '') = any(string_to_array(expected, '|')));
  if failed is not null then
    raise exception 'documents_by_role_test: FAILED: %', failed;
  end if;
  raise notice 'documents_by_role_test: all % checks passed (enforced login: %)', total, (select enforced from mode);
end $$;

rollback;
