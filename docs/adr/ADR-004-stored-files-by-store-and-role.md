# ADR-004: A stored file opens only in its own store, and an invoice photo only to roles that see money

| Field | Value |
|---|---|
| Status | PROPOSED, 2026-10-25 |
| Proposer | The developer |
| Deciders | Ravi Kiran, store owner (approver; chose who opens which file, 2026-10-25) |
| Technical owner | The developer |
| Supersedes | Nothing. Closes ARCH-04 in docs/ARCHITECTURE.md |

## Context

The private `documents` bucket holds three kinds of file, all saved from the browser or the
import route:

| Kind | Saved by | What it can show |
|---|---|---|
| Invoice photos | Capture, any member, the photo of the invoice in their hand [R `src/app/capture/page.tsx:209-215`] | Prices |
| Screenshots and voice notes | Suggestions, any member [R `src/app/suggestions/page.tsx:145-159`] | Any screen, money screens included |
| Imported workbooks | `/api/import`, owner or manager only [R `src/app/api/import/route.ts:415-420`] | Vendor ledgers, schedules, stock |

ADR-003 keeps dollar figures from staff in the tables; it does not cover files. A file's rule
needs three facts: its store, its kind, and who saved it. The storage service records who
saved a file (`owner_id`, the signed-in account) [V-run, `storage.objects` columns on
supabase/storage-api v1.79.5, 2026-10-25]; the store and the kind have to come from the path.

Who opens what: invoice photos only lead, manager and owner;
screenshots and voice notes those three and the member who attached them
[D: the owner's requirement, 2026-10-25].

Two facts shape the fix:

- An upload is checked as a plain insert, with no read back, so a member can be allowed to
  save a file they may not open [V-run, `createObject` in supabase/storage-api v1.79.5
  `dist/storage/database/pg.js`, 2026-10-25: `INSERT INTO storage.objects ... VALUES (...)`,
  no `RETURNING`]. The hosted service checks uploads the same way [J-open: killed if a staff
  upload is refused in the condition 4 smoke test; Capture then stops before writing anything].
- A stored file's bytes are kept under its name. Renaming the row in SQL loses them
  [V-run, `update storage.objects set name = ...` on the local storage service, 2026-10-25:
  the download that worked before the rename fails after it]; only the storage service can
  move a file, with the service key, outside the migration workflow.

Not deciding has a specific failure: staff logins wait on this (docs/ARCHITECTURE.md open items, ARCH-04).

## Decision

1. **Store folders.** Every file is saved under `<store_id>/<kind>/`, with kind `invoices`,
   `feedback` or `imports`, built by one helper [R `src/lib/documentPath.ts:7-11`] that
   Capture, Suggestions and the import route use [R `src/app/capture/page.tsx:213`]
   [R `src/app/suggestions/page.tsx:149`] [R `src/app/api/import/route.ts:26`].
2. **Who opens a file.** Only members of its store, and by kind: invoice photos lead, manager
   and owner; screenshots and voice notes those three and the account that saved the file;
   workbooks owner and manager, the roles that may import. One policy, `documents_open`,
   calls `app_auth.can_open_document(name, owner_id)` [R `supabase/auth_setup.sql:561-582`]
   [R `supabase/auth_setup.sql:610-613`].
3. **Who saves a file.** Any member saves an invoice photo or a suggestion file into their own
   store's folder, so Capture works for staff; only owner and manager save a workbook. Nothing
   else is saved: no other store, no other folder, no older-style name. One policy,
   `documents_save`, calls `app_auth.can_save_document(name)`
   [R `supabase/auth_setup.sql:587-599`] [R `supabase/auth_setup.sql:614-617`]. No policy lets
   a member change, overwrite or delete a stored file.
4. **Older files stay where they are.** Files saved before the store folders
   (`<department_id>/<file>`, `feedback/<file>`, `imports/<file>`) are recorded once, with
   their store, in `app_auth.legacy_document`: a photo's department; otherwise the store of the
   account that saved it; otherwise, for a suggestion file, the store of the one suggestion
   naming it; otherwise the only store, when there is one. When none settles it the store
   stays empty and nobody opens the file in the app [R `supabase/auth_setup.sql:508-556`].
   Members cannot read or write the record, and a suggestion written later cannot claim a
   recorded file (`supabase/documents_by_role_test.sql` section 4). The import screen lists
   the store's folder and the older shared one [R `src/app/import/page.tsx:52-71`].
5. **Applied without a person.** `supabase/documents_by_role.sql` runs from `run-order.txt`
   after `money_by_role.sql`, whose `can_see_money()` it uses
   [R `supabase/run-order.txt:27-28`]. With enforced login it is exactly `auth_setup.sql`
   sections 3d and 3f; on a demo database it changes nothing, the same test
   `money_by_role.sql` uses.
6. **The screens follow the same rule.** The home feed asks for no invoice thumbnail for a
   role that cannot see money [R `src/components/StaffFeed.tsx:58-76`], and a file the member
   may not open gets no link instead of a broken public one [R `src/lib/docs.ts:17-21`].

## Conditions

1. A new kind of stored file is added to `src/lib/documentPath.ts`, section 3f,
   `documents_by_role.sql` and `documents_by_role_test.sql` together. The project skill says
   uploads go through `documentPath()`.
2. `supabase/documents_by_role_test.sql` passes on a fresh copy and an upgraded copy before any
   change to section 3f merges.
3. After the merge, two read-only checks on the live database:
   `select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects'`
   returns exactly `documents_open SELECT` and `documents_save INSERT` (policies add up, so
   these must be the only two); and
   `select kind, store_id is null as no_store, count(*) from app_auth.legacy_document group by 1, 2`
   says how many older files were recorded and how many have no store.
4. A staff smoke test once the first staff login exists: Capture saves a photo, the home feed
   shows the capture without a picture, and a suggestion with a screenshot gets its AI
   description. The owner opens an invoice photo and sees older and newer workbooks on Import.

## Consequences

Accepted costs:

- Staff no longer see invoice thumbnails on the home feed, their own captures included. The
  owner chose this; the capture itself still shows in the feed.
- A page opened before the update saves to an older-style name, which is refused; reloading
  the page fixes it. The update and the migration land within minutes of each other on merge.
- An older file whose store cannot be told opens to nobody in the app; it stays in the bucket
  and in the Supabase dashboard. Condition 3 counts them.
- The app can no longer save an older-style name, so after the first run the record only grows
  if somebody puts such a file into the bucket from outside the app; it is recorded at the
  next merge by the same rules.
- Leads see money but do not open the workbook archive, because they cannot import. Whether
  they should [Q: Ravi Kiran].
- "The member who attached it" means the signed-in account that saved the file. A suggestion
  file saved before login was on has no such account, so only lead, manager and owner open it.
- Every file read runs one function per file row. The largest read is the feed's 40
  thumbnails.

Benefits:

- Staff logins can be made without opening invoice photos, other members' attachments, the
  workbook archive, or another store's files.
- Capture keeps working for staff, and so does the AI read of a staff member's own screenshot.
- Nothing in the bucket moves, and no script runs with the service key.

## Alternatives considered

- **Move the older files into store folders.** Rejected: only the storage service can move a
  file, with the service key, outside the migration workflow.
- **Look up an older suggestion file's store from its suggestion at every read.** Rejected: any
  member writes suggestions, so a suggestion could name another store's file and claim it.
  Recording once at migration time closes that.
- **A bucket per store or per kind.** Rejected: the same rules in more places, a new bucket for
  every store, and every screen changed; folders do the same in one bucket.
- **Staff open the invoice photos they took.** Rejected by the owner: an invoice shows prices.
- **Every member of the store opens every file.** Rejected by the owner.
- **Serve every file through an API route with the service key.** Rejected: every thumbnail
  through a function, a new service-key route, and the database rule still needed for the
  browser's direct calls.

## Related

docs/ARCHITECTURE.md section 7 and open items (ARCH-04), ADR-003 (money in the tables),
docs/SUPABASE_SETUP.md (run order), `supabase/documents_by_role_test.sql` (the proof),
docs/VERIFICATION.md (the sign-off row).

## How this maps to the rest of the docs

The rule for uploads is in `.claude/skills/robinsons-store/SKILL.md` (Documents, and
invariant 6). The live state of the storage policies is read, not assumed: ARCHITECTURE
section 7 says when it was last read.

**Basis: 20 claims checked this session (2026-10-25), 20 confirmed, 0 killed, 4 sources.**
Confirmed by opening each cited file and line; by running `documents_by_role_test.sql` and the
app's storage calls through `@supabase/storage-js` 2.106.2 against supabase/storage-api
v1.79.5 on supabase/postgres 17.11.0.005, on copies built from this branch and from main
(fresh, upgraded, demo, single store); by reading the storage service's own insert and renaming
one stored row; and by adding one extra storage policy to a passing copy, which the test then
failed. The owner's choice is `[D]` until Ravi Kiran confirms it, the hosted storage service is
`[J-open]` with its kill condition, and the lead question is `[Q]`. Reviewed by money-reviewer
and the invariant auditor; the check for every storage policy and the Capture button that waits
for the store came from those reviews. Sources: this repository, the local test databases, the
storage service, the owner's relayed answer.
