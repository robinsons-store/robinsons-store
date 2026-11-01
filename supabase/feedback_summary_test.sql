-- Proves auth_setup.sql 3g at the database: the AI's description of a suggestion screenshot opens
-- to the members of its store who may open the file it was read from (3f), for a suggestion
-- screenshot lead, manager, owner and the member who attached it, counting only a file saved by
-- the time the description was; a description whose file is missing, saved later, in another
-- store's folder or of another kind follows that file's rule, money roles included; the database
-- dates every save, so a replacement screenshot read again opens to whoever saved it; whoever
-- may read one may write it, only for the suggestion it belongs to and the file that suggestion
-- names; nobody removes one; and the suggestion itself carries no description.
-- docs/adr/ADR-005-screenshot-descriptions-follow-the-screenshot.md says why it is built this way.
--
-- Run it on a DISPOSABLE database, never the store's, with the storage schema that Supabase's
-- storage service creates (a local Supabase stack has it):
--   psql "<disposable database>" -v ON_ERROR_STOP=1 -f supabase/feedback_summary_test.sql
-- It makes its own two stores, members, suggestions, descriptions and stored-file rows, including
-- rows in auth.users and storage.objects, inside one transaction and rolls every one of them back.
-- It is not in run-order.txt, so the migration workflow never runs it.
--
-- Two kinds of database:
--   enforced login (auth_setup.sql has run): the full role, store and write matrix below.
--   demo (dev_all still open): only that the table is open like every other one.
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
  ('owner',    'a0500000-0000-4000-8000-0000000000a1', 'a0500000-0000-4000-8000-00000000000a', 'owner'),
  ('manager',  'a0500000-0000-4000-8000-0000000000a2', 'a0500000-0000-4000-8000-00000000000a', 'manager'),
  ('lead',     'a0500000-0000-4000-8000-0000000000a3', 'a0500000-0000-4000-8000-00000000000a', 'lead'),
  ('staff',    'a0500000-0000-4000-8000-0000000000a4', 'a0500000-0000-4000-8000-00000000000a', 'staff'),
  ('staff2',   'a0500000-0000-4000-8000-0000000000a5', 'a0500000-0000-4000-8000-00000000000a', 'staff'),
  ('owner_b',  'a0500000-0000-4000-8000-0000000000b1', 'a0500000-0000-4000-8000-00000000000b', 'owner'),
  ('unlinked', 'a0500000-0000-4000-8000-0000000000c1', null, null),
  ('anon',     null, null, null);

-- The suggestions. "file" is the screenshot it names and "uploader" the actor whose account saved
-- that file (null: saved before login was on). "described" says the suggestion already has a
-- description, written as the table owner below; "readers" is who may read that description.
-- "stored" is false for a file named but never saved.
create temp table suggestion (key text primary key, id uuid, store_id uuid, file text, uploader text,
                              described boolean, readers text, stored boolean default true);
insert into suggestion values
  ('A staff screenshot', 'a0500000-0000-4000-8002-000000000001', 'a0500000-0000-4000-8000-00000000000a',
   'a0500000-0000-4000-8000-00000000000a/feedback/1_a05_staff.png', 'staff', true, 'owner,manager,lead,staff'),
  ('A owner screenshot', 'a0500000-0000-4000-8002-000000000002', 'a0500000-0000-4000-8000-00000000000a',
   'a0500000-0000-4000-8000-00000000000a/feedback/2_a05_owner.png', 'owner', true, 'owner,manager,lead'),
  ('older A staff screenshot', 'a0500000-0000-4000-8002-000000000003', 'a0500000-0000-4000-8000-00000000000a',
   'feedback/1_a05_old_staff.png', 'staff', true, 'owner,manager,lead,staff'),
  ('older A screenshot, no uploader', 'a0500000-0000-4000-8002-000000000004', 'a0500000-0000-4000-8000-00000000000a',
   'feedback/2_a05_old_anon.png', null, true, 'owner,manager,lead'),
  ('A description with no screenshot', 'a0500000-0000-4000-8002-000000000005', 'a0500000-0000-4000-8000-00000000000a',
   null, null, true, ''),
  ('B screenshot', 'a0500000-0000-4000-8002-000000000006', 'a0500000-0000-4000-8000-00000000000b',
   'a0500000-0000-4000-8000-00000000000b/feedback/1_a05_owner_b.png', 'owner_b', true, 'owner_b'),
  ('A file saved after its description', 'a0500000-0000-4000-8002-000000000009', 'a0500000-0000-4000-8000-00000000000a',
   'a0500000-0000-4000-8000-00000000000a/feedback/5_a05_staff2_later.png', 'staff2', true, ''),
  ('A staff new', 'a0500000-0000-4000-8002-000000000007', 'a0500000-0000-4000-8000-00000000000a',
   'a0500000-0000-4000-8000-00000000000a/feedback/3_a05_staff_new.png', 'staff', false, ''),
  ('A owner new', 'a0500000-0000-4000-8002-000000000008', 'a0500000-0000-4000-8000-00000000000a',
   'a0500000-0000-4000-8000-00000000000a/feedback/4_a05_owner_new.png', 'owner', false, ''),
  ('A workbook', 'a0500000-0000-4000-8002-000000000010', 'a0500000-0000-4000-8000-00000000000a',
   'a0500000-0000-4000-8000-00000000000a/imports/6_a05_owner_workbook.xlsx', 'owner', true, 'owner,manager'),
  ('A naming a store B file', 'a0500000-0000-4000-8002-000000000011', 'a0500000-0000-4000-8000-00000000000a',
   'a0500000-0000-4000-8000-00000000000b/feedback/2_a05_owner_b.png', 'owner_b', true, ''),
  ('A replaced screenshot', 'a0500000-0000-4000-8002-000000000013', 'a0500000-0000-4000-8000-00000000000a',
   'a0500000-0000-4000-8000-00000000000a/feedback/9_a05_staff2_second.png', 'staff2', false, '');
insert into suggestion (key, id, store_id, file, uploader, described, readers, stored) values
  ('A file never stored', 'a0500000-0000-4000-8002-000000000012', 'a0500000-0000-4000-8000-00000000000a',
   'a0500000-0000-4000-8000-00000000000a/feedback/7_a05_missing.png', null, true, '', false),
  ('A owner new, never stored', 'a0500000-0000-4000-8002-000000000014', 'a0500000-0000-4000-8000-00000000000a',
   'a0500000-0000-4000-8000-00000000000a/feedback/8_a05_missing_new.png', null, false, '', false);
create function pg_temp.s(p_key text) returns suggestion language sql as $$
  select * from suggestion where key = p_key;
$$;

-- Fixtures, written as the table owner so row-level security does not apply.
insert into store (id, name) values
  ('a0500000-0000-4000-8000-00000000000a', 'ADR-005 test store A'),
  ('a0500000-0000-4000-8000-00000000000b', 'ADR-005 test store B');
insert into feedback (id, store_id, kind, body, screenshot_path)
  select id, store_id, 'idea', 'ADR-005 ' || key, file from suggestion;
insert into storage.objects (bucket_id, name, owner_id)
  select 'documents', s.file, a.auth_id::text
  from suggestion s left join actor a on a.name = s.uploader
  where s.file is not null and s.stored;
insert into feedback_summary (feedback_id, store_id, screenshot_path, summary)
  select id, store_id, file, 'ADR-005 description of ' || key from suggestion where described;
-- A file under that name saved after its description, the way a removed file's name could be
-- saved again: nobody gets the description through it.
update storage.objects set created_at = now() + interval '1 minute'
  where bucket_id = 'documents' and name = (pg_temp.s('A file saved after its description')).file;
-- A replaced screenshot: staff2 saved a first file, it was described, then staff2 saved a second
-- file and the suggestion now names that one. Backdating the description needs the save-date
-- trigger off for this one write, as the table owner.
insert into storage.objects (bucket_id, name, owner_id, created_at)
  values ('documents', 'a0500000-0000-4000-8000-00000000000a/feedback/9_a05_staff2_first.png',
          'a0500000-0000-4000-8000-0000000000a5', now() - interval '3 minutes');
update storage.objects set created_at = now() - interval '1 minute'
  where bucket_id = 'documents' and name = (pg_temp.s('A replaced screenshot')).file;
alter table feedback_summary disable trigger feedback_summary_dated;
insert into feedback_summary (feedback_id, store_id, screenshot_path, summary, created_at)
  values ((pg_temp.s('A replaced screenshot')).id, (pg_temp.s('A replaced screenshot')).store_id,
          'a0500000-0000-4000-8000-00000000000a/feedback/9_a05_staff2_first.png',
          'ADR-005 description of the first file', now() - interval '2 minutes');
alter table feedback_summary enable trigger feedback_summary_dated;

do $$
begin
  -- Members exist only once login is enforced; a demo database has no auth_id column.
  if (select enforced from mode) then
    insert into auth.users (id, email, aud, role)
      select a.auth_id, 'adr005-' || a.name || '@test.invalid', 'authenticated', 'authenticated'
      from actor a where a.auth_id is not null;
    insert into app_user (store_id, full_name, role, email, auth_id)
      select a.store_id, 'ADR-005 ' || a.name, a.role, 'adr005-' || a.name || '@test.invalid', a.auth_id
      from actor a where a.store_id is not null;
    -- The older-style screenshots are recorded with their store, the way the migration records
    -- the store's own (supabase/documents_by_role.sql).
    perform app_auth.record_legacy_documents();
  end if;
end $$;

-- Act as an actor until reset role. Sets the JWT claims the way the API does for each request.
create function pg_temp.become(p_actor text) returns void language plpgsql as $$
declare a record;
begin
  select * into a from actor where name = p_actor;
  if not found then
    raise exception 'feedback_summary_test: no actor %', p_actor;
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

-- Whether the actor reads the description of one suggestion.
create function pg_temp.reads(p_actor text, p_key text) returns text language sql as $$
  select pg_temp.rows_as(p_actor, format(
    'select 1 from public.feedback_summary where feedback_id = %L', (pg_temp.s(p_key)).id));
$$;

-- Saves a description as the actor the way /api/feedback-triage does: an upsert on the
-- suggestion, naming the file given.
create function pg_temp.saves(p_actor text, p_key text, p_file text, p_store text default null)
returns text language sql as $$
  select pg_temp.run_as(p_actor, format(
    'insert into public.feedback_summary (feedback_id, store_id, screenshot_path, summary) values (%L, %L, %L, %L) '
    'on conflict (feedback_id) do update set store_id = excluded.store_id, '
    'screenshot_path = excluded.screenshot_path, summary = excluded.summary',
    (pg_temp.s(p_key)).id, coalesce(p_store, (pg_temp.s(p_key)).store_id::text), p_file,
    'ADR-005 written by ' || p_actor));
$$;

create function pg_temp.expect(p_name text, p_expected text, p_actual text) returns void language sql as $$
  insert into check_result (name, expected, actual) values (p_name, p_expected, p_actual);
$$;

-- On both kinds of database the description is off the suggestion.
select pg_temp.expect('feedback has no ai_summary column', '0',
  (select count(*)::text from information_schema.columns
   where table_schema = 'public' and table_name = 'feedback' and column_name = 'ai_summary'));
select pg_temp.expect('feedback_summary has row-level security on', 'true',
  (select relrowsecurity::text from pg_class where oid = 'public.feedback_summary'::regclass));
select pg_temp.expect('the database dates every save of a description', 'feedback_summary_dated',
  (select string_agg(tgname, ',') from pg_trigger
   where tgrelid = 'public.feedback_summary'::regclass and not tgisinternal and tgenabled = 'O'));

-- Demo: the table is open like every other one.
do $$
begin
  if (select enforced from mode) then return; end if;
  perform pg_temp.expect('demo: dev_all is the only feedback_summary policy', 'dev_all',
    (select string_agg(policyname, ',' order by policyname) from pg_policies
     where schemaname = 'public' and tablename = 'feedback_summary'));
  perform pg_temp.expect('demo: anon reads a description', '1',
    pg_temp.reads('anon', 'A owner screenshot'));
  perform pg_temp.expect('demo: anon saves a description', 'ok 1',
    pg_temp.saves('anon', 'A staff new', (pg_temp.s('A staff new')).file));
end $$;

-- Enforced login: the full matrix.
do $$
declare
  r record;
  who text;
begin
  if not (select enforced from mode) then return; end if;

  -- 1. The rules are in place: exactly three policies, none of them for delete. Policies add up,
  -- so any other one (say, made in the dashboard) could open these descriptions again.
  perform pg_temp.expect('every policy on feedback_summary',
    'feedback_summary_read SELECT authenticated,feedback_summary_resave UPDATE authenticated,feedback_summary_save INSERT authenticated',
    (select string_agg(policyname || ' ' || cmd || ' ' || array_to_string(roles, ','), ',' order by policyname)
     from pg_policies where schemaname = 'public' and tablename = 'feedback_summary'));

  -- 2. Who reads what: every actor against every description.
  for r in select * from suggestion where described loop
    foreach who in array array['owner','manager','lead','staff','staff2','owner_b','unlinked','anon'] loop
      perform pg_temp.expect(who || ' reads ' || r.key,
        case when who = any(string_to_array(r.readers, ',')) then '1' else '0|denied' end,
        pg_temp.reads(who, r.key));
    end loop;
  end loop;

  -- 3. The suggestions themselves stay open to the whole store: Suggestions lists every one.
  perform pg_temp.expect('staff2 lists every store A suggestion',
    (select count(*)::text from suggestion where store_id = (pg_temp.s('A staff screenshot')).store_id),
    pg_temp.rows_as('staff2', format('select 1 from public.feedback where store_id = %L',
      (pg_temp.s('A staff screenshot')).store_id)));
  perform pg_temp.expect('staff2 reads only the description of their own first screenshot', '1',
    pg_temp.rows_as('staff2', format('select 1 from public.feedback_summary where store_id = %L',
      (pg_temp.s('A staff screenshot')).store_id)));

  -- 4. Writing, the way the screenshot reader does: whoever may read the description, for the
  -- suggestion's own file.
  perform pg_temp.expect('staff sends a save date a day ahead', 'ok 1',
    pg_temp.run_as('staff', format(
      'insert into public.feedback_summary (feedback_id, store_id, screenshot_path, summary, created_at) '
      'values (%L, %L, %L, %L, now() + interval %L)',
      (pg_temp.s('A staff new')).id, (pg_temp.s('A staff new')).store_id, (pg_temp.s('A staff new')).file,
      'ADR-005 dated ahead', '1 day')));
  perform pg_temp.expect('the database dates it now instead', 'true',
    (select (created_at = now())::text from public.feedback_summary
     where feedback_id = (pg_temp.s('A staff new')).id));
  perform pg_temp.expect('staff saves the description of their own screenshot', 'ok 1',
    pg_temp.saves('staff', 'A staff new', (pg_temp.s('A staff new')).file));
  perform pg_temp.expect('staff reads it', '1', pg_temp.reads('staff', 'A staff new'));
  perform pg_temp.expect('lead reads it', '1', pg_temp.reads('lead', 'A staff new'));
  perform pg_temp.expect('staff2 cannot read it', '0', pg_temp.reads('staff2', 'A staff new'));
  perform pg_temp.expect('staff saves it again (the reader run twice)', 'ok 1',
    pg_temp.saves('staff', 'A staff new', (pg_temp.s('A staff new')).file));
  perform pg_temp.expect('lead rewrites the description of a staff screenshot', 'ok 1',
    pg_temp.saves('lead', 'A staff screenshot', (pg_temp.s('A staff screenshot')).file));
  perform pg_temp.expect('staff cannot describe the owner''s screenshot', 'refused 42501',
    pg_temp.saves('staff', 'A owner new', (pg_temp.s('A owner new')).file));
  perform pg_temp.expect('staff cannot describe the owner''s suggestion naming their own file', 'refused 42501',
    pg_temp.saves('staff', 'A owner new', (pg_temp.s('A staff screenshot')).file));
  perform pg_temp.expect('staff2 cannot describe a staff screenshot', 'refused 42501',
    pg_temp.saves('staff2', 'A staff screenshot', (pg_temp.s('A staff screenshot')).file));
  perform pg_temp.expect('owner_b cannot describe a store A screenshot', 'refused 42501',
    pg_temp.saves('owner_b', 'A owner new', (pg_temp.s('A owner new')).file));
  perform pg_temp.expect('staff cannot move their description to store B', 'refused 42501',
    pg_temp.saves('staff', 'A staff new', (pg_temp.s('A staff new')).file, (pg_temp.s('B screenshot')).store_id::text));
  perform pg_temp.expect('unlinked cannot save a description', 'refused 42501',
    pg_temp.saves('unlinked', 'A owner new', (pg_temp.s('A owner new')).file));
  perform pg_temp.expect('anon cannot save a description', 'refused 42501',
    pg_temp.saves('anon', 'A owner new', (pg_temp.s('A owner new')).file));
  perform pg_temp.expect('owner saves the description of their own screenshot', 'ok 1',
    pg_temp.saves('owner', 'A owner new', (pg_temp.s('A owner new')).file));
  perform pg_temp.expect('staff cannot read it', '0', pg_temp.reads('staff', 'A owner new'));

  -- 4b. Money roles pass the same file check: no description without a file they may open.
  perform pg_temp.expect('owner cannot describe a file that was never stored', 'refused 42501',
    pg_temp.saves('owner', 'A owner new, never stored', (pg_temp.s('A owner new, never stored')).file));
  perform pg_temp.expect('owner cannot rewrite a description whose file was never stored', 'refused 42501',
    pg_temp.saves('owner', 'A file never stored', (pg_temp.s('A file never stored')).file));
  perform pg_temp.expect('owner cannot describe a store B file on a store A suggestion', 'refused 42501',
    pg_temp.saves('owner', 'A naming a store B file', (pg_temp.s('A naming a store B file')).file));
  perform pg_temp.expect('lead cannot describe a workbook', 'refused 42501',
    pg_temp.saves('lead', 'A workbook', (pg_temp.s('A workbook')).file));
  perform pg_temp.expect('manager rewrites the description of a workbook', 'ok 1',
    pg_temp.saves('manager', 'A workbook', (pg_temp.s('A workbook')).file));
  perform pg_temp.expect('lead still cannot read it', '0', pg_temp.reads('lead', 'A workbook'));

  -- 4c. A replaced screenshot read again: the description moves to the new file, dated by the
  -- database, and opens to whoever saved that file.
  perform pg_temp.expect('staff2 reads the description of their first screenshot', '1',
    pg_temp.reads('staff2', 'A replaced screenshot'));
  perform pg_temp.expect('owner reads the replacement screenshot again', 'ok 1',
    pg_temp.saves('owner', 'A replaced screenshot', (pg_temp.s('A replaced screenshot')).file));
  perform pg_temp.expect('the new description is dated now', 'true',
    (select (created_at = now())::text from public.feedback_summary
     where feedback_id = (pg_temp.s('A replaced screenshot')).id));
  perform pg_temp.expect('staff2, who saved the replacement, reads it', '1',
    pg_temp.reads('staff2', 'A replaced screenshot'));
  perform pg_temp.expect('lead reads the replacement description', '1',
    pg_temp.reads('lead', 'A replaced screenshot'));
  perform pg_temp.expect('staff cannot read the replacement description', '0',
    pg_temp.reads('staff', 'A replaced screenshot'));
  perform pg_temp.expect('staff2 reads their replacement again themselves', 'ok 1',
    pg_temp.saves('staff2', 'A replaced screenshot', (pg_temp.s('A replaced screenshot')).file));

  -- 5. Changing the suggestion does not change who reads its description: the description keeps
  -- the file it was read from. Any member may still point a suggestion at another file (3a).
  perform pg_temp.expect('staff points the owner''s suggestion at their own file', 'ok 1',
    pg_temp.run_as('staff', format('update public.feedback set screenshot_path = %L where id = %L',
      (pg_temp.s('A staff screenshot')).file, (pg_temp.s('A owner screenshot')).id)));
  perform pg_temp.expect('staff still cannot read the owner''s description', '0',
    pg_temp.reads('staff', 'A owner screenshot'));
  perform pg_temp.expect('staff cannot overwrite it with their own file', 'refused 42501',
    pg_temp.saves('staff', 'A owner screenshot', (pg_temp.s('A staff screenshot')).file));
  perform pg_temp.expect('staff cannot change it directly', 'ok 0',
    pg_temp.run_as('staff', format('update public.feedback_summary set screenshot_path = %L where feedback_id = %L',
      (pg_temp.s('A staff screenshot')).file, (pg_temp.s('A owner screenshot')).id)));
  perform pg_temp.expect('the owner''s description is unchanged', 'ADR-005 description of A owner screenshot',
    (select summary from public.feedback_summary where feedback_id = (pg_temp.s('A owner screenshot')).id));

  -- 6. Nobody removes a description, their own included.
  perform pg_temp.expect('owner cannot delete a description', 'ok 0',
    pg_temp.run_as('owner', format('delete from public.feedback_summary where feedback_id = %L',
      (pg_temp.s('A owner screenshot')).id)));
  perform pg_temp.expect('staff cannot delete their own description', 'ok 0',
    pg_temp.run_as('staff', format('delete from public.feedback_summary where feedback_id = %L',
      (pg_temp.s('A staff new')).id)));

  -- 7. The check itself is not callable by nobody signed in.
  perform pg_temp.expect('anon cannot run app_auth.can_read_screenshot_summary', 'refused 42501',
    pg_temp.run_as('anon', 'select app_auth.can_read_screenshot_summary(null, null, null)'));
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
    raise exception 'feedback_summary_test: FAILED: %', failed;
  end if;
  raise notice 'feedback_summary_test: all % checks passed (enforced login: %)', total, (select enforced from mode);
end $$;

rollback;
