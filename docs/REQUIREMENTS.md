# Requirements ledger

The living requirements record for the Robinson's General Store platform. Every ask from the
owner and the developer lands
here with its source, its state, and where it lives in the code, so context survives any
chat, machine, or person. Update this file in
the same pull request as the work; if it is not recorded here, it is not agreed.

Companion files: docs/STATUS.md (build state), docs/VERIFICATION.md (sign-off record),
docs/OWNER_NOTES.md (raw owner feedback, verbatim plus translation), docs/SUPABASE_SETUP.md
(every SQL script and the run order), docs/ARCHITECTURE.md (stack and data model),
docs/DOMAIN_EMAIL.md (the store's domain and mailboxes: inventory and integration runbook).

## The store and the people

Robinson's General Store, Dorset, Ontario (lakeside; hardware, grocery, dry goods, gifts,
clothing, bakery, meat, produce, chip stand, garden centre). The owner is non-technical and
phone-first; feedback historically arrived as WhatsApp texts in Telugu-English, screenshots,
voice notes, and annotated Excel workbooks. Roles: owner, manager, lead, staff. Staff and
leads never see dollar figures (leads do: see canSeeMoney; staff never). One store today.

## Product direction

Direction, recorded 2026-10-30: Robinsons is the first store of a product intended for other
independent stores. This section is the canonical home for that direction and its delivery state.

- Every change must work for another store. Store-specific facts (name, address, branding,
  departments and their order, vendor and invoice questions, tax region, licences) belong
  in per-store data or settings. Do not add another fixed store fact in code.
- A request from one store becomes a setting all stores can use, or waits. No per-store
  forks or branches. Move the configuration gaps below into store data when touched.
- The intended product uses one shared deployment and database. Larger infrastructure is
  earned by actual store count, as described in the skill's locked architecture.

**PARTIAL: current multi-store support.** Data and member access are scoped per store
[R src/lib/store.ts:28] [R src/lib/auth.ts:158] [R supabase/auth_setup.sql:125]; the configuration gaps below remain.
Other readiness items are tracked privately.

**TARGET: onboard a second store without a code change.** Onboarding should need only a
store row, its settings and its members. Record any required code change here as a gap.

Configuration gaps to address when touched:

- Store identity in the Ask prompt [R src/app/api/ask/route.ts:62,145], app guide
  [R src/lib/appGuide.ts:6], page title [R src/app/layout.tsx:11], login plaque
  [R src/app/login/page.tsx:43] and AppShell branding and fallback
  [R src/components/AppShell.tsx:113,118].
- Store identity in the reorder prompt [R src/app/api/reorder/route.ts:54,84].
- Alert email branding in the message and subject [R src/app/api/alerts/route.ts:115,120].
- Capture's tax lookup fixed to region "Ontario" [R src/app/capture/page.tsx:68], with
  HST_RATE as fallback [R src/lib/format.ts:16]; the store needs a tax region setting.
- Department sequence fixed in code [R src/lib/departments.ts:11].

## Store background

What the world knows about the store (researched 2026-07-27; sources: Discover Muskoka,
1000 Towns of Canada, Tripadvisor, Yelp, BayToday, dorsetcanada.com):
- A century-old landmark: family-run from 1921 until the recent sale to the current owner;
  about 14,000 square feet by the bridge on Main Street; voted "Canada's Best Country
  Store"; a must-see stop for Muskoka and Haliburton visitors.
- Known for: one-of-everything (gifts, souvenirs, housewares, clothing), moccasins as the
  signature item, the Food Town grocery side, the hardware side, and The Red Onion ladies'
  boutique upstairs.
- What recent reviews criticize under the ownership transition: thinning stock, slow
  replenishment, rising prices. PRODUCT IMPLICATION: the reorder engine, inventory counts,
  late-delivery tracking, and vendor ledger are not conveniences; they attack the exact
  thing the public is currently judging the store on. The Suggestions space and knowledge
  base preserve what a century of family operation used to hold in memory.
- Identity used in the app: the storefront sign (dark boards, gold western lettering)
  drives the login plaque and sidebar mark; "Serving Dorset, Ontario since 1921" is the
  verified tagline. The winter dusk photo of the building becomes the login backdrop when
  public/storefront.jpg is added to the repo (the code already supports it).

## Standing invariants (never regress these)

1. Every read and write is store-scoped; new tables get store_id, RLS, and a line in
   auth_setup.sql section 3a (section 3e and supabase/money_by_role.sql if the table holds a
   dollar figure).
2. Money visibility fails closed: null/unknown role sees no dollars (canSeeMoney).
3. Editing is role-gated (canEdit); destructive actions are soft voids (voidRow /
   void_payment) filtered with .is("voided_at", null); user-facing label is Void.
4. Payments flow ONLY through the engine RPCs: record_payment, void_payment, edit_payment,
   reconcile_postdated. Post-dated = cheque with a future paid date, never a method.
5. activity_log rows only with a known actor (currentActorId); guarded inserts.
6. A human confirms anything that moves dollars (discrepancy and low-confidence gates).
7. The app builds with blank env (no crash, clear connection cards).
8. Calm neutral canvas; color carries status meaning only. AI answers are plain text.

## Functional areas and their state

SHIPPED (see VERIFICATION.md for sign-off):
- Capture: photo/PDF invoice extraction (Claude vision), discrepancy + low-confidence
  acknowledgements, manual entry path, feed posting.
- Vendors: department-first directory (pick a department, then its vendors; counts,
  department-scoped search, All vendors, add-vendor inherits the department) + detail;
  orders, invoices (property-work and finance variants), credits; per-row edit and void.
- One department sequence everywhere (src/lib/departments.ts): DryGoods & Lakeside,
  Hardware, Grocery, Property Maintenance, Bakery, Meat, Produce, Payrolls & Taxes, Others.
  Departments outside the list still appear, sorted after it.
- Invoice tax modes: entered separately, included in the invoice amount (recorded for the
  HST report, never added to what is owed), no tax, or refer to the actual invoice. The
  mode is stored, and the app and the database engine share one definition of the total.
- Delivery detail on invoices: delivered / partially delivered / not delivered, the day it
  arrived, and delivery comments for short shipments and damage.
- Purchase orders in the owner's field order: order status (in progress, approved), amount,
  where the confirmation is filed, ship date, comments. The season year follows the ship
  date rather than being typed.
- Payments v2 engine: allocations across invoices, partial payments, deposits, post-dated
  cheques with auto-reconcile, derived invoice statuses, one atomic RPC per action,
  payment EDIT (date/method/reference/notes/filing) with status re-derive.
- Payout categories incl. Property Maintenance and Payrolls & Taxes (payroll remittances,
  incorporation taxes) as departments.
- Due and overdue with quick pay; Reports (aging incl. partial/freight/settlements, HST by
  department, deliveries arriving in the next 7 days, late deliveries); Today KPIs; Charts;
  Feed.
- Inventory counts + importer; Price signs; Knowledge; Ask-the-store (grounded, role-aware);
  Reorder screen with grounded AI summary.
- Imports: bookings ledger v1 (fixed layout) and v2 (header-driven, payments, credits,
  AskingInventory), weekly schedule, category inventory sheets; idempotent.
- Export: one workbook, one tab per table, README of relationships.
- Suggestions: in-app owner feedback space (note + screenshot + voice recording), screenshot
  auto-read into text by the store's AI, status flow, developer digest copy.
- Auth: demo mode (open) and enforced mode (Supabase Auth + per-store per-role RLS);
  server routes resolve the caller (serverMember).
- Tasks/daily checklist; Maintenance; Compliance; HR + schedule; notification bell (live
  count: refreshes on navigation/focus/open/timer).
- Brand: storefront-sign plaque (CSS only) on login and sidebar; evergreen canvas motif;
  print stays clean.
- Vendor ordering profile (SCRUM-9, 2026-07-31 and 2026-08-05): minimum order amount or a
  "No minimum order" tick, mutually exclusive and enforced in the database as well as the
  form, shown on the vendor page, the Add order form and the Reorder list; summer order
  timeline in free text; location of the order as a multi-select with a free-text Other;
  reorder status with comments that are mandatory when Reordered and are never deleted by a
  status change alone. Migration: supabase/vendor_ordering_fields.sql.
- Field-level validation: every required field reports its own problem underneath itself,
  not in a card at the top of the page (SCRUM-9, 2026-07-31).
- The health check names its own fix (SCRUM-12, 2026-08-07): when /api/health finds a column
  the release needs and the live database does not have, it names the missing columns, the one
  script in supabase/ that adds them, and that the script is safe to run again. The script is
  recorded per column, so a table waiting on two scripts names the one it is actually waiting
  on. A database that does not answer at all gets no such sentence, because that is not a
  migration anybody forgot. The watchdog puts the sentence in the ticket it raises, so a
  missing migration becomes a job somebody can finish instead of a check name they cannot act
  on. The code was never wrong in that failure; the ticket just never said what to do.
- Vendor field registry (src/lib/vendorFields.ts, 2026-08-12): what a vendor IS, defined once
  per department, and now driving the display, the AI routes and the entry form. Twelve
  fields carrying label, group, money flag, source columns, department scope and a value()
  that returns null when nothing is on file; a derived vendorSelect() replaced the eight
  hand-written selects that had drifted. Three safety rules hold whatever the department map
  says: hiding a question never hides an answer (a bakery vendor with a saved summer timeline
  still shows it), an unrecognised department is asked everything (Chip Stand and Checkouts
  are real and are on no list), and the money gate fails closed on both the form and the
  display. One predicate, asksFor(), is used by both the rendering and the save path, so a
  department cannot be left with a mandatory field it is never shown. Both vendor forms carry
  one "Add the other questions" button that puts every question back, because the map is a
  best guess and a guess must never be why somebody cannot record something true; pressing it
  reveals a question without making it mandatory. No schema change, no migration, no backfill.
  Checks: scripts/vendorfields-check (30 assertions).

- Invoice fields per department, one registry (Ravi Maddipati, 2026-08-13, WhatsApp: fields
  "selected by department and subdivision ... would eliminate the need to develop each
  department's payment screen individually"). BUILT 2026-08-17 as src/lib/invoiceFields.ts,
  replacing the three hand-coded booleans whose call sites had drifted into nulling saved
  answers on edit. One correction to the framing, recorded in the file: the payment recording
  screens are the engine's shape and identical everywhere by design; the registry covers
  invoice fields and must never grow into the payment forms. PO fields are uniform today, so
  the registry is the waiting pattern for the first per-department PO ask. His second point,
  that future field assignments become one-line data edits, is exactly right and is the
  point.

- Select fields per department in the vendor, payment and invoice profiles (relayed
  2026-10-25: "We need ability to select fields in vendor profile, payment profile and invoice
  profile on department level", reported as not done). PARTIAL 2026-10-25: the Department
  fields screen (Admin) lets the owner tick, per department, which vendor and
  invoice questions the forms ask, stored in the department_field table; no rows means the
  code lists above apply. Managers can read the choices [R supabase/auth_setup.sql:170-199].
  Sections follow the department they sit under on every form. Locked
  whatever the screen says: vendor name and status; invoice number, date, amount, tax,
  freight, filing, due date and status. OPEN: which payment questions should vary by
  department [Q: the requester]; the payment forms are unchanged until that is answered.

QUEUED (agreed, not built):
- Department photo tiles and knowledge-note photo attachments, sourced from the owner's
  walkthrough (one photo per department from his phone; website photos ruled out).
- From the 2026_Payments workbook (2026-07-27): recurring obligations (loans and utilities
  with payment frequency and autopay method, the Loans&Payments and Utility tabs);
  estimate AMOUNT on property invoices (Estimated$ next to the existing estimate number);
  renewals/training expiries (JHSC certification) into Compliance; an importer for the
  2026_Payments workbook itself once its layout settles (the owner calls it work in
  progress).
- Sheets sync phase 2 (service-account pull from the live sheets) and phase 3 (FromApp
  push tabs): docs/SYNC_PLAN.md. Blocked on sharing the live sheets with
  the developer's Google account.
- QuickBooks export of invoices/payments; POS sales import (margin, shrinkage, demand-based
  reorder). Owner confirmed the store runs a POS and QuickBooks.
- Three-way match (PO vs receiving vs invoice) before payment.
- Food-safety compliance module (temp logs, sanitation, certifications) per Ontario
  HPPA / O. Reg. 493/17.
- Email invoice intake ("get and organise the invoice from Email", configurable senders).
  Now concrete: vendors send to invoices@robinsonsgeneralstore.ca, the mailbox forwards
  into the Capture pipeline, a sender allowlist gates it; design in docs/DOMAIN_EMAIL.md
  section 4. Blocked on the owner creating the invoices@ mailbox.
- Price-check activity list and notification (grocery).

OPEN (waiting on the owner):
- DONE 2026-10-25: move every account to the store (asked 2026-10-18). Hosting is on the
  store's Vercel team and the code at robinsons-store/robinsons-store. Still open, in
  docs/HANDOVER.md: Supabase and Vercel on Pro (A-01, closes PLATFORM.md risks 1 and 2), the
  original keys reissued (A-02), and a second owner on GitHub (A-05).
- Dev environment (asked 2026-07-31). PARTIAL 2026-10-30: the dev database
  robinsons-store-dev is loaded with the repository seed data, every preview reads it, and develop
  deploys to its own address. Open, needs admin@: the SUPABASE_DB_URL_DEV secret and the
  DEV_URL variable (docs/ENVIRONMENTS.md steps 2 and 5), and a way for Ravi to open the dev
  site (step 6).
- Confirm the domain renewed. robinsonsgeneralstore.ca was due on 2026-10-16 with auto-renew
  confirmed on, but the renewal itself has not been seen. Check the Vianet panel and record
  the new expiry in docs/DOMAIN_EMAIL.md. The watchdog checks the custom domain since
  2026-10-25, so a lapse now fails a check.
- DONE, verified 2026-08-11: run supabase/vendor_ordering_fields.sql. This was recorded as
  failing since 2026-08-06, with the vendor ordering fields unable to save. The live health
  check now answers ok:true with "vendor columns present" passing, so the script has been
  run and the columns are there. Left in place rather than deleted because it is the second
  stale OPEN item found this way (the first was the custom domain in docs/DOMAIN_EMAIL.md):
  this file records what somebody believed on the day they wrote it, and a line that says
  "still broken" outlives the fix unless something checks. /api/health is the check for this
  one, so read it before repeating anything in this section.
- DONE, verified 2026-08-13: SUPABASE_DB_URL exists as a repository secret, added around
  2026-08-09. This line said for days that it was missing and that "the workflow has never
  applied anything", so a merged migration was still being described as a manual job in the
  Supabase editor. It is not. A push to main that touches supabase/** applies the ordered
  list in supabase/run-order.txt on its own. FOURTH stale record found by checking rather
  than reading, after the custom domain, the vendor columns and the mailbox quota. The
  pattern is always the same: this file records what somebody believed on the day they wrote
  it, and a line that says "still waiting on you" outlives the fix unless something checks.
  For this one the check is the Actions tab: look at whether "Apply database scripts" ran.

- DONE 2026-08-12: Jira is switched off, at the developer's instruction ("we dont use jira
  anymore", "remove if we are wasting credits in jira"), and the autopilot is PARKED rather
  than deleted at his follow-up ("we mighgt use new acount in future and we still would like
  to have that setuyp inplace as placehoilder.. just not cativated now"). The autopilot swept a board the owner
  has never written to, 96 times a day, while his actual requests arrive by phone and
  WhatsApp. (Corrected 2026-08-13: this was first recorded as the autopilot "spending model
  credits". It was not. Its model step was gated behind finding a ticket; the waste was 96 sweeps a day that each installed dependencies before checking, about 2,880 Actions minutes a month against a 2,000-minute allowance.) The board's two other jobs were free HTTP
  and are re-homed: the health watchdog now posts to Slack when the site's answer changes,
  and promotion to production is now a person running the promotion workflow rather than a
  ticket moving to Approved. The working channel going forward is Slack. SLACK_WEBHOOK_URL is set: on 2026-08-17 the
  merge of PR #46 applied a migration and posted its production-success message to Slack,
  which only happens through that secret. (Corrected 2026-10-18; this line said it was still
  needed.)
- Let the automation open its own pull requests (still worth doing for the promotion
  workflow, which opens the develop-to-main pull request): Settings, Actions, General, Workflow
  permissions, "Allow GitHub Actions to create and approve pull requests". Today GitHub
  refuses createPullRequest from the autopilot's token, so a finished ticket ends as a
  pushed branch that somebody has to open by hand, and SCRUM-12 sat unopened for a day
  because of it. Merging stays human either way: the tier is decided by
  .github/scripts/classify-change.mjs reading the diff, and this setting does not touch it.
- The vendor form asks every vendor for everything (owner complaint 2026-08-11, and the
  same point he made on 2026-07-27). Adding a vendor presents about 13 field groups and 20
  controls, including a seven-box location group, whatever the vendor is. His own workbook
  has never worked that way: OWNER_NOTES.md line 367 records the 2026_Payments tab census
  as "fields differ BY DEPARTMENT, the owner's core point", with Bakery, Meat and
  StoreSupplies on a five-column "light form", LocalVendors adding invoice and payment
  columns, Grocery carrying the full merchandise shape, Hardware that plus PO#, and
  MaintenancePayments a different shape again (SpecilizedOn, TechName, Estimate#,
  TypeOfWork). PROCESS FAILURE TO NOTE: that census was captured verbatim on 2026-07-27 and
  never triaged into this file, so his core point was never work. BUILT 2026-08-12 (see the
  field registry entry under SHIPPED): both vendor forms now ask what the department asks.
  A bakery is down from about 13 field groups to five (name, status, phone, email, notes)
  with the other seven behind one button, and Dry Goods still gets everything. The map was
  seeded from the workbook census rather than asking him to specify it cold, and the
  `departments` line on each field is data, so moving a question between departments is a
  one-array edit. The minimum-order rule was mandatory on every save on both paths, so a
  phone-number correction could not be saved without answering it; it is now demanded only
  where the department is asked for it, or where somebody has answered it. That narrows the
  problem without reversing his rule, which src/lib/vendorOrdering.ts line 60 records as
  deliberate and asked for. OWNER DECISION STILL NEEDED, and neither blocks anything now:
  (a) ANSWERED 2026-08-13. He marked up the table in the vendor questions document and
  confirmed every line, including the two I flagged as least certain: Bakery, Meat and
  Produce do NOT carry payment terms, and Hardware does NOT get the summer order timeline.
  The map already matched, so nothing changed there. He added one new question, "Specializes
  in" for Property Maintenance, and let stand that Chip Stand follows Grocery and Checkouts
  follows Others. Both built; his table is now asserted field by field in
  scripts/vendorfields-check so a later edit cannot quietly depart from what he said.
  (b) STILL OPEN. Does the minimum order stop being mandatory for the merchandise
  departments too, on an edit that only meant to fix a phone number. The document offered him
  Option A (keep asking every time) and Option B (only ask where the ordering questions are
  on screen) and recommended B. He answered the table and did not answer this. Worth noting
  that B is what is currently built, so nothing is broken either way, but he has not said so.
- One vendor field list, so every screen shows the same vendor the same way (proposed
  2026-08-11, owner note sent the same day). The ordering profile saves correctly, but each
  screen was told separately which vendor columns to load and they disagree: the vendor page
  loads all four, the Reorder list three, and the vendor directory, /api/ask and
  /api/reorder none. The visible symptom is that Ask-the-store answers "not on file" for a
  summer order timeline that IS on file, and the reorder summary cannot weigh the minimum
  order. Proposal: a declarative field registry (src/lib/vendorFields.ts) holding label,
  group, money flag, source columns, and a value() that returns null when there is nothing
  to show, plus a derived vendorSelect() so the eight hand-written selects cannot drift
  again. Same failure class the money-reviewer watches for on tax_mode. No migration, no
  backfill, no schema change; the existing check constraints and canSeeMoney gating stay
  exactly as they are. Rejected alternatives: a jsonb blob (loses the mutually-exclusive
  minimum-order constraint, the numeric type on money, per-field money gating, and readable
  export tabs) and probing which columns are non-null (collapses "never asked" into "does
  not apply", and cannot know that order_location + order_location_other are one fact).
  BUILT 2026-08-12; the "not on file" symptom is gone, both AI routes now select through
  vendorSelect(). OWNER DECISION STILL NEEDED: do blank answers stay hidden everywhere, or
  is a "not answered yet" view wanted so the roughly 130 vendors can be filled in a few at a
  time. Recommendation is the "not answered yet" view. The registry already carries the
  alwaysShow flag that such a view needs, so it is a screen and not a rework. If a genuinely
  open-ended per-vendor attribute is ever wanted, that is a vendor_attribute child table with
  RLS through its parent, not a blob column.
- Of the three 2026-07-10 voice notes ("most important"), the domain-email one is now
  resolved: it was about the store's own domain email plan (docs/DOMAIN_EMAIL.md). Still
  un-decoded: the 12:18 note ("deposit on the device"). Owner to type it or re-record in
  Suggestions.
- Domain panel actions (details and order in docs/DOMAIN_EMAIL.md): repoint or delete the
  stories@ alias (it forwards store mail to the previous owners' personal hotmail);
  archive then retire joanne@; create invoices@ (unblocks email intake). The CNAME for
  app.robinsonsgeneralstore.ca is no longer an action: it has been live and verified since
  2026-08-11. (An earlier version of this line said three mailboxes were full and bouncing.
  That was wrong: the quota is 1000MB, not 250MB, and the fullest box is at 26 percent.
  Nothing is bouncing and nothing needs clearing.)
- Departments&WorkFlow.xlsx (OneDrive), sheet Lakeside&DryGoodsPaymentRecordF: upload it so
  the payment-record fields can be checked column by column (everything visible so far
  already exists).
- Delete the Lawson "PO Details.docx" from the shared Drive: it holds a full credit card
  number in plain text. Standing reminder until done.
- Rotate the owner's demo password; add Resend/CRON env for the daily email if wanted.

## How owner feedback becomes work

1. It lands raw in docs/OWNER_NOTES.md (verbatim, with translation when Telugu).
2. Each ask gets a line here (SHIPPED/QUEUED/OPEN) when triaged.
3. The build round updates STATUS.md + VERIFICATION.md in the same PR.
4. The app's Suggestions page is the preferred channel now: notes, screenshots (auto-read
   into text), and voice recordings stay attached, and "Copy developer digest" produces the
   exact block to paste into a build chat.

## How this maps to the rest of the docs

CLAUDE.md and the robinsons-store skill point here for product direction. STATUS.md and
VERIFICATION.md record the change; the skill keeps the locked architecture and invariants.

**Basis (product direction): 6 claims checked this session (2026-10-30), 6 confirmed,
0 killed, 13 sources.** The PARTIAL state and five configuration bullets were checked
against the source files cited in that section. The onboarding TARGET records direction.
