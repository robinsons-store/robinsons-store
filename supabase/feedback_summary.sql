-- The AI's description of a suggestion screenshot opens to the people who may open the screenshot.
-- The decision and the alternatives it rejected: docs/adr/ADR-005-screenshot-descriptions-follow-the-screenshot.md.
-- Runs from supabase/run-order.txt on every merge to main, after documents_by_role.sql, whose
-- app_auth.can_open_document() it uses. Idempotent: safe to run again.
--
-- On every database it makes public.feedback_summary, one row per suggestion whose screenshot
-- the AI has read, moves any description still on feedback.ai_summary into it, and drops that
-- column. Then it does one of two things, decided by the database it runs on (the same test
-- money_by_role.sql uses):
--   Demo (the open dev_all policies are still on invoice): the new table gets the same open
--     dev_all policy as every other table.
--   Enforced login (auth_setup.sql has run): exactly section 3g of auth_setup.sql. A description
--     opens to the members of its store who may open the file it was read from (3f), and only
--     while that file is the one saved under its name by the time the description was saved.
--     Keep this and auth_setup.sql 3g identical; supabase/feedback_summary_test.sql checks both.
--
-- Each mode is written as a function in pg_temp, which disappears when the session ends, so the
-- statements read as plain SQL rather than as strings passed to execute.

create or replace function pg_temp.feedback_summary_table()
returns void
language plpgsql
as $fn$
begin
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
  -- replacement screenshot counts that file (3g) and its uploader keeps reading it.
  create or replace function public.feedback_summary_dated()
  returns trigger
  language plpgsql
  set search_path = public
  as $body$
  begin
    new.created_at := now();
    return new;
  end;
  $body$;
  drop trigger if exists feedback_summary_dated on public.feedback_summary;
  create trigger feedback_summary_dated
    before insert or update on public.feedback_summary
    for each row execute function public.feedback_summary_dated();

  -- Copies any description saved on feedback.ai_summary before this table existed into it,
  -- once, dated now, then drops that column.
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
end;
$fn$;

create or replace function pg_temp.feedback_summary_demo()
returns void
language plpgsql
as $fn$
begin
  drop policy if exists dev_all on public.feedback_summary;
  create policy dev_all on public.feedback_summary for all using (true) with check (true);
end;
$fn$;

create or replace function pg_temp.feedback_summary_enforced()
returns void
language plpgsql
as $fn$
begin
  -- 3g. Whether the signed-in member may read the description of this screenshot: a member of the
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
  as $body$
    select coalesce(bool_or(
        summary_store = app_auth.my_store_id()
        and app_auth.can_open_document(o.name, o.owner_id)), false)
    from storage.objects o
    where o.bucket_id = 'documents' and o.name = path and o.created_at <= written_at;
  $body$;
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
end;
$fn$;

do $$
begin
  perform pg_temp.feedback_summary_table();
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice' and policyname = 'dev_all') then
    perform pg_temp.feedback_summary_demo();
  else
    perform pg_temp.feedback_summary_enforced();
  end if;
end $$;
