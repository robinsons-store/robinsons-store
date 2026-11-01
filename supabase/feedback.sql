-- Owner suggestion box: a proper place for Ravi (and staff) to drop ideas, problems, and
-- screenshots INSIDE the app instead of scattering them across WhatsApp messages.
-- Run once in the Supabase SQL editor. Idempotent: safe to run again.
--
-- Each note can carry a screenshot and a voice recording (stored in the documents bucket
-- under <store_id>/feedback/). When a screenshot is attached, the app reads it with the store's
-- Anthropic key and stores a text description in feedback_summary (supabase/feedback_summary.sql),
-- so the developer digest carries the full picture without the image.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.store(id),
  author_id uuid references public.app_user(id),
  kind text not null default 'idea' check (kind in ('idea','problem','question','praise')),
  page text,                -- which screen it is about, in the author's words
  body text,                -- the note itself
  screenshot_path text,     -- storage path under <store_id>/feedback/ in the documents bucket
  audio_path text,          -- voice recording path under <store_id>/feedback/
  status text not null default 'new' check (status in ('new','planned','done','declined')),
  created_at timestamptz default now(),
  voided_at timestamptz,
  voided_by uuid references public.app_user(id)
);

create index if not exists feedback_store_idx on public.feedback(store_id);
create index if not exists feedback_status_idx on public.feedback(status);

-- Row-level security: match the dev open policy pattern. If enforced auth is on
-- (NEXT_PUBLIC_REQUIRE_AUTH=true), rerun supabase/auth_setup.sql after this file: it now
-- includes feedback in the store-scoped member policies.
alter table public.feedback enable row level security;
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice' and policyname = 'dev_all') then
    drop policy if exists dev_all on public.feedback;
    create policy dev_all on public.feedback for all using (true) with check (true);
  end if;
end $$;
