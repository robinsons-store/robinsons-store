# ADR-005: The AI's description of a suggestion screenshot opens to the people who may open the screenshot

| Field | Value |
|---|---|
| Status | PROPOSED, 2026-10-25 |
| Proposer | The developer |
| Deciders | Ravi Kiran, store owner (approver) |
| Technical owner | The developer |
| Supersedes | Nothing. Extends ADR-004 ruling 2 to the text read from a screenshot |

## Context

When a suggestion carries a screenshot, `/api/feedback-triage` has the AI describe it in plain
text so the developer digest carries the picture as words
[R `src/app/api/feedback-triage/route.ts:14-26`]. The description is drawn from the screenshot,
so it can name whatever the screen showed.

Who opens a suggestion screenshot: lead, manager, owner, and the member who attached it
(ADR-004 ruling 2) [D: the owner's requirement, 2026-10-25]. The suggestion itself, its note
and the screen it names, opens to every member of the store, because anyone may add to or follow the suggestion box
[R `supabase/auth_setup.sql:111-114, 126-130`]. So the description needs the screenshot's rule, not the
suggestion's.

Two facts shape where it lives:

- Every signed-in member reaches the database as the same Postgres role, so one column of a
  row cannot be shown to one member and hidden from another; a rule by member is a rule on
  rows (ADR-003, context) [R `supabase/auth_setup.sql:289-291`].
- Any member may edit a suggestion, its named file included (3a). Who saved a stored file is
  recorded by the storage service, not by the member (ADR-004, context).

## Decision

1. **Its own table.** The description is saved in `public.feedback_summary`, one row per
   suggestion: the suggestion, its store, the stored file it was read from, and the text
   [R `supabase/schema.sql:246-258`] [R `supabase/auth_setup.sql:628-639`]. The suggestion
   carries no description.
2. **Who reads it.** A member of its store who may open the file it was read from, by ADR-004's
   rule for that file: for a suggestion file, lead, manager, owner and the account that saved
   it. Every role passes the same file check. Only the file saved under that name by the time
   the description was saved counts. A description that names no file, or whose file is not
   found that way, opens to nobody. One check,
   `app_auth.can_read_screenshot_summary`, calls the stored-file check of ADR-004
   [R `supabase/auth_setup.sql:675-697`]; one policy, `feedback_summary_read`, uses it
   [R `supabase/auth_setup.sql:707-710`].
3. **The file goes with the text.** The rule reads the file named on the description, not the
   suggestion's current one, so editing a suggestion never changes who reads its description
   (`supabase/feedback_summary_test.sql` section 5).
4. **Who writes it.** Whoever may read a description may write it, only for the suggestion it
   belongs to and the file that suggestion names [R `supabase/auth_setup.sql:699-731`]. The
   database dates every save, a rewrite included, whatever the writer sends, so reading a
   replacement screenshot again opens the new description to whoever saved the new file
   [R `supabase/auth_setup.sql:641-656`]. The screenshot reader runs as the member who asked
   for it and saves with an upsert, so running it twice keeps one row
   [R `src/app/api/feedback-triage/route.ts:85-91`]. No policy lets a member remove a
   description.
5. **Older descriptions move once.** Descriptions saved on `feedback.ai_summary` are copied into
   the new table with the file their suggestion named, dated the day they move, and the column
   is dropped [R `supabase/auth_setup.sql:658-673`]. A blank one is not copied.
6. **Applied without a person.** `supabase/feedback_summary.sql` runs from `run-order.txt` after
   `documents_by_role.sql`, whose check it uses [R `supabase/run-order.txt:28-29`]. With enforced
   login it is exactly `auth_setup.sql` section 3g; on a demo database the new table gets the
   open `dev_all` policy like every other table.
7. **The screens follow.** Suggestions reads the descriptions of the store and shows each next
   to its suggestion; the database returns only the ones the member may read, and the developer
   digest uses the same list [R `src/app/suggestions/page.tsx:74-84`]
   [R `src/app/suggestions/page.tsx:237-239`]. The full export, owner and manager only, has a
   tab for the table [R `src/app/api/export/route.ts:57`].
8. **Fewer details in the text.** The reader is told not to copy dollar amounts, pay rates or
   personal details into the description, and to name the kind of figure instead
   [R `src/app/api/feedback-triage/route.ts:24`]. This is a second layer, not the fence.

## Conditions

1. Any new text the AI writes from a stored file lives beside that file's name and is fenced by
   the same check, the way this table is.
2. `supabase/feedback_summary_test.sql` passes on a fresh copy and an upgraded copy before any
   change to section 3g merges.
3. After each merge that changes section 3g, four read-only checks on the live database:
   `select policyname, cmd from pg_policies where tablename = 'feedback_summary'` returns
   exactly `feedback_summary_read SELECT`, `feedback_summary_resave UPDATE` and
   `feedback_summary_save INSERT` (policies add up, so these must be the only three);
   `select tgname from pg_trigger where tgrelid = 'public.feedback_summary'::regclass and not tgisinternal`
   returns exactly `feedback_summary_dated`;
   `select count(*) from information_schema.columns where table_name = 'feedback' and column_name = 'ai_summary'`
   returns 0; and `select count(*) from public.feedback_summary` says how many descriptions there are.
4. The staff smoke test of ADR-004 condition 4 also checks that a staff member sees the
   description of their own screenshot and not of the owner's.

## Consequences

Accepted costs:

- Staff see the description of their own screenshots only. On another member's suggestion they
  see the note and the screen it names, and a digest they copy lists that screenshot by its
  file name.
- The reader leaves figures out of a description; the developer opens the screenshot when a number
  matters.
- A description of a screenshot saved before login was on, which has no recorded uploader,
  opens to lead, manager and owner only, the same as the screenshot (ADR-004).
- A description whose file is not in storage, or that names no file, opens to nobody; the
  suggestion and its note still show.
- Every save of a description writes an `activity_log` row for the member who asked for it, so
  a rewritten description shows who wrote it [R `src/app/api/feedback-triage/route.ts:93-96`].
- Each description read runs one check per row. Suggestions reads one store's descriptions.

Benefits:

- The description follows the owner's choice for the screenshot, at the database.
- Staff keep the AI read of their own screenshots.
- The reader keeps running as the caller; no service key, no new route.

## Alternatives considered

- **Hide the description on screen only.** Rejected: ADR-003 puts each rule at the database,
  so a request outside the app gets the same answer as the app.
- **Keep the column and limit it with column grants.** Rejected: every member shares one
  Postgres role, so a grant cannot differ by member, and a withheld column breaks every
  `select *`, the export's included.
- **A view of the suggestions without the description, over a definer function (ADR-003's
  views).** Rejected: the suggestion stays open to every member either way; one table with
  ordinary policies states the rule once, where a view would add a function and leave the
  column on the table.
- **Let the author read it by `feedback.author_id`.** Rejected: any member may edit a
  suggestion, author included; the storage service's record of who saved the file cannot be
  edited by a member.
- **Stop describing screenshots.** Rejected: the digest would lose the picture, which is why the
  reader exists [R `docs/REQUIREMENTS.md:88-89`].
- **Only tell the AI to leave figures out.** Rejected as the only measure: an instruction to a
  model is not a fence. Kept as a second layer (ruling 8).

## Related

ADR-004 (stored files by store and role), ADR-003 (money in the tables), docs/AGENTS.md (the
screenshot reader), docs/SUPABASE_SETUP.md (run order), `supabase/feedback_summary_test.sql`
(the proof), docs/VERIFICATION.md (the sign-off row).

## How this maps to the rest of the docs

The rule for new tables is in `.claude/skills/robinsons-store/SKILL.md` (invariants 6 and 12).
The live state of the policies is read, not assumed: condition 3 says how.

**Basis: 19 claims checked this session (2026-10-25), 19 confirmed, 0 killed, 3 sources.**
Confirmed by opening each cited file and line; by running `feedback_summary_test.sql`,
`documents_by_role_test.sql` and `money_by_role_test.sql` on supabase/postgres 17.11.0.005 with
the storage schema made by supabase/storage-api v1.79.5, on copies built fresh from this branch,
upgraded from main 4dfc97c, and upgraded from the stored-files branch; and by running the
Suggestions reads and the screenshot reader's calls through PostgREST v14.18 and the storage
service with `@supabase/supabase-js` 2.106.2 as owner, manager, lead, two staff and a second
store's lead. The owner's requirement is `[D]` until Ravi Kiran confirms it. Sources: this
repository, the local test databases, the owner's requirement.
Amended 2026-10-30 (branch claude/feedback-summary-follow-up): rulings 2 and 4, condition 3 and
the accepted costs re-read after the file check for every role and the database save date were
added: 8 references opened at the named lines, 8 confirmed; the first version's live apply read
with `gh run list` (Apply database scripts succeeded on main 373b2b5). The new cases in sections
4b and 4c of `supabase/feedback_summary_test.sql` have not run yet [J-open: killed if any fails
on a disposable Supabase stack].
