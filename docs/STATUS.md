# Status and what is left

Single source for the current state of the build: what is done, what is verified, and what remains. The full vision is in robinsons_store_build_spec.md, setup is in RUNBOOK.md, and the per-feature sign-off record is in docs/VERIFICATION.md. Update this file and VERIFICATION.md in the same pull request as the work itself; if it is not recorded there, it is not done.

Last updated: 2026-10-30, on branch capture-invoice-checks (latest: the invoice reader's lines checked against the printed totals, below; before it every role passes the file check for a screenshot description, below; before it department field follow-ups, below; before it department field export error handling, below; before it screenshot descriptions follow the screenshot, below; before it the nine-diagram Miro board and separate archive, below; before it product direction and skill precedence, below; before it stored files fenced by store and role, below; before it money fenced by role at the database, below; before it PR #86 documents builder self-checks and the develop-to-main release flow, below; before it the AI view and the standards map in the architecture doc, below; before it tier A self-merge wired into the Slack loop, below; before it module checks and automation tests run in CI by convention, below; before it accounts moved, docs brought up to date and the dev environment turned on, below; before it the architecture diagrams corrected against the code, below; before it the architecture record of the AI usage log and the main ruleset, below; before it the money-type and region record round, below; before it the handover written to the standard, with the agents register and onboarding, below; before it the handover is prepared, below; before it the dev guard of 2026-09-01, recorded late; before it the deploy scare, corrected the same day, below; before it the invoice field registry and the first automated migration, below; before it the owner's answer on the vendor question map; before it Jira switched off with its autopilot parked and the watchdog moved to Slack, below; before it the vendor field registry; before it the platform capability round, the health check naming its own fix, owner round 6, owner round 5, the domain and email integration round in docs/DOMAIN_EMAIL.md, the vetting round, the Jira backlog round, the live-demo round, and owner feedback round 3).

Invoice lines checked against the printed totals, 2026-10-30 (branch capture-invoice-checks, see
VERIFICATION.md):
- The invoice reader now also copies the invoice number and the subtotal, HST and total printed
  on the paper. Capture adds up the lines (qty x unit cost) and compares them with those
  figures. It is arithmetic, not a second AI call, so it does not count against the 100 calls a
  day.
- When they disagree by more than 5 cents, Capture shows the printed figure under the Subtotal
  with the difference, and will not save until someone ticks "I checked the lines against the
  invoice total". Retyping the misread line clears it, and a tick lapses if a later edit changes
  what the lines add up to. A printed figure that cannot be read as a number also needs the tick,
  unless the lines make the printed subtotal. Staff see that the lines do not add up, never the
  amounts. The tick is stored with the amber-line acknowledgement; no database change.
- When the paper prints only a total and the lines make it as it stands, Capture shows the
  Total as the lines and HST as "not printed", instead of adding 13% on top. Before this, a
  $113.00 receipt showed a Total of $127.69. Such paper cannot say whether its prices include
  tax or no tax was charged, so Capture does not guess: the order check compares the lines as
  they are (a real overcharge is never hidden), and its warning gives the pre-tax figure in
  case the prices include HST. Nothing saved changes: Capture stores no tax figure.
- Expect the tick on the second half of a long invoice photographed in two parts: its printed
  total covers lines that are not in that photo, and the warning says so.
- Capture's vendor match now ignores case, punctuation ("O'Reilly" is "OReilly"), "&" against "and", and a trailing Inc,
  Ltd, Limited or Co, within the department. If two vendors match that way, neither is picked.
- The invoice number goes at the start of the notes; the form has no box for it. One that
  carries an amount is left blank, since staff read the notes.
- Proven: scripts/extractvalidate-check 97 of 97, failing under each deliberate break of the
  check; an independent read-only review found eight issues, all fixed with a test each; the AI eval scorers 124 of 124, with a new case for a photo of page 2 only; the offline
  eval through the real route 24 of 24, the known gap still failing. Of the 12 wrong answers in
  the existing eval samples that change what the lines add up to, the totals check flags all 12. It
  cannot catch a subtotal worked out from the lines instead of copied, or a carried-forward
  balance read as a purchase; the page-2 case pins both for the live run.
- Not yet: a live run against the model, and the screen in a browser. Open: when staff save
  with the lines still not adding up, their costs are saved as read; whether those should be
  left blank for the owner, as amber costs are, is the owner's call [Q: Ravi Kiran].


Department field follow-ups, 2026-10-30:
- BUILT. The invoice check uses opposite vendor and invoice choices for unlocked terms
  [R scripts/invoicefields-check/check.js:121-135]. Department field docs and the in-app
  guide now describe owner edits and manager reads [R src/lib/appGuide.ts:97-101].
- Architecture references now include the department field table, export and health checks
  [R docs/ARCHITECTURE.md:214-216, 437-442].
- Verification: JavaScript syntax and diff checks passed. The invoice module check needs
  a TypeScript compile; it and the app gates were skipped because node_modules is absent.


Department field export error handling, 2026-10-30:
- BUILT. Export marks department fields as not set up only for missing-table codes; other read errors return a failed export [R src/app/api/export/route.ts:98]. Paging preserves the error code and table name [R src/lib/exportPaging.ts:59].
- Verified offline: scripts/importexport-check, 36 passed; export handler with a fake database, four cases passed (two missing-table codes, a timeout code and no code). App gates deferred because node_modules is absent [V-run, local checks, 2026-10-30].

The Department fields screen, 2026-10-25:
- PARTIAL. The owner picks, per department, which questions the vendor and invoice
  forms ask, on Admin, Department fields; managers can read the choices
  [R src/app/department-fields/page.tsx:64, 202-210, 235-236]. It
  answers the ask relayed on 2026-10-25 for the vendor and invoice profiles. The payment
  profile is not on it: which payment questions should vary is open [Q: the requester].
- The ticks live in a new store-scoped table, `department_field`, one row per changed box
  [R supabase/department_field.sql:15]. No rows means the code lists in vendorFields.ts and
  invoiceFields.ts apply unchanged, so merging changes no form until somebody saves.
- Locked, whatever the screen says: a vendor's name and status
  [R src/lib/vendorFields.ts:89]; an invoice's number, date, amount, tax, freight, filing, due
  date and status [R src/lib/invoiceFields.ts:80]. Freight keeps its scope (not asked of
  Payrolls & Taxes) because invoiceTotal adds a saved freight whatever the form shows. Newly
  selectable: phone, email and notes on the vendor forms and terms on the invoice forms,
  which the forms used to draw for everyone.
- Sections take their department's questions on every vendor and invoice form
  [R src/lib/departments.ts:85]. Until now the vendor page used the section's own name
  [R src/app/vendors/[id]/page.tsx:144], so a Gifts vendor was asked DryGoods' questions when
  it was created and every question when it was edited. One visible change follows: Garden
  Center invoices now ask for a PO number, as Hardware's do.
- Only the owner can change the choices (owner-only since PR #93); every store member,
  including managers, can read them [R supabase/auth_setup.sql:170-199]
  [R supabase/department_field.sql:43-67]. /api/health checks that the table is present
  [R src/app/api/health/route.ts:75-77, 271-293].
- Not yet checked: the screen against the live database and the upsert under the live
  policies. Both are the first thing to try on the preview after merge [Q: owner].

The Slack lifecycle workflow runs its scripts from the base branch, 2026-10-30:
- `slack-lifecycle.yml` now checks out `pull_request.base.sha` on a pull request event and
  the default branch on a CI result or a run by hand. `slack-lifecycle-stage.mjs` and
  `slack-status.mjs` run from that checkout. Before this, a pull request event ran them from
  the pull request's merge commit, and a run by hand from whichever branch it was started on.
  A CI result already read the default branch; the ref now says so.
- New `.github/scripts/slack-lifecycle.test.mjs` (21 checks) fails if the checkout loses its
  ref, if the ref gives anything but the base for any trigger the workflow listens to, if a
  trigger is added without a matching case, or if a script runs before the checkout.

Every role passes the file check for a screenshot description, 2026-10-30 (branch
claude/feedback-summary-follow-up; ARCH-15, ADR-005, see VERIFICATION.md):
- A description opens only to members who may open the file it was read from, saved under that
  name by the time the description was, lead, manager and owner included. One whose file is
  not in storage, or that names no file, opens to nobody.
- The database dates every save of a description, a rewrite included, so reading a replacement
  screenshot again keeps the description open to whoever saved the new file.
- Applies on merge: supabase/feedback_summary.sql runs again from run-order.txt and matches
  auth_setup.sql section 3g; schema.sql has the same date trigger for fresh installs.
- feedback_summary_test.sql has new cases for a missing file, a later file, another store's file,
  a workbook, a description with no file, and a replaced screenshot. Verify after the merge with
  ADR-005 condition 3.

Screenshot descriptions follow the screenshot, 2026-10-25, merged and applied to the live
database 2026-10-30 (branch claude/arch-04-feedback-summary; ARCH-15,
docs/adr/ADR-005-screenshot-descriptions-follow-the-screenshot.md, see VERIFICATION.md):
- The AI's description of a suggestion screenshot lives in its own table, feedback_summary, and
  opens to the same people as the screenshot: lead, manager, owner, and the member who attached
  it. The suggestion itself, its note and screen, opens to the whole store.
- The screenshot reader saves as the member who asked for it and is told not to copy dollar
  amounts, pay or personal details. Suggestions, the developer digest and the export read the
  new table. Older descriptions moved into it and feedback.ai_summary is dropped.
- It applies itself: supabase/feedback_summary.sql runs after documents_by_role.sql and matches
  auth_setup.sql section 3g. Demo databases get the table open like the others. The migration
  run on main 373b2b5 applied it to the live database.
- Proven on Supabase Postgres 17 with the storage schema: feedback_summary_test.sql 85 of 85 on
  a fresh install, on a copy upgraded from main, and on one upgraded from the stored-files
  branch, 5 of 5 on demo copies; the Suggestions reads and the reader's calls through PostgREST
  and the storage service, 33 of 33; documents and money tests still 163 and 130.
- Verify on the live database: ADR-005 condition 3.

The architecture board on the store's Miro account, 2026-10-30:
- BUILT: "Robinsons store architecture" shows the nine diagrams of docs/ARCHITECTURE.md,
  built in Miro from the doc's Mermaid with the same colour key and named by section and
  date [R pr/81:docs/ARCHITECTURE.md:695].
- The six older diagrams and their labels moved to a separate board, "Robinsons store
  architecture, archive" [R pr/81:docs/ARCHITECTURE.md:695].
- docs/ARCHITECTURE.md stays the source. When its Mermaid changes, redraw the matching
  diagram on the board [R pr/81:docs/ARCHITECTURE.md:695]. docs/HANDOVER.md lists both boards.
- Docs only; no code, schema, policy or workflow change.

Product direction recorded, 2026-10-30 (branch agent-skills-setup):
- REQUIREMENTS.md is the canonical home for product direction; CLAUDE.md and the
  robinsons-store skill point there. Multi-store support is PARTIAL, and onboarding a
  second store without code changes is TARGET. The configuration list includes the reorder
  prompt and alert email branding. Docs only; no app code changed.

Agent tooling, 2026-10-30 (branch agent-skills-setup):
- AGENTS.md at the root points Codex and other agents at CLAUDE.md and the robinsons-store
  skill, so every agent follows one set of rules. CLAUDE.md lists the skills, reviewers, MCP
  server and Stop hook the repo carries.
- vercel-react-best-practices is vendored from vercel-labs/agent-skills into .claude/skills
  and .agents/skills and pinned in skills-lock.json. web-design-guidelines from the same
  source was not taken: it downloads its rules from the network on every run.
- The robinsons-store skill description is cut to 915 characters; the Agent Skills limit
  is 1,024 and the old one was 1,244. The skill body now points to REQUIREMENTS.md for
  product direction, delivery states and configuration gaps.
- Root AGENTS.md defines skill precedence, with a pointer in CLAUDE.md. The React skill is
  registered in docs/AGENTS.md and LOOP_ENGINEERING.md; its vendored files are unchanged.
- Instructions and skills only; no code, schema, policy or workflow change.

PR #88 promotion follow-up, 2026-10-30:
- Promotion records main before CI, fetches it again immediately before the merge, and
  continues only if main is unchanged. The head remains pinned with --match-head-commit.
- README.md describes CI on both branches; ENVIRONMENTS.md requires a successful dev script
  run before SQL promotion; LOOP_ENGINEERING.md and CAPABILITIES.md describe promotion.
- Verification: automation tests run locally; app gates skipped because dependencies are absent.

CI on `develop`; promotion merges only on green CI, 2026-10-30:
- CI now starts by itself on every pull request into `develop` and every push to it, as on
  `main`. Before, the documented path for app changes ran no checks unless someone started CI
  by hand; #71, #83 and #85 target `develop`. They get a run on their next push or update from
  `develop` once this reaches `develop`. The leftover `claude/great-johnson-CFSbi` trigger is
  gone; that branch no longer exists on origin.
- `promote.yml` no longer merges with `--auto`, which with no required checks on `main` could
  merge at once. It now does what the Slack loop's tier A step does: requires `develop` to
  hold everything on `main`, starts CI on the pull request's head commit, waits, reads the
  pull request again, and merges with `--match-head-commit`. Anything unexpected leaves the
  pull request open and fails the run. After the merge it starts CI on `main` and, when
  `supabase/` changed, Apply database scripts, since a merge made with the workflow's token
  may start neither.
- Docs: ENVIRONMENTS.md, LOOP_ENGINEERING.md section 3, CONTRIBUTING.md, the ARCHITECTURE.md
  promotion row (was SCAFFOLDED with no `develop`; now PARTIAL), CAPABILITIES.md item 40
  (auto-merge no longer used), two ONBOARDING.md line references.
- Open: the promotion has not run end to end on GitHub. First run after this merges: expect a
  hold until `develop` is brought level with `main` (it lacks #56 today). Whether GitHub
  starts no push workflow for a merge made with `GITHUB_TOKEN` stays `[J-open]` (ADR-002
  context item 3); the dispatches are safe either way.
- Tier C (`.github/`): a person merges. Then bring `develop` level with `main`, which is the
  step that makes pull requests into `develop` show CI.

PR #87 documentation follow-up, 2026-10-30:
- Added the status line, related-docs paragraph and basis footer to docs/README.md, and
  expanded the architecture catalogue entry for PR #81.
- CONTRIBUTING.md points to the release checklist before real staff use.
- Verification: local link and format checks; app gates skipped because dependencies are absent.

Docs organized into one entry path, 2026-10-30:
- docs/README.md now routes by reader (new member, builder or AI session, owner, checker),
  lists the rules every session loads, adds a 13-step learning path (one component per
  sitting: read the doc, open the code, answer one question) and states the six rules that
  keep AI-written docs trustworthy. It also lists the Slack app manifest, which was missing.
- The root README.md and CONTRIBUTING.md are rewritten. Both still described login, signed
  URLs and the confidence gate as to-do; CONTRIBUTING also called integer cents planned, CI
  lint and build only, and the repository untested. They now route to the current docs and
  list every CI step.
- docs/LOOP_ENGINEERING.md: the watchdog runs after CI, not after the deploy; the Refine
  section no longer calls the parked Jira board the queue; Costs describes the Slack sweep;
  two improvement items no longer mention a ticket or a dev database still to build.
- Pointers fixed: the standards path in ARCHITECTURE.md, docs/SOURCES.md in the skill and the
  build spec, the doc count in CLAUDE.md, the invariant count in VERIFICATION.md; a personal
  account name removed from two evidence lines. The build spec carries a history banner.
- Docs only; no code, schema, policy or workflow change. Tier C, because it edits CLAUDE.md,
  the skill, LOOP_ENGINEERING.md and an ADR: a person merges.

Stored files fenced by store and role, 2026-10-25 (branch claude/arch-04-stored-files; ARCH-04,
docs/adr/ADR-004-stored-files-by-store-and-role.md, see VERIFICATION.md):
- Who opens which stored file: invoice photos only lead, manager and owner;
  screenshots and voice notes those three and whoever attached them. The workbook archive
  opens to owner and manager, the roles that import. Each member sees only their own store's.
- New files are saved under the store's folder and a kind folder. Staff still save the invoice
  photo in their hand from Capture but do not open it again, so the home feed shows their
  captures without a picture; a staff member's own screenshot is still read by AI. Files
  saved before are recorded once with their store, so nothing in the bucket moves.
- It applies itself: supabase/documents_by_role.sql runs after money_by_role.sql and matches
  auth_setup.sql sections 3d and 3f. Demo databases stay open.
- Proven with Supabase Postgres 17 and the Supabase storage service: documents_by_role_test.sql
  163 of 163 on a fresh install and on a copy upgraded from main, 5 of 5 on demo copies;
  through the storage service with the app's own client, 55 of 55 fresh and 108 of 108
  upgraded, older files included; money_by_role_test.sql still 130 of 130.
- After the merge: read ADR-004 condition 3 once. A page left open from before the update
  needs a reload before it can save a file. Open: whether leads open the workbook archive.

Money fenced by role at the database, 2026-10-25 (branch claude/arch-03-money-by-role; ARCH-03,
docs/adr/ADR-003-money-by-role-at-the-database.md, see VERIFICATION.md):
- A staff login can no longer read a dollar figure straight from the database. The nine tables
  that carry one (vendor, purchase_order, invoice, credit_note, insurance_policy, payment,
  payment_allocation, pay_rate, receiving_line) open only to lead, manager and owner, and the
  payment functions refuse staff. A payment can only be allocated to an invoice in the same
  store.
- Staff screens read three views with no dollar column: vendor_directory (Capture's vendor
  list, Ask), invoice_due (the bell's overdue count, the Due list) and insurance_renewal (the
  bell's renewals, Compliance). Money roles keep reading the tables. Capture still saves priced
  lines for staff; staff cannot read them back.
- It applies itself: supabase/money_by_role.sql is last in run-order.txt, and auth_setup.sql
  section 3e carries the same block so a rerun keeps money locked. Demo databases stay open.
  Capture falls back to the vendor table if a deploy lands before the migration.
- Proven on Supabase Postgres 17: supabase/money_by_role_test.sql passes 130 of 130 on a fresh
  install and on a copy of main's scripts after the migration, 8 of 8 on demo copies; 48 of 48
  app read and write paths pass through PostgREST v14.18; the AI evals pass offline, 23 of 23.
- After the merge: nothing to run on the live database. Read the two checks in ADR-003
  condition 3 once. The dev database runs in demo mode, so the script only adds the views
  there. Stored files are covered by ARCH-04 (ADR-004). Staff
  opening a manager-only screen by its address (Vendors, Payments, Reports, Employees) now see
  an empty list.

PR #86 documentation corrections, 2026-10-30:
- BUILT: the docs distinguish the builder's self-check from independent CI; review and ship
  never execute candidate code [R `.github/workflows/slack-autopilot.yml:193-238,308-427,435-480`].
- BUILT: section 6 of docs/ARCHITECTURE.md shows a pull request landing on `develop`, the dev
  preview and a person promoting to `main` [R `docs/ENVIRONMENTS.md:19-27,54-56`].
- Slack intake is switched on since 2026-10-30 (`SLACK_REQUEST_CHANNEL` set); automatic dev
  migrations wait for `SUPABASE_DB_URL_DEV` [R `docs/ENVIRONMENTS.md:75`].

The Slack autopilot's build job only produces the commit, 2026-10-30:
- Four jobs: find, build, review, ship [R `.github/workflows/slack-autopilot.yml:93`, `:170`,
  `:308`, `:435`]. find reads the channel and posts the first card with the Slack token and
  no model. build holds `ANTHROPIC_API_KEY` and a read-only token and nothing else
  [R `:175-176`]; the builder commits, cannot push, and its commit leaves as a git bundle
  artifact [R `:265-292`]. review and ship start on fresh runners at the workflow's own commit
  and read the bundle as data with the new `.github/scripts/autopilot-change.mjs`.
- The Slack token is no longer on the runner the model builds on, before or after the build.
  The reviewers no longer read the build runner's working tree, so a gitignored file or a
  `CLAUDE.md` the builder left there cannot reach them.
- ship now pushes the branch and opens the draft pull request, after the review, and only
  past the guard: a change touching `.github/` or `.claude/` is never pushed and the card
  says a person must make it [R `:480-494`]. A file moved out of those folders counts, and
  so does a commit not built on the base commit find read before the build (a commit on an
  older base would carry that base's `.github/` while its diff looked clean). A push or pull request that fails says so on
  the card instead of passing on the builder's paragraph.
- The build starts from that base commit (`develop`'s tip when it exists), so the diff is
  only the builder's work.
- The builder runs the three gates as a self-check in the build job, which holds
  `ANTHROPIC_API_KEY` [R `.github/workflows/slack-autopilot.yml:193-238`]. Independent CI,
  started by ship on tiers A and B, repeats them without the autopilot secrets
  [R `.github/workflows/ci.yml:28-44`]. review and ship never execute candidate code; they
  read the bundle as data and run scripts from the workflow's own commit.
- Tests: `autopilot-change.test.mjs` (new, 34, real repositories and bundles),
  `slack-autopilot.test.mjs` (86, rewritten for four jobs), `autopilot-review.test.mjs` (55).
  PARTIAL until the first live request runs through all four jobs.

Two read-only reviewers read every Slack pull request, 2026-10-30:
- The autopilot is built but not running: `SLACK_BOT_TOKEN` and `ANTHROPIC_API_KEY` are set,
  `SLACK_REQUEST_CHANNEL` is not, so every sweep stops at its first step. Setting that one
  variable, with the bot invited to the channel, switches it on (docs/SLACK_AUTOPILOT.md).
- A new `review` job sits between build and ship, on a fresh runner at the workflow's own
  commit, with a read-only token. It lays the pull request out as data with agent instruction
  files removed and runs money-reviewer and invariant-auditor as two read-only model runs
  without the Slack text. No verdict line counts as not passed.
- Ship now needs both verdicts to pass, on the same commit, before tier A may merge itself;
  puts the verdicts on the pull request and the reports in the Slack thread (the repository
  is public); starts CI on tier A and B pull requests that did not go through the merge step;
  and sets the card from a tested script, `.github/scripts/autopilot-review.mjs`, which also
  carries the builder's own closing paragraph to Slack as its prompt promised.
- `slack-status.mjs` can post one extra thread reply (`DETAIL_FILE`) for the reports.
- docs/SLACK_AUTOPILOT.md, ARCHITECTURE.md section 6, AGENTS.md, LOOP_ENGINEERING.md,
  HANDOVER.md (Slack row now PARTIAL) and the skill updated in the same change. The store's
  Miro board needs section 6 redrawn (ARCH-12).

AI view and standards map in the architecture doc, 2026-10-30:
- docs/ARCHITECTURE.md has a new section 8, AI: one diagram of how a photo or question reaches
  the model and what checks its answer, a layer table (model, one door, prompt fence, output
  contract, grounding, human confirmation, cost cap, logging, evals, residency, retrieval) and
  the AI risks by their OWASP and NIST names. Old sections 8 to 10 are now 9 to 11.
- A table at the top names the notation or standard each view follows (C4 levels 1 and 2,
  UML sequence and state, crow's foot ER, DORA, PIPEDA, OWASP, NIST AI RMF, ISO/IEC/IEEE 42010,
  arc42). Names only; no conformance claimed.
- Found: the store name and town are written into the Ask, reorder and alert prompts
  (ARCH-13, blocks a second store). The AI evals have never run against the model (ARCH-14).
- Two more views and a colour key: a target context in section 1 (email intake, QuickBooks,
  point of sale, Google Sheets sync, Slack questions, a search index, a second store, each
  with its state and what it waits on) and an AI enablement view in section 8 (Suggestions,
  the requirements ledger, the rules and templates every Claude session loads, the Slack
  autopilot). Colour means state only: plain BUILT, amber dashed SCAFFOLDED, grey dashed
  TARGET; planned pieces stay on the diagrams instead of being dropped.
- The Slack autopilot was switched on 2026-10-30 (`SLACK_REQUEST_CHANNEL` set at 20:57 UTC,
  read live). Slack questions and automatic filing of asks are the developer's stated
  direction with no design yet.
- The store's Miro board now has all nine diagrams, with the colour key, built in Miro from the doc's Mermaid and
  named "N. Section, 2026-10-30". The six older ones moved to a separate board, "Robinsons
  store architecture, archive" (ARCH-12 closed).
- Docs only; no code, schema, policy or workflow change.



Tier A self-merge wired into the Slack loop, 2026-10-24 (ADR-002, closes ARCH-10):
- The Slack autopilot now runs the tier classifier on every pull request it opens, labels it
  `tier-a`, `tier-b` or `tier-c`, and comments why. It does this in a second job on a fresh
  runner, from the workflow's own commit, against the pull request's real base; the build job's
  token can only push and open pull requests [R `.github/workflows/slack-autopilot.yml:68-79`,
  `:197-282`]. PARTIAL until the first live request shows a label.
- Tier A (words only, 300 lines or fewer) merges itself after CI passes on its exact head
  commit, with the pull request read again and the merge pinned to that commit; anything
  unexpected leaves it for a person [R `.github/workflows/slack-autopilot.yml:284-343`].
  SCAFFOLDED: off until the repository variable `AUTOMERGE_TIER_A` is `true`. Before setting
  it, see ADR-002 conditions 2 to 4.
- Instructions and configuration are never words, whatever the switch: every agent
  instruction file by name at any depth (CLAUDE.md, AGENTS.md with docs/AGENTS.md, GEMINI.md,
  SKILL.md and the like), agent folders, `skills-lock.json`, LOOP_ENGINEERING.md, `docs/adr/`,
  and any `.sql`, manifest or config file are tier C. Words means `.md` and `.txt` under
  `docs/` and `.md` at the root, as plain text; scripts, pages, images, links and binary files
  are tier B, as is the in-app guide [R `.github/scripts/classify-change.mjs:25-79`].
- The rules are pinned by `classify-change.test.mjs`, 110 cases, run in CI
  [V-run, `node .github/scripts/classify-change.test.mjs`, 2026-10-30: 110 passed].
- Open: whether GitHub's `GITHUB_TOKEN` rule is what kept CI off Slack pull requests, and
  whether a dispatched CI run on main wakes the post-deploy watch [J-open, kill conditions in
  ADR-002]. The merge step fails closed either way. The parked Jira loop still merges with
  `--auto`; replace that step before waking it (ADR-002 condition 5).

Module checks and automation tests run in CI by convention, 2026-10-30:
- CI's new "Module checks" step runs every `scripts/*-check/run.sh` in name order and stops
  at the first failure. "Automation rules" now runs every `.github/scripts/*.test.mjs` in a
  loop instead of a hand-kept list. A new check or test needs no `ci.yml` edit.
- `scripts/vendorfields-check` (the money-field gate) and `scripts/invoicefields-check` (the
  department matrix) each gained a `run.sh` and now run on every pull request; before this
  they ran only by hand. The `run.sh` contract is in the vendorfields-check README.
- The checks already in CI with their own steps (extraction, Ask grounding, AI evals, AI
  usage, import and export) are unchanged. Commit 2f4b1ea.

Accounts moved, docs brought up to date, dev environment turned on, 2026-10-30:
- The move to the store's accounts is done and the docs now say so: the Vercel project is
  on the store's team `robinsons-store1` and the code is at `robinsons-store/robinsons-store`,
  read live today. docs/HANDOVER.md is now the register of what the store owns and every
  secret, with eight open items (A-01 to A-08) in place of the move's steps. The two
  step-by-step move notes under docs/owner-notes/ are deleted; ADR-001 is ACCEPTED with its
  outcome recorded. ONBOARDING, PLATFORM, REQUIREMENTS, AGENTS, ARCHITECTURE, DOMAIN_EMAIL,
  RUNBOOK, the docs index, the skill and CLAUDE.md no longer describe the move as pending.
- Still open and not part of the move: Supabase was on Free when last read and the Vercel
  plan is unconfirmed (A-01, both platform risks stay open); the Anthropic key in Vercel is
  the original from 2026-05-29 and `CRON_SECRET` is not set in Vercel (A-02).
- The Vercel diagnose and protect workflows asked the old personal team, so they would have
  answered "not found" since the move. They now ask the store's team, or `VERCEL_TEAM_ID`
  when that variable is set.
- Dev environment: still not on (no `develop` branch, no dev database). Found today: every
  pull request preview read and wrote the live database, because the Supabase URL and key
  targeted Preview as well as Production. Fixed the same day, and dev is now on: Supabase
  project `robinsons-store-dev` (Canada Central) loaded from main with schema, seed,
  seed_dev and every run-order script (2 stores, 46 vendors, 37 invoices, RLS on every
  table, columns identical to production apart from the login column); Vercel Preview reads
  it and Production alone reads the live database; branch `develop` exists and deploys to
  robinsons-store-git-develop-robinsons-store1.vercel.app. `DEV_URL` is set. Still open for
  admin@: the `SUPABASE_DB_URL_DEV` secret, which holds the dev database password. Dev runs
  in open demo mode while production enforces login. docs/ENVIRONMENTS.md is rewritten around one Vercel
  project (Preview becomes dev) instead of two.

Architecture diagrams corrected against the code, 2026-10-30:
- An edge-by-edge check of the six diagrams in docs/ARCHITECTURE.md against main found arrows
  the code does not back. Corrected: the watchdog calls the app, not the database; the build
  calls Anthropic from GitHub Actions; admin users, alerts, health and import use the service
  role; the capture loop has a manual branch and the AI usage cap; `edit_payment` can move a
  paid invoice to post-dated; store and vendor links are nullable; the watchdog runs when CI
  finishes, not on deploy; the Slack card reaches "live" only by hand.
- Section 7 now names the two routes that take no session (health, alerts) and that extract
  returns line costs to any signed-in member. Five stale line references fixed.
- At that check, the store's Miro board still showed the old diagrams (ARCH-12). CLOSED
  2026-10-30: the nine-diagram board and separate archive are recorded above.
- Docs only; no code, schema, policy or workflow change.

Architecture record of the AI usage log and the main ruleset, 2026-10-25:
- docs/ARCHITECTURE.md section 2 now shows the API writing the `ai_call` log and describes
  the daily per-store cap (default 100 calls a day, `AI_DAILY_CAP_PER_STORE`); section 5 lists
  the table. Reading the log is PARTIAL until `auth_setup.sql` is rerun by hand, because
  migrate does not run that file.
- Section 6 now records that main accepts changes only through a pull request (no direct
  push, force-push or deletion), read live from the repository ruleset.
- Docs only; no code, schema, policy or workflow change.

Money type and region record, 2026-10-24:
- Money is numeric dollars and stays that way; integer cents is no longer planned. The
  schema.sql header, ARCHITECTURE.md, the skill, data-model.md and the Deferred list below
  now all say so, and ARCH-09 in ARCHITECTURE.md is closed with that decision. Comment and
  doc change only; no column changed.
- Montreal: confirmed the same day and recorded in the handover entry below and in
  VERIFICATION.md (function region yul1).

Data loads kept out of the repository, 2026-10-24 (branch keep-data-loads-local):
- `supabase/seed_bookings.sql` and `supabase/seed_schedule.sql` are no longer committed. The
  generators (`scripts/generate-seed-bookings.mjs`, `scripts/generate-seed-schedule.ts`) write
  them on the developer's machine from the store's workbooks, and `.gitignore` keeps them out.
  Neither was ever in `supabase/run-order.txt`, so no workflow applied them and the live
  database is unchanged.
- `supabase/seed.sql` keeps its curated vendors with made-up phone numbers (705-555-01NN) and
  no email addresses.
- RUNBOOK Step 2, the store skill's file map and the Kiro data-model notes say how to generate
  the loads locally.

Pull requests on main and a read-only Supabase MCP config, 2026-10-24 (branch repo-protect):
- `.mcp.json` keeps the Supabase MCP server, now with `read_only=true` and only the `docs`
  and `debugging` tool groups: documentation search, logs and advisors.
- CI checks it: `.github/scripts/distinct-databases.test.mjs` reads `.mcp.json` and fails if
  a hosted Supabase URL drops `read_only=true`, has no `features` list, or gives production
  any group beyond those two. Fourteen new cases, plus the committed file.
- Pull requests required on `main`: one branch ruleset (pull request with no required
  approvals or status checks, no force pushes, no deletion), applied 2026-10-24 as a
  repository setting. `gh api 'repos/{owner}/{repo}/rules/branches/main' --jq '[.[].type]'`
  returns `["deletion","non_fast_forward","pull_request"]`.
- docs/LOOP_ENGINEERING.md, CAPABILITIES item 9 and its Supabase MCP row, and the Kiro coding
  conventions (model failures return a non-2xx status) now match.

The handover written to the standard, 2026-10-24:
- docs/HANDOVER.md and ADR-001 recorded that every account is opened with
  admin@robinsonsgeneralstore.ca and owned by the store. The move itself is done; see the
  2026-10-30 entry above.
- docs/AGENTS.md registers every agent: four inside the app for staff (invoice reader, Ask the
  store, reorder summary, suggestion screenshot reader) and the build side (Slack autopilot,
  lifecycle, tier classifier, watchdog, two reviewer agents, the stop hook, parked Jira).
- ONBOARDING.md holds the forms for the next team member: what we need from them, the access
  each service grants and why, and their first week.
- The documentation and review standard now lives inside the existing `robinsons-store`
  skill as references/standards.md, rather than as a new skill. Applying it found five stale
  statements, now fixed: the skill described the login cutover as still to do, gave 1062 Main
  St, described money as integer cents, listed three agents of four, and CLAUDE.md said AI
  routes run at low temperature when none sets a temperature.
- docs/ARCHITECTURE.md rebuilt to the standard: numbered sections, nine routes not four,
  context and container diagrams with the automation and the custom domain, the capture
  sequence corrected (the file uploads before the database writes, and the writes are
  separate requests, not one transaction), the four invoice statuses as the payment engine
  derives them, and an open items table. It found two access gaps to close before staff
  logins are made: dollar amounts are hidden from staff by the app and API only, because the
  database policies are scoped by store and not by role (ARCH-03, blocking); and invoice files
  are readable by any signed-in member of any store (ARCH-04, harmless while there is one
  store). It also found that nothing runs the tier classifier now that Jira is parked. Later the same day, Montreal was confirmed and ARCH-01 closed: `x-vercel-id` reads `<edge>::<function region>::<id>` and answered `cle1::yul1::...`, so region checks test the second field, not "starts with yul1".

What leaves Canada, written down, 2026-10-24 (branch ai-data-flows, see VERIFICATION.md):
- docs/PLATFORM.md "What leaves Canada": one row per flow (the four Anthropic routes, the
  Resend due-date email, the Slack autopilot) with what it sends, region and retention, each
  cited to the provider's page as read today. CAPABILITIES item 68 is done; its line saying
  Messages API content is not retained was wrong (30 days by default) and is corrected there.
- docs/owner-notes/store-app-infrastructure.html told the owner that only invoice images reach
  the AI and staff details never do. Corrected: it now lists what each AI feature sends, the
  30-day deletion, the screenshot path and the daily email, and the services table and the
  four-pieces card name screenshot reading. After a fact-check the same day: the AI block
  lists five uses (screenshot reading and the Slack builder added), the services table has
  Slack, and two statements the code does not back were removed (one under "What protects
  it", and an "AI never reads staff records" line). The watchdog now reads as a Slack message.
- The PLATFORM.md Slack builder row says the request text is in the public run log for 90
  days and the build leaves a branch, draft pull request and ledger entries in the repository.
- The Suggestions screenshot picker now says under the field: "Screenshots are read by an AI
  service in the United States. Leave out pay, schedules and staff details."
- docs/ARCHITECTURE.md section 7 restated the old claim; its PIPEDA and Canadian regions
  bullets now describe the screenshot and knowledge-note paths and point at the PLATFORM.md
  table.
- Open: the owner's published page changes only when the developer republishes it.

The handover is prepared, 2026-10-18:
- docs/HANDOVER.md first registered every account and the full list of secrets and
  variables. The move it planned is done; see the 2026-10-30 entry above.
- Read live the same day, not copied from older docs: Supabase is on **Free** (no backups;
  PLATFORM.md risk 2 is now confirmed, not suspected), Vercel is on a personal **Hobby** team
  (risk 1), and the last production deploy was the merge of PR #54 on 2026-09-01, Ready.
- Two gates turned out to be done already, read from the live database: `edit_delete.sql`
  is applied, and so is the login cutover in `auth_setup.sql` (locked per-store policies,
  private documents bucket). One login account exists; staff logins are still to be made.
- Stale records corrected: SLACK_WEBHOOK_URL was listed as still needed though it has posted
  to Slack since 2026-08-17; the CNAME for the custom domain was still listed as an action
  though it has been live since 2026-08-11; PLATFORM.md still listed five workflows and an
  active Jira board; RUNBOOK.md still named a deleted branch.
- Open and urgent: the domain was due to renew 2026-10-16 and nobody has seen it renew. The
  watchdog would not catch a lapse while `PRODUCTION_URL` is unset. Check the Vianet panel.

The dev guard, 2026-09-01 (PR #54, recorded here late):
- Before any script runs against dev, `.github/scripts/distinct-databases.mjs` compares
  which Supabase project each connection string belongs to and stops the run if they are
  the same one. A pasted string in the wrong box would otherwise put invented DEV vendors
  into the store's real directory and run every dev migration on the live ledger, silently.
- Where it cannot tell, it says it did not check rather than claiming a match. The case that
  matters most is the same project written two ways (session pooler on one side, direct
  connection on the other): different text, same database. Sixteen cases pin it.
- The same branch ran the whole dev chain on a real Postgres 16 for the first time:
  schema.sql, seed.sql and seed_dev.sql apply clean, seed_dev.sql is safe to re-run, and all
  nine migrations in run-order.txt converge with the fresh-install path.

Production deploys stopped on 2026-08-13, found 2026-08-17:
- Pushes to main have produced no production deployment since 2026-08-13. The live site is
  still serving the build from before the vendor and invoice registries, so every merge
  since then is invisible to the owner until this is fixed.
- The code is cleared. vercel.json holds only the alerts cron and no deploy settings, and
  the preview deployment for PR #47 built and went Ready on 2026-08-17, which also clears
  the GitHub connection. What remains is the project's production branch setting in the
  Vercel dashboard, which nothing in this repository or this session can see or change.
- The developer corrected the dashboard setting on 2026-08-17. Changing the setting deploys
  nothing by itself, Vercel only acts on the next push to main, so the merge that carries
  this very entry is the test.
- The check, from any terminal:
  curl -sD- -o /dev/null https://robinsons-store.vercel.app/api/health | grep -i x-vercel-id
  An id starting with yul1 means production is deploying again. Still iad1 means the
  setting still does not point at main.
- CORRECTION, hours later the same day, and it is the fifth stale record: there was no
  stoppage. The developer's dashboard showed the merge of PR #48 as the LIVE production
  deployment, Ready, serving app.robinsonsgeneralstore.ca, and a static file fetched from
  that domain is stamped with today's date. Production deploys work and the site is
  current. The evidence for "stopped" was the x-vercel-id header still reading iad1, on
  the theory that any build after 2026-08-12 would answer from Montreal. The theory was
  the bug: the preferredRegion export in the nine API routes has never actually moved
  these functions, so iad1 proves nothing about which build is serving, and the
  capability round's "yul1, 9 routes, done" verdict is REOPENED. To actually run in
  Montreal: Vercel dashboard, Project Settings, Functions, Function Region, Montreal
  (yul1). One dropdown, available on the current plan. Until then the store's requests
  are processed in Washington DC, and the Canada-data goal from the capability round is
  not met.
- What the scare cost and what it bought: three merges chased a problem that did not
  exist, but .github/workflows/vercel-diagnose.yml now exists (manual run, needs
  VERCEL_TOKEN in Actions secrets), which reads deployment states from Vercel's API
  instead of inferring them from response headers. The next question like this is one
  workflow run, not a day of deduction. The production domain is
  app.robinsonsgeneralstore.ca; the vercel.app address also answers but is not the one
  the owner uses.
- Same day, after the correction: the developer set Function Region to Montreal in the
  dashboard and deleted the six dead branches, so the repo is down to main plus the one
  working branch. A region change applies only to the NEXT deployment, so the merge
  carrying this line is also the Montreal test; after it, the x-vercel-id curl should
  finally say yul1 and mean it. Supabase Pro backups are DEFERRED by the developer until
  production is live for the owner and a dev environment exists alongside it. The risk
  stands recorded, not forgotten: until then the store's data has no backups.

The invoice forms read one registry, 2026-08-17:
- Ravi Maddipati proposed on 2026-08-13 that vendor, payment and purchase order fields be
  selectable per department, estimating it covers about 95 percent of the department screens.
  Reviewed and largely right, with one correction recorded: what varies by department is the
  INVOICE, never the payment. Recording a payment is the engine's shape, identical
  everywhere, and the registry deliberately has no reach into it.
- The proof of his point was already in the code: the invoice forms varied by department
  through three hand-coded booleans across nineteen call sites, and they had drifted. The
  edit path nulled a saved PO number and service category on any invoice whose vendor was
  not the matching department, while preserving the estimate number beside them. Fixing an
  amount could silently erase a filing fact.
- src/lib/invoiceFields.ts now answers "is this department asked this invoice question"
  once, for the form, the validation and the save paths together. Department matching goes
  through canonicalDepartment, so Chip Stand takes Grocery's invoice shape the same way it
  takes its vendor questions.
- Asking-side behaviour is preserved EXACTLY, pinned by scripts/invoicefields-check (19
  assertions, full department matrix). The one deliberate change is on the saving side: the
  edit path now writes a hidden question's seeded answer back instead of nulling it.
- Purchase order fields are uniform across departments today, so there is nothing for a PO
  registry to hold yet; the invoice registry is the pattern waiting for the first
  per-department PO ask.
- The first automated migration also completed this round: merging PR #46 applied
  vendor_specializes_in.sql to the live database, the health check passed, and the
  production-success message posted to Slack, proving the webhook path the watchdog could
  never exercise while the site stayed healthy.

Jira is switched off, 2026-08-12:
- The board is out of use and its autopilot is PARKED, not deleted. The workflow, its
  scripts and docs/JIRA_AUTOPILOT.md are all still here with the schedule commented out, so
  a future Jira account can wake it up instead of rebuilding it. CI still runs its tests, so
  it cannot quietly rot while parked. The autopilot swept Jira every 15 minutes against a
  board the owner has never written to, so the intake loop was paying to discover there was
  nothing to do.
- CORRECTION, 2026-08-13. This was first recorded here, and told to the developer, as "96
  model runs a day". That was wrong. The model step was correctly gated behind having found
  a ticket, so an empty board started no model and cost no tokens. The real waste was
  GitHub Actions minutes: every sweep ran actions/checkout and npm ci BEFORE checking, about
  a minute each, which is roughly 2,880 minutes a month against a 2,000-minute free
  allowance. The decision to switch it off stands; the reason given for it did not. The
  Slack loop that replaces it puts the cheap check first, so an idle sweep costs seconds.
- Parked: `.github/workflows/jira-autopilot.yml` and the three scripts it calls. Still
  deleted, because the Slack watchdog and the manual promotion replaced them outright:
  raise-health-ticket.mjs, resolve-health-ticket.mjs and jira-approved.mjs. Those are one
  command away if ever wanted: `git checkout 8d91514 -- .github/scripts/<name>.mjs`.
- The health watchdog keeps its job and moves to Slack. It still asks /api/health after every
  deploy and every two hours, and now posts when the answer CHANGES: once when the site goes
  down, once when it recovers, nothing in between. The state used to be the ticket being open
  or closed; it is now this workflow's own run history, one API call and no model. Set
  `SLACK_WEBHOOK_URL` in Settings, Secrets and variables, Actions to turn it on. Without it
  the step logs what it would have said and exits quietly, so nothing breaks meanwhile.
- One thing is deliberately lost: the Jira version spoke up again when the list of failing
  checks changed mid-outage. Slack has no such memory, and a run's history says pass or fail
  and not what failed. While the site is down the run stays red and the failing checks are in
  its log. Recorded in `health-notify.mjs` so the next person does not think it was missed.
- Promotion to production was gated on moving a ticket to Approved. It is now the act of
  running the promotion workflow by hand: Actions, Promote develop to production, Run
  workflow. That is a worse place for approval to live than beside the request it approves,
  and it is written down as such rather than dressed up. The part that matters is unchanged:
  a person still says yes and no schedule can say it for them. Its half-hourly cron is gone
  too, since there was no board left for it to read.
- Going forward the working channel is Slack.

The vendor form asks what the department asks, 2026-08-12:
- The owner's complaint on 2026-08-11 was that the vendor entry form "has all column or
  elements listed even though we mentioned only few for some of them". He had made the same
  point on 2026-07-27, and docs/OWNER_NOTES.md line 367 recorded it verbatim as "fields
  differ BY DEPARTMENT, the owner's core point". It was never triaged into a requirement, so
  for sixteen days his core point was not work. That is the process failure worth naming
  here, more than the code.
- src/lib/vendorFields.ts now defines what a vendor IS, once, per department: thirteen fields
  with a label, a group, a money flag, the columns they read, and the departments that are
  asked them. The display, both AI routes and both entry forms read from it. Before this,
  eight screens each decided for themselves which vendor columns to load and no two agreed,
  which is why Ask-the-store answered "not on file" for a summer order timeline that was on
  file.
- What changes on screen: adding a bakery vendor asks five questions (name, status, phone,
  email, notes) instead of about thirteen field groups and twenty controls. Dry Goods keeps
  the full merchandise shape. Property Maintenance asks for a technician rather than a rep, which is
  the word the owner's own tab uses.
- The minimum order was mandatory on every save, so a phone-number correction could not be
  saved without answering it. It is now demanded only where the department is asked for it,
  or where somebody has answered it anyway. His rule is not reversed; the question simply is
  not put to departments that never had one.
- Every form that hides a question also offers it back, in one button that says how many.
  The map is seeded from his workbook census, which makes it a best guess, and a guess must
  never be the reason somebody at the counter cannot record something true about a real
  vendor. Pressing the button reveals a question without making it mandatory, so it cannot
  punish the person who pressed it.
- Nothing can be lost by a wrong guess. A saved answer still shows even when the department
  is no longer asked that question, and the edit form writes a hidden field's existing value
  back untouched rather than nulling it. A department the app does not recognise is asked
  everything. 48 assertions in scripts/vendorfields-check hold those rules whatever the map
  says.
- ANSWERED 2026-08-13, by the owner marking up the table: every line confirmed, including
  both I was least sure of. Bakery, Meat and Produce carry no payment terms; Hardware gets no
  summer order timeline. The map already matched what he wanted, so the twelve existing
  questions did not change at all.
- What he added: "Specializes in" for Property Maintenance, the one genuinely new question.
  His MaintenancePayments tab has kept it for years; the app only had it on the invoice, so
  the trade was recorded every time somebody was paid and never against the person. There was
  no way to answer "who is our electrician". supabase/vendor_specializes_in.sql applies
  itself when this merges: migrate.yml runs on any push to main touching supabase/**, and
  SUPABASE_DB_URL has existed since 2026-08-09. Nobody opens the SQL editor.
- What he settled by not objecting: Chip Stand follows Grocery, Checkouts follows Others.
  Both used to match nothing and were therefore asked EVERY question, the opposite of what he
  wanted. They keep their own names on every screen and only inherit the question set.
- His table is now asserted department by department in scripts/vendorfields-check, so a
  later edit to the map cannot quietly walk away from what he actually said.
- Still not answered by him: whether the minimum order stays mandatory on every save for the
  merchandise departments. Option B, only asking where the ordering questions appear, is what
  is built. He has not confirmed it.

The health check names its own fix (SCRUM-12), 2026-08-07:
- The live site has failed its post-deploy health check on "vendor columns present" after
  every deploy since 2026-08-06, and it will keep failing until somebody runs
  supabase/vendor_ordering_fields.sql in the Supabase SQL editor. Nothing in the code is
  wrong. The seven vendor ordering columns are not in the live database yet, so the vendor
  ordering fields cannot save.
- What was fixed here is the reporting, because the failure came back six times and the
  ticket never said what to do about it. /api/health now records which script supplies each
  column it checks for, and a failing check answers with the columns that are missing and the
  file that adds them. That sentence is the one detail the route gives away without
  CRON_SECRET, and that is the part that mattered: the watchdog builds its ticket out of each
  failing check's `detail`, the secret is not set on this repository, and so there was no
  detail at all. Six tickets in a row said "vendor columns present" and nothing more for that
  one reason.
- The script is named per column, not per table, so the fix is the file that is actually
  missing rather than every file that table could be waiting on. The invoice check covers two
  scripts; when only the filing columns are absent it now says filing_locations.sql alone.
  The precise answer costs one query per column and only when a check has already failed.
- A database that does not answer gets no fix sentence. The columns checks cannot tell a
  missing migration from a database that is down, so they ask for `id` first, which every one
  of these tables has: if that fails too, the check reports the error and stays quiet about
  the SQL editor, because "database reachable" is already saying the true thing and running a
  migration would not have helped.
- This change was written on 2026-08-07 and pushed, but no pull request was opened for it,
  so it never reached anybody and the ticket fired twice more. The reason is now known and
  it is a repository setting, not a mistake: GitHub refuses `createPullRequest` from the
  automation's token ("GitHub Actions is not permitted to create or approve pull requests"),
  so the autopilot can push a branch and can never open the pull request for it. Somebody
  has to click Compare and pull request on claude/auto-SCRUM-12. Turning that setting on
  (Settings, Actions, General, Workflow permissions) would fix it for every future ticket,
  and is worth doing once: a branch nobody opens is work that does not exist.
- CORRECTED 2026-08-13: SUPABASE_DB_URL was added around 2026-08-09 and merged scripts DO
  apply themselves now. This paragraph claimed the opposite for days, and I repeated it to
  the developer as recently as this morning when telling him to run a migration by hand that
  the pipeline would have run for him. Merging a change under supabase/ is enough.


Owner round 6 (SCRUM-9 comments of 31 July and 5 August), shipped 2026-08-06:
- **Validation messages now sit under the field they are about**, in red, instead of in one
  card at the top of the page. The owner asked for this after being told "Delivery comments
  are required" above a form with twenty boxes in it. Applied to every required field on the
  vendor page, not only the one he pointed at: invoice add and edit, order add and edit,
  payment record and edit, credit notes, and the add-vendor form. All of a form's problems
  are reported in one pass, so fixing one does not reveal the next.
- **Minimum order** on every vendor: an amount, or a "No minimum order" tick. Never both:
  the form refuses it and a database check constraint refuses it too. It shows on the vendor
  page, on the Add order form beside the amount being typed, and on the Reorder list. An
  order under the minimum gets a note, not a block, because vendors waive their own minimums
  and a top-up against an earlier order is a normal reason to be under it.
- **Three ordering fields** below Products and above Notes and rules, per the owner's layout:
  Summer order timeline (free text, 150 characters, because his six real examples share no
  shape), Location of the order (multi-select over Gift Show, Email, In Person, Rep Show,
  Phone, Vendor Website/Portal, Other with free text), and Reorder status (Reordered /
  No Reorder) with Reorder comments, mandatory when Reordered. Changing the status away from
  Reordered hides the note but never deletes it; there is a Clear it button for when that is
  meant. Reordered vendors are flagged on the Reorder screen, which is the point of asking.
- The minimum order is a dollar figure, so it follows canSeeMoney like every other one:
  hidden from the staff role on the vendor page, the reorder list, and both vendor forms,
  and not required of anyone who cannot see it.
- Autopilot fix: the workflow passed `allowed_tools`, which is not an input the action
  accepts. It was ignored with a warning, so five runs spent six minutes each with no way to
  edit a file, changed nothing, and went green. Now `claude_args`, plus a step that fails a
  run which found a ticket and produced neither a change nor an explanation.

Owner action for this round: run `supabase/vendor_ordering_fields.sql`. **The vendor forms
cannot save until it has**, because they write the new columns. It only adds columns and a
constraint, and it is safe to run twice.

Owner feedback round 3 (2026-07-26/27), all shipped this round:
- Payment EDIT everywhere (vendor page and payments screen): date, method, reference, notes, filing through the new edit_payment RPC; touched invoice statuses re-derive in the same transaction; amount stays locked (void and re-record). Payment row action labels are Void.
- Marking an invoice paid through Edit with no payment recorded now opens the Record payment form prefilled (the owner's video showed his flip-back workaround; that loop is closed).
- Payrolls & Taxes payout category seeded (payments_v2.sql section 8 + seed.sql); finance vendors drop delivery/freight fields.
- Suggestions page (/suggestions + feedback table + /api/feedback-triage): notes, screenshots auto-read into text with the store's Anthropic key, in-browser voice recordings, status flow, developer digest copy, feedback tab in the export.
- Header-driven bookings importer v2 (src/lib/importBookingsV2.ts) built and tested against the owner's real annotated workbook: 125 vendors, 98 orders, 86 invoices, 33 payments with methods/filing/dates, 2 credit notes, AskingInventory wish-list notes. Auto-detected by /api/import ahead of the v1 parser.
- Storefront brand: CSS plaque (dark boards, gold lettering) on login and the sidebar mark, from the owner's photos. KPI tiles no longer overflow on six-digit totals. The notification bell count refreshes live (navigation, focus, open, timer). AI routes return plain text (aiText strip + prompt rules + low temperature + claude-sonnet-5 default).
- New docs: CLAUDE.md (root), docs/REQUIREMENTS.md (living requirements ledger), docs/SUPABASE_SETUP.md (script run order). OWNER_NOTES carries the round-3 transcripts, including the two voice notes that resisted transcription (open item).

Owner actions for this round (in order, each safe to re-run): payments_v2.sql, credit_notes.sql, feedback.sql, then auth_setup.sql last if enforced login is on.

Live-demo round (2026-07-27, late night, PRs #16-#22): installment auto-spread across a
vendor's open invoices (oldest first) with a Pay-across-invoices shortcut; the vendor
Statement view (running balance the way vendors mail it, printable); sheets-sync phase 1
(importer refreshes existing vendors' info from the workbook; docs/SYNC_PLAN.md holds the
two-way design) plus an uploads archive on the Import screen (Previous uploads,
downloadable versions); evolved-header importer support incl. the Local Vendors tab; one
vendor-creation standard (rep and email on the payout quick-add, notes on the directory
form); cross-links (vendor names clickable on Due-and-overdue and payout lists, KPI tiles
open their screens, vendor header shows last order and last payment plus deposits-on-
account and ordered-not-invoiced explainers); payout picker lists whole categories with
counts; the vendors directory grouped by department with count chips; reference boxes
self-explain per method; Ask the store gained the APP GUIDE (how-the-app-works answers)
and deterministic issue logging into Suggestions ("log this issue: ..."). Migration for
the round: payout_fields.sql.

Owner round 5 (2026-07-31, five SCRUM-9 comments of 30 and 31 July): the HST box now shows
its working, because the owner asked where 172.57 came from when a 1,500 subtotal shows 195
under the other tax mode (both figures were right; nothing on screen said why). Comments are
required on invoices, orders and payments, with N/A as the honest answer, so a blank box and
a deliberate nothing-to-note stop looking alike. Every confirmation now records WHERE it is
filed as well as how: choosing Digital or Physical/Digital asks for the file location, so
"digital" stops meaning a file nobody can find again. Payment fields carry the owner's names
(Payment method, Payment confirmation filed, Payment comments), the filing choices read
Physical / Digital / Physical/Digital, and the vendor page sections follow his order: Vendor,
Purchase orders, Invoices, Statement, Payments, Credits. Migration: filing_locations.sql.

That round also exposed a hole in the automation: the sweep asked Jira only for tickets that
were not Done, so five follow-up comments on a closed story sat unseen through thirty-one
green runs. A closed ticket somebody is still talking on is open work, and it is picked up
now, with the rule tested against the board's real timestamps in CI.

Loop round (2026-07-28): the automation became a closed loop rather than a one-way pipe.
A request on the Jira board is built, checked, and shipped, and a bug we introduce is caught
by the machine and put back on the board as work. Four parts: a mechanical tier classifier
that decides how far a change may travel (words merge themselves, app changes wait for a
person, money and access and the automation's own files never merge); /api/health, answered
by the app, which proves the deployed app and the deployed database still agree on what an
invoice owes and that no invoice shows a status its payments do not support; a post-deploy
watchdog that reads it and raises a bug when it fails; and two read-only reviewer subagents
(money-reviewer, invariant-auditor) plus a Stop hook that refuses to end a session with the
TypeScript broken. The reasoning for every limit is in docs/LOOP_ENGINEERING.md. The rule
that matters most: the automation cannot edit the automation.

Jira round (2026-07-28, the owner's four SCRUM-9 comments of 2026-07-27 evening): the
Vendors screen now opens on the department list and drills into one department at a time
(counts on each card, search scoped to the department, All vendors, and Add vendor filing
the new vendor under the department it was opened from). One department sequence
(src/lib/departments.ts) now drives every department list and dropdown in the app. The
add-vendor form lost its Department field and gained the owner's labels. Purchase orders
and invoices were rebuilt to his field lists and order, which brought two new ideas into
the model: an invoice can now say its tax is already inside the amount (recorded for the
HST report, never added to what is owed, enforced identically in the app and in the
database engine), and a delivery can be partially delivered with an arrival date and a
comment for what was short or damaged. Reports gained "Arriving in the next 7 days", which
closes the last open acceptance criterion on SCRUM-6. Migration for the round:
order_invoice_fields.sql. Board state: SCRUM-5, 7, 8, 10, 11 moved to Done (their work had
shipped earlier and was waiting on the Atlassian connector coming back).

Domain and email round (2026-07-27, docs only): the owner's control-panel screenshots put
the store's own domain on record: robinsonsgeneralstore.ca (registered 2006) with email
plan HST-EMAIL-1 (10 mailboxes, about $10 per month), five boxes configured by the
previous owners. Three of them (drygoods@, hardware@, info@) are FULL and bouncing mail,
and the stories@ alias forwards store mail to the previous owners' personal hotmail; both
flagged to the owner as urgent. The inventory, the mailbox plan (invoices@ as the future
intake feed), the app on app.robinsonsgeneralstore.ca via a Vercel custom domain, and
Resend SPF/DKIM so the daily alert sends as the store are all in docs/DOMAIN_EMAIL.md.
This also closes the 12:27 voice note from round 3 (it was the domain email cost).

Jira backlog round (2026-07-27, same day): the connected board (robinsonsgenerastore.atlassian.net, SCRUM project) was read ticket by ticket and its remaining gaps built: Property Maintenance service categories (SCRUM-9 AC 6) with Others free text, Hardware invoice PO numbers (AC 2), the tax modes exact / no-tax vendor / see-the-invoice (AC 5), credit type bank refund vs vendor account credit (AC 7), and the department drill-down report (SCRUM-8). Migration: payout_fields.sql. An hourly Routine now sweeps the board for new tickets and comments and works them.

Owner decisions (2026-06-12, revised 2026-07-07):
- 2026-06-12: finalize and ship what exists; build no new features for now.
- 2026-07-07: the owner asked for a full production-readiness pass, superseding the ship-as-is call. Both previously deferred code-gates (signed document URLs, the hard low-confidence gate) are now built, and the whole app was audited against its invariants (see docs/VERIFICATION.md).
- Confirmed the store runs a POS and QuickBooks. This makes two roadmap items feasible and moves them to the top of the expansion list: a one-click QuickBooks export of invoices and payments, and a sales import from the POS that unlocks real margin, shrinkage, and demand-based reorder.

Product review against industry standards (2026-06-12): the app is strong on the buy side (vendors, orders, invoices, payments, counts) and absent on the sell side. Gaps found, in priority order: (1) sales/POS data and a QuickBooks export, now confirmed feasible; (2) three-way match (purchase order, receiving, invoice) before paying, an accounts-payable fraud and overpay control that uses data already in the app; (3) a food-safety compliance module (fridge and freezer temperature logs, sanitation logs, food-handler certifications with expiry, pest-control records) required under Ontario HPPA and O. Reg. 493/17, a natural fit for the existing Compliance screen and capture model; (4) perpetual inventory and CRM, lower priority. None are built; all are recorded here so the review is not repeated.

## Current state
Deployed to Vercel from main, backed by Supabase Postgres in ca-central (Toronto). Store-aware with two seeded stores and the real 2026 bookings data (125 vendors, validated against the sheet's printed totals). Locked stack unchanged: Next.js App Router on Vercel, Supabase, Claude Sonnet vision via the Anthropic API.

PR #8 carries the full redesign and the editing layer. It is build-, lint-, and typecheck-green and waiting on two owner actions: run `supabase/edit_delete.sql` in the Supabase SQL editor, then merge.

## Built

App experience (PR #8)
- One app, two faces. Managers and owners get a grouped sidebar (Today, Money, Store, People, Property, Admin), a slim topbar with View as, the notification bell, and Capture, and a Today home with the KPI row and what needs attention. Staff and leads get a four-item experience whose home is Today: greeting, big action tiles, then the live feed. On phones the sidebar becomes a bottom tab bar with Capture in thumb reach and a More sheet. The shell lives in src/components/AppShell.tsx; the navigation model in src/lib/nav.ts.
- One design system in globals.css: standard page headers, shared tables, focus rings, press states, action tiles, safe-area handling, print rules. Capture is phone-first: one large photo card, stacking actions, sideways-scrolling line items.

Store Operations
- Capture: drop an invoice image or PDF, Claude vision extracts vendor, date, line items, unit cost, and the retail note; the confirm screen shows subtotal, HST, and total, flags low-confidence fields, and shows an order-vs-invoiced warning a person acknowledges. An Enter manually path handles phone orders. Posts to the feed with author and time.
- Department feed, Today dashboard (KPI row, departments, most overdue), charts page.
- Vendor directory and vendor detail with add, edit, and delete for vendors, purchase orders, invoices, and payments.
- Outstanding and overdue view, inventory counts, knowledge base, ask-your-store with citations, price-sign generator.
- Payments (payments v2): a global Payments page records any vendor payment without entering a department. Vendor search with department filter chips, tick one or several open invoices (one cheque can settle invoices across departments; each allocation keeps its department), deposits/prepayments with no invoice, the owner's method list (Cash, Cheque, CC_Visa, CC_Mastercard, CC_AMEX, CC_Debit, E-Transfer, EFT, Other with a required note), a reference field per method (cheque number, e-transfer ref), partial payments (invoice shows partially paid with the remainder), and post-dated cheques (future paid date; flips to paid on its own when the date arrives; a Scheduled list shows what is about to leave the account). All recording goes through the record_payment RPC (payment + allocations + statuses + audit, one transaction); deleting a payment goes through void_payment, which puts the invoices back to owing. Vendor detail and Due-and-overdue use the same path, and Add invoice can record "arrived already paid" with its payment in one step. Requires `supabase/payments_v2.sql` on existing databases.
- Payouts round 2 (owner's Departments & WorkFlow sheet): the page is named Vendor payouts and states that customer till sales are out of scope. Department-level categories are the owner's list (DryGoods & Lakeside, Hardware, Grocery, Produce, Bakery, Meat, Chip Stand, Checkouts, Property Maintenance, Others); Clothing, Gifts, and Garden Center are sections that roll up into their category, and the category chips filter vendors accordingly. A vendor can be added right inside the payout flow (name + category, one screen). Invoices carry invoice date, freight (total owed = amount + freight + HST), and delivery status (Delivered / Not delivered); Property Maintenance invoices instead carry estimate #, type of work (Repair / Upgrade), and a short description. Payments carry confirmation filing (Digital / Physical). Reports gained HST by department for a financial year, with sections rolled up and a year picker. Rerun `supabase/payments_v2.sql` to get the categories and new fields.

Editing layer (PR #8)
- Edit and delete on every data-entry screen, owners and managers only, via src/lib/edit.ts. Deletes are soft (voided_at, audit-logged) for ledger and master data, hard for shifts. Every list and total filters voided rows. Requires `supabase/edit_delete.sql` before deploy.

Property and Maintenance, HR, Compliance
- Assets and recurring tasks with assign and complete; insurance policies with renewal flags; the Ontario pesticide licence with expiry status. Employees, effective-dated pay rates, weekly schedule with hours-and-pay summary, treated as PIPEDA personal data.

Reports and reorder
- Spend by department, ordered vs invoiced, outstanding aging, payment-status mix, vendor scorecard. Reorder gives formula-based suggestions plus an optional AI summary.

Admin (owners and managers)
- Import data: upload either the 2026 bookings .xlsx or the weekly schedule .xlsx; the API detects which and loads it idempotently (vendors by name; employees by name and shifts deduped by employee, date, start, end). Team: create and remove staff logins in-app (needs `SUPABASE_SERVICE_ROLE_KEY`).
- Notification bell: due and overdue invoices, expiring licence and insurance, overdue maintenance.

Cross-cutting
- Reads scoped and writes stamped by the active store. Every write records who and when in activity_log. CAD throughout, Ontario 13 percent HST from a tax table. Daily Resend email of due invoices (off until the key is set). Auth ships behind `NEXT_PUBLIC_REQUIRE_AUTH` with per-store per-role policies in auth_setup.sql; demo mode stays open with the Acting-as picker. Money fields hidden from staff in both modes.

## Gates before the product is real (in order)
1. DONE, read from the live database 2026-10-18: `edit_delete.sql` is applied (`voided_at`
   on 15 tables) and PR #8 merged long ago.
2. DONE on the database side, read 2026-10-18: `auth_setup.sql` is applied (21 locked
   per-store policies, no open demo policies, private `documents` bucket). One login account
   exists, so staff logins are still to be made, from the Team page once
   `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel.
3. Owner: set the Resend key and alert addresses so due-date emails send. Do it under the
   store's own Resend account (docs/HANDOVER.md, Resend row).
4. Owner: delete or redact the Lawson "PO Details.docx" in Drive; it holds a full credit card number in plain text. Never import it.

Both build gates shipped 2026-07-07 on the owner's make-it-production-ready instruction:
- Signed document URLs: thumbnails resolve through src/lib/docs.ts (signed, expiring URLs with a
  public fallback for the open demo bucket); auth_setup.sql makes the bucket private at cutover.
- Hard low-confidence gate: capture blocks the save until every amber line is fixed (editing
  clears the flag) or explicitly confirmed; the acknowledgement is stored on receiving_event
  (low_confidence_ack) and a database trigger refuses a low-confidence dollar line without it.

## Expansion plan (agreed 2026-06-11, extended 2026-07-07 from the owner's notes)
The owner's raw notes, their refined readings, and the coverage check live in docs/OWNER_NOTES.md.
- Wave 1, kill the Gmail archaeology: email intake agent (forward invoices to a store address; extraction drafts the records for human confirm; owner-editable sender allowlist per the 2026-07-07 note), payment-matching agent, and a daily morning brief for the owner.
- Wave 2, inventory intelligence: the category inventory spreadsheet importer SHIPPED 2026-07-08 (the Import screen auto-detects SKU/description/stock workbooks, upserts items by SKU, posts a dated count, and keeps FAST/SLOW/DEAD flags and overstock locations as line notes; verified against the real shapes of all the Drive sheets, including the paint matrix and the cross-retailer sheet). Still queued: per-SKU dual-season reorder points, monthly statement reconciliation, seed the price-sign library from the real sign docs.
- Full data export SHIPPED 2026-07-08: one Excel workbook from the Import screen with a tab per table, every id intact so relationships hold, a README tab mapping the links, voided rows included as the archival record. Owner and manager only under enforced auth.
- Value round SHIPPED 2026-07-08 (owner asked for one last round of what makes sense):
  1. Daily task check-offs: recurring tasks tick "Done today" and roll their due date one cadence forward (src/lib/tasks.ts); the staff Today home shows a Today's tasks checklist with big Done buttons; the owner dashboard gains a "Tasks today" done-vs-remaining KPI. Covers the owner's price-check and restocking notes and two blueprint items. No new tables; completions are attributed in activity_log.
  2. Margin calculator on Price signs (money roles only): cost in, department margin rule applied, suggested .99 retail out; each department's target margin saves to department.target_margin (edit_delete.sql section 6).
  3. Low-stock alert in the bell: items at or below 3 on their latest count, linking to Reorder. Not money, all roles.
  4. Record payment on the Outstanding screen (owner and manager): one tap marks an invoice paid with date and method, writes the payment row, and logs who did it.
- Wave 3, people and property: timesheets plus a payroll-ready export (not in-app payroll; CPP, EI, and T4 remittance stay with the bookkeeper or a payroll service), maintenance recurrence autopilot with photo-confirmed completion, schedule drafting.
- From the owner's 2026-07-07 notes and blueprint (order proposed in docs/OWNER_NOTES.md): department task checklist with per-day completion and a done-vs-remaining widget on the owner dashboard; smart margin calculator with per-department margin rules; tenant tracker (rent, payments, paid-this-month); multi-department vendors (the DT case).
- Also queued: the Excel-style editable grid for the ledger; QuickBooks export and POS sales import (confirmed feasible 2026-06-12, the store runs both).

## Payments v2 review, 2026-07-20 (see docs/VERIFICATION.md)
A payments system (vendor payouts with allocations, partial and post-dated payments, credit notes, workflow fields, payout categories) landed from a parallel workstream. A four-angle adversarial review plus seam cross-checks ran over all of it; thirteen confirmed defects were fixed the same day:
- Status engine: invoice total now includes freight (a partial payment of goods+HST could flip an invoice to paid with the freight written off); settled-vs-scheduled uses the store's local date (post-dated cheques were clearing an evening early on UTC).
- Ledger safety: hard delete removed from the payments screen (Void is the path and it restores invoice statuses); allocations are capped against fresh settlement data at save time (no over-allocation, no double payment on retry or from two people); after any error both payment screens refresh so a committed-but-lost payment is never blindly retried.
- Fresh installs and cutover: credit_note added to schema.sql and to the auth_setup store-scoped policies; auth_setup now skips missing tables instead of aborting mid-run (which could have left the database deny-all); the export includes credit_note.
- Post-dated invoices from the ledger import now carry the future-dated cheque payment that the engine derives their status from (importer emits it; payments_v2.sql section 7b backfills existing rows). Without it, the first reconcile flipped every imported PDC invoice back to unpaid.
- The new partially_paid status now counts everywhere money is summarized: the bell, both dashboards, and the aging report (which also subtracts settled amounts and includes freight).
- Role and audit seams: the payments screen fails closed for an unknown role (it showed full dollar figures while the role was still resolving); reconcile runs only on an editor's page load (a staff view was writing status changes); every money write on the payout screens requires a known actor; voidRow/deleteRow no longer write null-actor audit rows.

## Open items (polish, tractable)
- AI call hardening, 2026-10-24 (branch ai-call-hardening, see VERIFICATION.md): all four AI
  routes go through src/lib/anthropic.ts (25s timeout, 45s on extract, two retries on
  429, 529 and 500, 502, 503, 504, refusal and cut-off read from stop_reason, maxDuration 60). Screens show plain
  messages only; provider detail goes to the function log as metadata, never content. Reorder
  failures are now 502, not 200. Extract output is value-checked and anything coerced drops to
  confidence 0. Store data, questions and notes are fenced as data in every prompt.
  Left for later: an offline golden-case eval
  set for extract and ask, a grounding check on vendor names in Ask answers, and prompt caching
  for the Ask system prompt.
- Ask grounding and caching, 2026-10-24 (#59, see VERIFICATION.md): two of the left-for-later
  items above are done. Ask checks vendor names mentioned in answers against the store data
  and app guide, withholding an unsupported answer with "Not confirmed" and a plain message
  (src/lib/askGrounding.ts, scripts/askgrounding-check, in CI). The question excuses unsupported
  names only if all occur in the question and the answer has no figures (no digits, as in "Costco is not on file"). The
  model wraps vendor names in [[ ]] for the check; the brackets never reach the screen.
  Unwrapped names are caught only with a legal suffix or after "vendor", "supplier", or
  "order from", so an unwrapped made-up vendor with neither still gets through. Ask now
  caches its prompt: the rules and app guide (roughly 1,600 to 2,000 tokens, over the 1,024
  minimum for claude-sonnet-5) and the store data, which repeats for the same store and role
  until a record changes. The function log carries cache_creation_input_tokens and
  cache_read_input_tokens. Left: confirm reads are non-zero on a preview with two questions a
  minute apart.
- One of the left-for-later items above is built, not yet run: the golden-case evals,
  2026-10-24 (branch ai-golden-evals, see VERIFICATION.md). 24 made-up cases in
  scripts/aievals-check, 11 invoices for extract and 13 questions for ask, scored by fixed
  rules (field match with a one-cent tolerance; facts that must and must not appear; for the
  money and store cases, the prompt itself). The scorer tests are a step in ci.yml and use no
  model. `npm run eval:ai` sends the cases through the real routes and src/lib/anthropic.ts
  and prints a pass rate per case. It spends the API key (72 calls by default, 24 with
  `-- --runs 1`), so it never runs in CI and has not been run yet: the first run is the
  owner's call. One case is marked as a known gap and is expected to fail until it is fixed:
  Ask lists a partly paid invoice at its full total as what is owed
  (ask-owed-partial-payment).
- Capture amber rule, 2026-10-24 (branch capture-staff-cost, see VERIFICATION.md): an amber
  (low-confidence) line now clears only when a person retypes its unit cost; fixing the
  description or qty leaves it amber, and the box covers the rest. Staff never see the cost, so
  their amber lines are saved with no unit cost and the confidence as read, for the owner to
  enter. Rules in src/lib/captureLines.ts, checked by scripts/extractvalidate-check in CI. No
  schema or trigger change. The owner enters that cost from the feed (next item).
- Cost entry for lines saved without one, 2026-10-24 (branch receiving-cost-entry, see
  VERIFICATION.md): for roles that see money (owner, manager, lead) the feed opens with a
  "Needs a cost" list of every receiving line in the store that has no unit cost, newest
  delivery first, up to 50 deliveries. A feed row with such a line carries a "Needs a cost"
  marker and its subtotal reads "subtotal so far". Saving a typed cost sets unit_cost and
  confidence 1 (a person checked it), so enforce_line_confidence passes without the event's
  acknowledgement. The update fills a blank cost only, on a delivery that is still live and in
  the active store, goes through the existing receiving_line policy, and logs cost_entered on
  the line under the person who typed it. With no known person nothing saves; if the log row
  fails the cost is put back, and if that fails too a notice stays until dismissed. The cost
  must be above 0 and at most $100,000 a unit; 0 is refused because the invoice reader writes
  0 for a cost it could not read. A comma reads only as a thousands separator, so "12,50" and
  "0,500" are refused, not saved as 1250 or 500. Staff never load the list or see the marker.
  No schema, RLS or trigger change. Screen part in src/components/NeedsCost.tsx; the input
  rule is costEntry() in src/lib/captureLines.ts.
- AI call log and daily cap, 2026-10-24 (branch ai-usage-cap, see VERIFICATION.md): every AI
  call reserves an ai_call row before the model is asked and fills it in after (store, route,
  model, token counts, outcome, duration; never content). Once the store has made
  AI_DAILY_CAP_PER_STORE calls today (Ontario day, default 100) the call is refused without
  reaching the model: 429 and a plain message. The reservation counts under a per-store lock,
  so parallel requests cannot overshoot the cap. Fails open: no table, a slow database or an
  error logs a warning and the call goes ahead. Owner action: supabase/ai_call.sql applies
  itself on merge and the cap works from then; rerun auth_setup.sql after it so the owner can
  read the rows. Not built: a screen for the owner to read the log (Supabase for now).
- Import and export integrity, 2026-10-24 (branch import-export-integrity, see VERIFICATION.md):
  the schedule import no longer guesses who a name is. A name two employees share, or a name
  that may be a Staff full name ("Amy" beside "Amy Robinson"), is named in the import result
  and its shifts are not loaded until someone renames one in Staff or writes the full name in
  the schedule; nobody new is created for it. Exact matches and new names load as before, and
  an employee read error now stops the import instead of re-creating everyone. The duplicate
  shift check reads past 1000 shifts. The full export reads every table in pages keyed on id,
  so a shift deleted or a row added while it runs cannot make the archive drop or repeat
  another row; the README tab names the start time. The export also stopped ordering
  tax_rules by province, a column that table does not have in schema.sql (not checked against
  the live database). Left for later: a schedule full name beside a shorter Staff name
  ("Amy Robinson" in the schedule, only "Amy" in Staff) still creates a new employee, and so
  do two new names in one file that may be one person.
1. Compliance: insurance policies could use the same add-and-edit form as the licence.
2. Alerts email: label each invoice with its store, or send per store.
3. HR schedule: reload employees when the active store switches; week navigation during a slow load can leave the header and list on different weeks.
4. Seed: set store_id inline on the original inserts, not only the backfill, so a partial re-run still scopes store one.
5. Second store: seed a few maintenance, HR, and compliance rows so its screens are not empty.
6. ~~Reorder and extract API routes: return 200 with a clear message on a model error instead of 502.~~ Reversed 2026-10-24 by PR #58: every AI route returns a non-2xx status on a model failure (502, or 422 for a refusal on Ask) with the plain sentence from `failureMessage()` in `src/lib/anthropic.ts`.
7. Decide whether the Acting-as user list stays store-wide or scopes per store.
8. Stored files are scoped by store and role (ADR-004, merged 2026-10-30).
9. View as previews navigation and home, not money hiding; verifying what staff see still needs signing in as (or acting as) a staff member.
10. Import: if a bookings import fails partway, the vendors already inserted are skipped on re-run and their missing children are not backfilled. Re-import after deleting the partial vendors, or add child-level idempotency.
11. Vendor detail loads by id without checking the vendor belongs to the active store (harmless single-store; the DB policies enforce it once auth is on).

## Production audit, 2026-07-07 (see docs/VERIFICATION.md)
A seven-dimension audit (store scoping, money gating, actor and audit integrity, edit and delete, RLS coverage, API hardening, build safety) with adversarial verification ran before the merge. Every confirmed defect was fixed the same day:
- Money leaks closed: the notification bell, /api/ask, and the reorder AI summary no longer expose dollar amounts to the staff role.
- Voided (deleted) rows no longer count anywhere: charts dashboard KPIs, the daily alert email, weekly estimated pay, reorder inputs, and capture's vendor and order matching all filter voided_at now.
- API routes hardened for the auth cutover: /api/ask, /api/reorder, /api/extract, and /api/import require a signed-in member once login is on (imports require owner or manager, reorder summaries a money role); queries run as the caller so the per-store RLS applies; /api/alerts uses the service role (the cron has no session), requires CRON_SECRET once auth is on, and excludes voided invoices.
- Privilege escalation closed: a manager can no longer create or remove an owner from the Team page.
- Capture now saves the Notes field (new receiving_event.notes column, in schema.sql and edit_delete.sql).
- Feed deletes are attributed to the signed-in member (or the Acting-as pick), not null.
- The bookings import no longer aborts when a vendor appears on two rows of one sheet.
- auth_setup.sql is now actually idempotent: every policy is dropped before it is recreated, so re-running it for new accounts works as documented.
- The owner command dashboard cancels stale queries on store switch and surfaces query errors instead of rendering zeros.

## Deferred (by design)
- ML reorder forecasting until a clean season of sales data exists; pgvector for ask-your-store at scale; SMS alerts; the enterprise stack (see build spec section 8).

## Run and deploy
See RUNBOOK.md. Pushing to main auto-deploys to Vercel; each pull request gets a preview. The verification record and re-verification rules are in docs/VERIFICATION.md.

**Basis (Miro update, 2026-10-30): 3 claims checked, 3 confirmed, 0 killed, 1 source.**
The current board, archive and redraw rule match ARCH-12 in
`git show pr/81:docs/ARCHITECTURE.md` (line 695). This is a document comparison, not a new
live board check.
