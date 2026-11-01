# Architecture: what runs where, and how money and changes move through it

Status: PROPOSED, 2026-10-24, diagrams corrected against the code 2026-10-30. Owner: the developer. Approver: Ravi Kiran.

**The store's app is one Next.js site on Vercel talking to one Supabase database in Toronto,
with the Anthropic API reading invoices and GitHub Actions plus Slack building, migrating and
watching it.** The one thing to know before changing anything: an invoice's paid status is
never typed, it is derived in the database from payment allocations by the payment engine,
so every money change goes through those functions or it is wrong.

Evidence tags follow `.claude/skills/robinsons-store/references/standards.md`: `[R path:line]` read from
this repository this session, `[V-run]` checked live this session, `[J-open]` believed and
not checked (with what would prove it wrong), `[Q: owner]` an open question. States: BUILT,
PARTIAL (gaps named), SCAFFOLDED (built, switched off; the switch named), TARGET (not built).

Standards each view follows. The document as a whole is an architecture description in the
sense of ISO/IEC/IEEE 42010:2022 (one concern per view, each view answers a question), laid
out after arc42; the diagrams are Mermaid, per `.claude/skills/robinsons-store/references/standards.md`.

| Section | View | Notation or standard |
|---|---|---|
| 1. Context | Who and what the app depends on today, and the planned pieces | C4 model, level 1 (System Context), current and target |
| 2. Containers | Deployable pieces and how they talk. "Container" is the C4 term for a separately running unit, not Docker; there are no Docker containers | C4 model, level 2 (Container) |
| 3. Capture loop | One flow, step by step | UML 2.5 sequence diagram |
| 4. Money | How an invoice status moves | UML 2.5 state machine |
| 5. Data | Tables and keys | Entity relationship, crow's foot notation |
| 6. Build and release | Request to live site | Delivery pipeline (continuous delivery); measured, when it is, by the four DORA metrics |
| 7. Security and privacy | What is fenced and what leaves Canada | PIPEDA for personal data; OWASP Top 10 for the web app |
| 8. AI | How the model is called and checked, and how requests, requirements and rules reach Claude | Same C4 container notation; risks named after NIST AI RMF 1.0 and its Generative AI Profile (NIST AI 600-1), and the OWASP Top 10 for LLM Applications |
| 9 to 11 | Out of scope, open items, map | arc42 section 11 (risks and technical debt) in short form; decisions live in docs/adr (arc42 section 9) |

Colour key, the same in every diagram, and colour means state only: a plain box is BUILT; an
amber dashed box is SCAFFOLDED (built, switched off); a grey dashed box is TARGET (planned,
not built). A dotted arrow is a flow that is switched off or planned. Planned pieces stay on
the diagrams in their colour instead of being left out, and a box changes colour when its
state changes.

## 1. Context

The store is Robinson's General Store, the general store Ravi Kiran acquired, in Dorset,
Ontario. Heavy summer seasonality. Lakeside Dry Goods and L_S and Dry goods are a section
inside it, not the store name [R .claude/skills/robinsons-store/SKILL.md:12].

Who uses it: floor staff capture deliveries and count stock; leads, managers and the owner
also see money [R src/lib/auth.ts:38-40]. The four roles are `staff`, `lead`, `manager`,
`owner` [R supabase/schema.sql:29]. The owner runs the store remotely, mostly from a phone.

What it touches: the store's vendor ledger, orders, invoices, payments, receiving records,
inventory counts, maintenance, compliance and HR records, all in one Postgres database
[R supabase/schema.sql:7-678].

Question: which outside services does the store's app depend on, and for what?

```mermaid
flowchart LR
  P["Staff and owner<br/>laptop or phone"]
  APP["Robinson's store app<br/>Next.js"]
  VER["Vercel<br/>hosting, cron"]
  SB["Supabase, Toronto<br/>Postgres, Auth, Storage"]
  AN["Anthropic API, US<br/>reads invoices, answers"]
  VIA["Vianet<br/>app.robinsonsgeneralstore.ca"]
  GH["GitHub Actions<br/>CI, migrate, watchdog"]
  SL["Slack<br/>requests and alerts"]
  RS["Resend email<br/>SCAFFOLDED, off"]
  P -- "opens the domain" --> VIA
  VIA -- "CNAME to" --> VER
  VER -- "serves" --> APP
  APP -- "reads and writes, signs in" --> SB
  APP -- "invoice images, questions with store data, screenshots" --> AN
  APP -. "daily due email when keys set" .-> RS
  SL -- "build requests" --> GH
  GH -- "builds the change (Claude Code)" --> AN
  GH -- "migrations, weekly RLS audit" --> SB
  GH -- "GET /api/health" --> APP
  GH -- "status and alarms" --> SL
  classDef scaffolded fill:#fff4d6,stroke:#b7791f,stroke-dasharray:5 3
  class RS scaffolded
```

Plain flow: staff and the owner open app.robinsonsgeneralstore.ca, which Vianet's DNS points
at the app on Vercel; the app keeps all records in Supabase in Toronto and sends invoice
images, questions with the store's notes and records, and feedback screenshots to Anthropic.
Separately, a Slack request starts a GitHub Actions build that also calls Anthropic; Actions
applies database scripts and audits row-level security directly in Supabase, asks the live app
whether it is healthy, and reports back to Slack.

Facts behind the picture:

- Vercel hosts the app, deploys on push and runs one daily cron. BUILT. The plan is Hobby,
  which does not license commercial use [R docs/PLATFORM.md:25-44, 74].
- Supabase holds Postgres, Auth and the `documents` storage bucket in ca-central Toronto on
  the Free plan, which takes no backups. BUILT [R docs/PLATFORM.md:46-64, 75].
- The custom domain `app.robinsonsgeneralstore.ca` is live, verified 2026-08-11. BUILT
  [R docs/PLATFORM.md:88]. Vianet has no self-serve DNS editor; changes are a phone call
  [R docs/PLATFORM.md:78]. The domain was due to renew 2026-10-16 and nobody has seen it
  renew [R docs/HANDOVER.md:231].
- Anthropic is US-hosted and pay as you go [R docs/PLATFORM.md:76].
- Resend: the code exists and is off until keys are set; it has never been configured.
  SCAFFOLDED, switch is `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO` in Vercel
  [R src/app/api/alerts/route.ts:98-105] [R docs/STATUS.md:392-393].
- Slack carries build requests in and watchdog and migration messages out, through a bot app
  and an incoming webhook. BUILT [R docs/PLATFORM.md:80]. Build requests are switched on since
  2026-10-30, when `SLACK_REQUEST_CHANNEL` was set (section 8).
- The Slack build runs Claude Code in GitHub Actions on the app's Anthropic key
  [R .github/workflows/slack-autopilot.yml:195-199]. Migrations and the RLS audit connect to the
  database with `psql` [R .github/workflows/migrate.yml:150] [R .github/workflows/rls-audit.yml:43];
  the health watchdog calls the app, not the database [R .github/scripts/health-check.mjs:33].
  BUILT.

### Target context: what is planned

Question: which outside services and features is the store planning to add, and how would
they connect?

```mermaid
flowchart LR
  APP["Robinson's store app<br/>everything built today"]
  AN["Anthropic API<br/>in-app AI"]
  MAIL["invoices@ mailbox<br/>email invoice intake"]
  QB["QuickBooks<br/>accounting"]
  POS["Point of sale<br/>till sales"]
  GS["Google Sheets<br/>the owner's live sheets"]
  SLK["Slack<br/>questions to the assistant"]
  VEC["Search index or tool use<br/>Ask at larger data sizes"]
  S2["A second store<br/>same app, own settings"]
  APP -- "extract, ask, reorder, triage" --> AN
  MAIL -. "vendor invoices from allowed senders" .-> APP
  APP -. "export invoices and payments" .-> QB
  POS -. "daily sales for margin, shrinkage, demand reorder" .-> APP
  GS -. "pull live sheets; push FromApp tabs" .-> APP
  SLK -. "questions answered from store data" .-> APP
  APP -. "Ask looks things up instead of preloading" .-> VEC
  S2 -. "own store_id, row-level security, settings" .-> APP
  classDef scaffolded fill:#fff4d6,stroke:#b7791f,stroke-dasharray:5 3
  classDef target fill:#eef2f7,stroke:#64748b,stroke-dasharray:5 3
  class MAIL scaffolded
  class QB,POS,GS,SLK,VEC,S2 target
```

Plain flow: today's app and its AI stay as they are; planned next are vendor invoices arriving
by email, an export to QuickBooks, till sales from the point of sale, a two-way sync with the
owner's Google Sheets, questions asked in Slack, a search index once the data outgrows one
prompt, and a second store on the same app.

| Planned piece | State | Waits on | Evidence |
|---|---|---|---|
| Email invoice intake | SCAFFOLDED: AgentMail installed, not wired | The owner creating the invoices@ mailbox | [R docs/REQUIREMENTS.md:154-157] [R docs/PLATFORM.md:85, 155] |
| QuickBooks export, point-of-sale import | TARGET, QUEUED | Nothing recorded; the owner confirmed the store runs both | [R docs/REQUIREMENTS.md:149-150] |
| Google Sheets sync, phases 2 and 3 | TARGET, QUEUED | The live sheets shared with the developer's Google account | [R docs/REQUIREMENTS.md:146-148] |
| Slack questions answered by the assistant | TARGET, not designed | A design; stated as the direction by the developer on 2026-10-30 | [Q: owner] which channel, who may ask, and whether money answers are allowed there |
| Search index or tool use for Ask | TARGET, deferred | The data outgrowing one prompt | [R docs/PLATFORM.md:179] |
| A second store | TARGET; the database is already per store | ARCH-13, and the product direction in open pull request #78 | Section 2, section 8 |

Planned inside the app, with no new outside service, all QUEUED: three-way match before
payment, a food-safety compliance module, recurring obligations and renewals from the
payments workbook, department photo tiles, and a price-check list
[R docs/REQUIREMENTS.md:138-158].

## 2. Containers

Question: what are the deployable pieces, and how do they talk to each other?

```mermaid
flowchart LR
  UI["Browser UI<br/>client components"]
  API["9 API routes<br/>Vercel functions"]
  CRON["Vercel cron<br/>13:00 UTC daily"]
  AUTH["Supabase Auth"]
  DB[("Postgres<br/>RLS per store")]
  ST["Storage<br/>documents bucket"]
  AN["Anthropic API"]
  GHA["GitHub Actions"]
  RS["Resend email<br/>SCAFFOLDED, off"]
  UI -- "sign in" --> AUTH
  UI -- "reads, writes, payment RPCs" --> DB
  UI -- "upload files, view by signed URL" --> ST
  UI -- "bearer token + request" --> API
  CRON -- "GET /api/alerts" --> API
  API -- "checks the token, manages logins" --> AUTH
  API -- "as the caller or the service role, logs AI calls" --> DB
  API -- "screenshots, import archive" --> ST
  API -- "extract, ask, reorder, triage" --> AN
  API -. "due email when keys set" .-> RS
  GHA -- "run-order.txt scripts" --> DB
  GHA -- "GET /api/health" --> API
  classDef scaffolded fill:#fff4d6,stroke:#b7791f,stroke-dasharray:5 3
  class RS scaffolded
```

Plain flow: the browser signs in with Supabase Auth, reads and writes the database directly,
store-scoped by row-level security, and uploads and views documents in Storage; anything that
needs a secret (the AI key, the service role) goes through one of nine API routes on Vercel.
Most routes query as the signed-in caller; admin users, alerts and health use the service
role, and import uses it when its key is set. GitHub Actions applies database scripts directly and checks the live app through
`/api/health`.

- Routes check the caller's token with Supabase Auth [R src/lib/serverMember.ts:54]
  [R src/app/api/admin/users/route.ts:53]. Feedback triage downloads the screenshot from
  Storage and import archives every uploaded workbook there
  [R src/app/api/feedback-triage/route.ts:56] [R src/app/api/import/route.ts:26]. Documents are
  viewed through signed URLs, with a public-URL fallback in demo mode [R src/lib/docs.ts:15, 21].
  The alerts route calls Resend directly when its keys are set [R src/app/api/alerts/route.ts:98].
  BUILT.

The nine API routes. All BUILT; each exports `preferredRegion = "yul1"`:

| Route | Does | Who may call | Evidence |
|---|---|---|---|
| `/api/extract` | Claude vision reads an invoice image into a strict JSON contract with a confidence per line | Signed-in member when login is enforced | [R src/app/api/extract/route.ts:9, 11-28, 69] |
| `/api/ask` | Answers from the store's notes, vendors and invoices; withholds invoices from non-money roles | Signed-in member | [R src/app/api/ask/route.ts:14, 36, 44-50, 91] |
| `/api/reorder` | Plain-language summary of the formula reorder list | Money roles once login is enforced | [R src/app/api/reorder/route.ts:12, 33] |
| `/api/feedback-triage` | Describes a screenshot attached to a suggestion into `feedback_summary`, which opens to the people who may open the screenshot (ADR-005) | Signed-in member who may open the screenshot | [R src/app/api/feedback-triage/route.ts:30, 56, 85-91] |
| `/api/alerts` | Daily due-date email of unpaid and partially paid invoices; guarded by `CRON_SECRET` | The Vercel cron | [R src/app/api/alerts/route.ts:12, 23-44, 53-54] [R vercel.json:3-5] |
| `/api/health` | Pass or fail on database reachability, the owed-total rule, the payment engine, status drift and required columns and tables; never returns a dollar figure | Anyone; detail only with `CRON_SECRET` | [R src/app/api/health/route.ts:11, 22-24, 75-77, 157-293] |
| `/api/import` | Loads the bookings, schedule or inventory workbook | Owner or manager | [R src/app/api/import/route.ts:14, 450-451] |
| `/api/export` | One Excel workbook, a tab per table, including department field choices | Owner or manager | [R src/app/api/export/route.ts:60, 75-76, 90-104] |
| `/api/admin/users` | Creates and removes staff logins with the service role, forced to the caller's store | Owner or manager | [R src/app/api/admin/users/route.ts:8, 32, 69, 139] |

AI routes: default model `claude-sonnet-5`, `ANTHROPIC_MODEL` overrides; no temperature is
sent, on purpose, because current models reject non-default sampling; text answers go
through `plainText()` [R src/app/api/ask/route.ts:39, 152, 166] [R src/app/api/reorder/route.ts:23, 110]
[R src/app/api/feedback-triage/route.ts:82]. BUILT.

AI usage log and daily cap. BUILT: every model call goes through `callClaude`
[R src/lib/anthropic.ts:66], which reserves a row in `ai_call` before the model is asked and
records how it ended afterwards [R src/lib/anthropic.ts:70, 152, 158], through the database
functions `ai_call_begin` and `ai_call_finish` [R supabase/ai_call.sql:37-69, 73-108]. A row
holds the store, route, model, token counts, duration and outcome, never the prompt, the store
data sent with it or the answer [R supabase/ai_call.sql:4-8, 11-24]. Each store may make
`AI_DAILY_CAP_PER_STORE` calls per Ontario calendar day, default 100
[R src/lib/aiUsage.ts:24-28] [R supabase/ai_call.sql:55-58]; past that the call is refused
before it reaches the model and logged as `capped` [R supabase/ai_call.sql:59-62]. If the log
cannot be reached the call still goes through: the cap protects the monthly bill, not the
store's data [R src/lib/aiUsage.ts:10-13]. Reading the rows is PARTIAL: the owner-only read
policy lives in `auth_setup.sql` [R supabase/auth_setup.sql:148-152], which migrate does not
run [R supabase/run-order.txt:10-16], so it applies only when that file is rerun by hand in
the SQL editor. Whether it has been rerun on the live database since `ai_call` was added:
[Q: the developer].

Region: every route asks for Montreal (`yul1`) in code, and the developer set Function Region to Montreal in the Vercel dashboard on 2026-08-17 [R docs/STATUS.md:101-102]. BUILT:
production runs in Montreal [V-run, `curl -sD- -o /dev/null https://app.robinsonsgeneralstore.ca/api/health`, `x-vercel-id: cle1::yul1::...`, 2026-10-24].
The header reads `<edge>::<function region>::<id>`, so the region is the second field; the first is the Vercel edge nearest the caller and varies.
Whether the code export alone would also work is unknown: the August readings of `iad1` that
called it a no-op did not record which field they read [R docs/STATUS.md:85].

## 3. The capture loop

Question: how does an invoice photo become a posted receiving record?

```mermaid
sequenceDiagram
  actor Staff
  participant UI as Capture screen
  participant EX as /api/extract
  participant AI as Claude vision
  participant ST as Storage
  participant DB as Postgres
  alt photo or PDF
    Staff->>UI: drop invoice photo or PDF
    UI->>UI: shrink a large photo before sending
    UI->>EX: image + session token
    EX->>DB: ai_call_begin (refused past the daily cap)
    EX->>AI: strict JSON contract
    AI-->>EX: vendor, date, lines, confidence per line
    EX->>DB: ai_call_finish
    EX-->>UI: draft
  else Enter manually (phone order)
    Staff->>UI: type vendor, date and lines
  end
  Staff->>UI: fix amber lines or tick "I checked", acknowledge any discrepancy
  opt only when there is a file
    UI->>ST: upload the original file
  end
  UI->>DB: receiving_event (store, author, acks)
  UI->>DB: receiving_line rows (confidence gate trigger)
  UI->>DB: activity_log (who, when)
```

Plain flow: a photo is shrunk if large and read by Claude into a draft with a confidence per
line, unless the store has used its daily AI allowance; a phone order is typed in instead and
never touches the AI or Storage. A person fixes or confirms every low-confidence line, then
any original file is uploaded and the receiving event, its lines and an audit row are written.

- Manual entry needs no file and skips the upload [R src/app/capture/page.tsx:193, 199-201].
  BUILT. The AI usage reserve and finish around the model call are in section 2
  [R src/lib/anthropic.ts:70, 152, 158].

- The photo is downscaled before sending so a phone picture does not exceed the request body
  limit; the stored file is the original. BUILT [R src/app/capture/page.tsx:114-122].
- Save is blocked until any discrepancy and any amber line is acknowledged
  [R src/app/capture/page.tsx:190-193]. The database refuses a line under 0.7 confidence
  with a unit cost unless the event carries `low_confidence_ack`. BUILT
  [R supabase/edit_delete.sql:41-61].
- Order of writes: file upload first, then `receiving_event`, then `receiving_line`, then
  `activity_log` [R src/app/capture/page.tsx:199-238]. These are four separate requests from
  the browser, not one transaction (see ARCH-07).
- Capture writes no `invoice` row; invoices are entered on the vendor and money screens.
  BUILT [R src/app/capture/page.tsx:205-238].

## 4. Money: how an invoice's status moves

Question: what decides whether an invoice reads unpaid, partially paid, post-dated or paid?

```mermaid
stateDiagram-v2
  [*] --> unpaid: invoice entered (default)
  unpaid --> partially_paid: allocations cover part of the total
  unpaid --> paid: settled allocations cover the total
  unpaid --> postdated: future-dated cheques complete the total
  partially_paid --> paid: settled allocations reach the total
  partially_paid --> postdated: future-dated cheques complete the total
  postdated --> paid: cheque date arrives (reconcile_postdated)
  paid --> partially_paid: void_payment or invoice amount raised
  paid --> postdated: edit_payment moves the date into the future
  postdated --> partially_paid: a cheque voided or the invoice raised, part still covered
  partially_paid --> unpaid: last payment voided
  paid --> unpaid: every payment voided
  postdated --> unpaid: cheque voided
  note right of postdated
    Overdue is not a status: it is computed
    from due_date on screen. Voided is not a
    status: it is the voided_at flag.
  end note
```

Plain flow: the database adds up an invoice's allocations from payments that are not voided,
splitting them into money already gone (paid date today or earlier, or no date) and money
on future-dated cheques, and sets one of four statuses from that; overdue and voided sit
beside the status and never replace it.

How the engine actually derives it. BUILT:

- Four stored statuses only: `unpaid`, `partially_paid`, `paid`, `postdated`
  [R supabase/schema.sql:166] [R supabase/payments_v2.sql:40-42].
- Total owed is amount plus freight plus HST, except HST is not added when `tax_mode` is
  `included` [R supabase/payments_v2.sql:81-89].
- Settled is the sum of allocations whose payment date is today or earlier in Toronto time,
  or null; scheduled is the sum dated in the future; voided payments count for nothing
  [R supabase/payments_v2.sql:111-117].
- The rule, in order: total of zero or less reads `paid` if any money is allocated, else
  `unpaid`; settled at or above total is `paid`; settled plus scheduled at or above total is
  `postdated`; anything above zero is `partially_paid`; otherwise `unpaid`
  [R supabase/payments_v2.sql:119-129]. So an invoice partly paid with a post-dated cheque
  that does not finish it reads `partially_paid`.
- `order_invoice_fields.sql`, the latest script that touches this, re-creates the same
  function with the same rule and re-derives every invoice once
  [R supabase/order_invoice_fields.sql:66-121].
- Post-dated is a future `paid_date` on a payment, never a method; the method list is cash,
  cheque, four card types, e-transfer, EFT, other, plus legacy `cc`
  [R supabase/schema.sql:181-182].

What moves it:

| Trigger | Effect | Evidence |
|---|---|---|
| `record_payment` | Inserts the payment and its allocations, re-derives each touched invoice, writes audit rows, one transaction | [R supabase/payments_v2.sql:140-195] |
| `void_payment` | Sets `voided_at` on the payment (soft void) and re-derives every invoice it touched | [R supabase/payments_v2.sql:198-221] |
| `edit_payment` | Changes date, method, reference, notes, filing; never the amount; re-derives, because a date change moves money between settled and post-dated | [R supabase/payments_v2.sql:223-267] |
| `reconcile_postdated` | Re-derives every non-voided `postdated` invoice; called on load by editors, no cron | [R supabase/payments_v2.sql:271-286] [R src/app/overdue/page.tsx:40-42] |
| Invoice edited on the vendor page | Calls `recompute_invoice_status` right after the save | [R src/app/vendors/[id]/page.tsx:519-521] |
| Legacy insert with `invoice_id` | Trigger creates the allocation and re-derives | [R supabase/payments_v2.sql:290-313] |

Beside the status:

- Overdue: `daysOverdue()` against `due_date`, shown as a red chip; never stored
  [R src/lib/format.ts:33-47] [R supabase/schema.sql:165]. The Overdue screen lists
  `unpaid`, `partially_paid` and `postdated`, and shows post-dated as "post-dated" rather
  than overdue [R src/app/overdue/page.tsx:46-47, 149-153]. The daily email covers `unpaid`
  and `partially_paid` only [R src/app/api/alerts/route.ts:53-54].
- Voided invoice: `voided_at` set by `voidRow`; the row drops out of every list
  [R src/lib/edit.ts:17-22] [R supabase/schema.sql:781-797].
- Credit notes (`pending`, `applied`, `disputed`) do not change the status or the owed
  total; the engine never reads `credit_note` [R supabase/schema.sql:207-217]
  [R supabase/payments_v2.sql:105-117]. See ARCH-08.

## 5. Data

Question: how do the money tables connect, and which column ties each to a store?

```mermaid
erDiagram
  store |o--o{ vendor : "store_id"
  store |o--o{ invoice : "store_id"
  store |o--o{ purchase_order : "store_id"
  vendor |o--o{ purchase_order : "vendor_id"
  vendor |o--o{ invoice : "vendor_id"
  vendor |o--o{ payment : "vendor_id"
  invoice |o--o{ payment : "invoice_id, legacy"
  payment ||--o{ payment_allocation : "payment_id"
  invoice ||--o{ payment_allocation : "invoice_id"
  vendor ||--o{ credit_note : "vendor_id"
  invoice |o--o{ credit_note : "invoice_id, optional"
```

Plain flow: a store has vendors, orders and invoices; a vendor has orders, invoices, payments
and credit notes; one payment splits across zero or more invoices through payment_allocation,
which is how a single cheque settles several invoices and how a deposit waits with none.

- The store and vendor links are nullable foreign keys, so the database itself does not insist
  on a parent; the app always stamps them [R supabase/schema.sql:36, 136, 138, 177, 629, 630].
  An allocation always has its payment and invoice, and a credit note always has its vendor
  [R supabase/schema.sql:196-197, 210].
- `payment.invoice_id` is the legacy one-invoice link, still written by the bookings import; a
  trigger turns it into an allocation [R supabase/schema.sql:178]
  [R src/lib/importBookingsV2.ts:419-421] [R supabase/payments_v2.sql:290-313].
- `record_payment` accepts an amount with no allocations, a deposit
  [R supabase/payments_v2.sql:147, 159-163].
- Table names are real: `store`, `vendor`, `purchase_order`, `invoice`, `payment`,
  `payment_allocation`, `credit_note` [R supabase/schema.sql:7, 34, 134, 175, 194, 207, 627].
- `purchase_order` and `invoice` also carry `store_id` [R supabase/schema.sql:136, 629];
  `credit_note` does too [R supabase/schema.sql:209]. There is no foreign key between
  `invoice` and `purchase_order`; an invoice carries `po_number` as text
  [R supabase/schema.sql:160].
- Every amount column is `numeric` dollars: `invoice.amount`, `hst_amount`,
  `freight_charges`, `payment.amount`, `payment_allocation.amount`,
  `credit_note.credit_amount`, `purchase_order.order_amount`. BUILT
  [R supabase/schema.sql:141-143, 179, 198, 213, 633]. The header comment says the same, and integer cents is
  not planned [R supabase/schema.sql:3]; ARCH-09 is closed.
- Nothing in `schema.sql` uses vectors; the only extension created is `pgcrypto`
  [R supabase/schema.sql:5]. pgvector for Ask the store is TARGET, deferred until the data
  outgrows one prompt [R docs/PLATFORM.md:176].

The store-scoping rule. BUILT: every read filters by the active `store_id` and every insert
stamps it; child tables scope through their parent [R .claude/skills/robinsons-store/SKILL.md:121].
PARTIAL in the code: a few reads leave scoping to row-level security alone, for example the
capture screen's list of people (`app_user`) and the shared tax rules
[R src/app/capture/page.tsx:61, 77].
At the database, 14 tables carry their own `store_id` policy: nine in section 3a
[R supabase/auth_setup.sql:102-133] and the five that carry a dollar figure in section 3e,
which adds the role fence [R supabase/auth_setup.sql:315-331]. `inventory_count_line`,
`shift` and `retail_price` scope through their parents [R supabase/auth_setup.sql:159-198];
`payment` through its vendor (or legacy invoice), `payment_allocation` through its payment,
and `pay_rate` and `receiving_line` through theirs, all in 3e
[R supabase/auth_setup.sql:333-412]. `ai_call`, the AI usage log, is store-scoped in its own
block: the owner reads it, and nobody writes it except through its two functions
[R supabase/auth_setup.sql:135-157]. `feedback_summary`, the AI's description of a suggestion
screenshot, is store-scoped in section 3g and opens by the screenshot's rule (ADR-005)
[R supabase/auth_setup.sql:658-771]. `ai_call.sql` runs just before `money_by_role.sql`
[R supabase/run-order.txt:26-27]. `department_field`, the Department fields screen's ticks, is store-scoped
[R supabase/schema.sql:302-314]. Every member reads it; only the owner inserts or updates it for a
department of their own store, and nothing deletes it [R supabase/auth_setup.sql:159-196].
Its migration applies the same policies itself when login is on
[R supabase/department_field.sql:36-67] and is the last script in the run order
[R supabase/run-order.txt:30]. A new table needs a policy in `schema.sql`, in
`auth_setup.sql` (3a, or 3e if it holds a dollar figure), and in a migration for live
databases [R CLAUDE.md:33-35].

Soft voids only: `voided_at` and `voided_by` sit on 13 tables from one loop plus `credit_note`
and `feedback`; shifts are the one hard delete [R supabase/schema.sql:220-221, 240-241, 776-792].

## 6. Build and release

Question: how does a change travel from a request to the live store?

```mermaid
flowchart LR
  REQ["Slack request"]
  AP["Slack autopilot build job<br/>commits, cannot push"]
  REV["Review on a fresh runner<br/>ship opens the pull request"]
  PR["Draft pull request<br/>target: develop"]
  CI["Independent CI<br/>lint, tsc, blank-env build"]
  DEV["develop branch"]
  PRE["Vercel dev preview<br/>separate dev database"]
  HUM["Person runs promotion<br/>develop to main pull request"]
  LIVE["main: Vercel production deploy<br/>production migrations and watchdog"]
  REQ -- "mention in the request channel" --> AP
  AP -- "commit as a bundle" --> REV
  REV -- "ship pushes, opens and labels" --> PR
  PR -- "ship starts CI for tiers A and B" --> CI
  CI -- "passes; person merges, or tier A if enabled" --> DEV
  DEV -- "deploys against dev data" --> PRE
  PRE -- "person verifies the change" --> HUM
  DEV -- "supplies the promotion commits" --> HUM
  HUM -- "checks pass, merges to main" --> LIVE
```

Plain flow: Slack intake builds a commit, review and ship open its pull request, independent CI checks it, the change lands on `develop` for a dev preview, and a person promotes `develop` to `main` for the live deployment.

BUILT: Slack intake is switched on since 2026-10-30, when the repository variable
`SLACK_REQUEST_CHANNEL` was set [R .github/workflows/slack-autopilot.yml:105-121].
BUILT: `develop` and its dev preview exist; a person starts `promote.yml` to open and merge
a `develop` to `main` pull request after checks pass [R docs/ENVIRONMENTS.md:19-27,54-56]
[R .github/workflows/promote.yml:24-25,84-113]. Automatic dev migrations wait for the
`SUPABASE_DB_URL_DEV` secret [R docs/ENVIRONMENTS.md:75]. Production migrations and
the health watchdog remain separate workflows, detailed below.

| Step | What happens | State | Evidence |
|---|---|---|---|
| Slack request | Sweeps every 30 minutes; an idle sweep spends no model tokens; builds with `claude-sonnet-5`, at most 60 turns; stops and explains on payments, RPCs, auth, RLS or deletes; the job it builds in holds no Slack token, can only read the repository and hands its commit over as a bundle; a change to `.github/` or `.claude/`, including a file moved out of them, or a change not built on the base commit the run started from, is never pushed; anything else becomes a DRAFT pull request, opened by ship after the review; merges only tier A (see below). Switched on 2026-10-30 when the repository variable `SLACK_REQUEST_CHANNEL` was set | BUILT | [R .github/workflows/slack-autopilot.yml:93-292] |
| Review | A separate job on a fresh runner, checked out at the workflow's own commit: reads the build's commit from its bundle and lays its files out as data with agent instruction files removed, runs money-reviewer and invariant-auditor as two `claude-sonnet-5` runs with Read, Grep and Glob only and no Slack text; no verdict line counts as not passed. Verdicts go on the pull request, reports to the Slack thread; tier A merges only if both passed the same commit | BUILT, not yet run on a live request | [R .github/workflows/slack-autopilot.yml:308-427, 536-540, 601-650] [R .github/scripts/autopilot-review.mjs] [V-run, `autopilot-review.test.mjs` 42/42 and a dry run of the layout step, 2026-10-30] |
| Status card | Updates the Slack thread through review, checks and merge, for `claude/slack-*` branches only. "Live" is posted only when someone runs the workflow by hand with that stage; nothing posts it automatically | PARTIAL | [R .github/workflows/slack-lifecycle.yml:3-16, 18-25] [R .github/scripts/slack-lifecycle-stage.mjs:22-26, 32, 57] |
| Tier classifier | Script that sorts a diff into A (prose files only, may self-merge), B (app, person merges), C (money, access, database, configuration, automation, and every agent instruction file at any depth; never merges). The Slack loop runs it in a separate job, on a fresh runner, on every pull request it opens and labels the pull request with the tier | PARTIAL: rules tested, not yet run on a live request | [R .github/scripts/classify-change.mjs:25-79] [R .github/workflows/slack-autopilot.yml:462-519] [R .github/workflows/ci.yml:93] |
| Tier A self-merge | Requires both reviewers to have passed the head commit; starts CI on it, waits, reads the pull request again (open, same commit, same base), merges with the commit pinned; fails closed (ADR-002) | SCAFFOLDED, switch is `AUTOMERGE_TIER_A` = `true` | [R .github/workflows/slack-autopilot.yml:536-584] |
| CI on autopilot pull requests | A pull request opened with the workflow's token starts no workflow, so ship starts CI on tier A and B pull requests that did not go through the merge step; not tier C, because a dispatched run uses the branch's workflow files | BUILT, not yet run on a live request | [R .github/workflows/slack-autopilot.yml:586-597] |
| CI gates | `npm run lint`, `npx tsc --noEmit`, `npm run build` with blank Supabase env, plus the automation's own tests | BUILT | [R .github/workflows/ci.yml:3-13, 36-55] |
| Merge | A person merges, except tier A once switched on. Changes under `.github/` and `.claude/` never merge on their own. Main accepts changes only through a pull request: no direct push, force-push or deletion | BUILT | [R docs/LOOP_ENGINEERING.md:65-110] [V-run, `gh api repos/raviteja0012/robinsons-store/rulesets/25802611`, ruleset "main: pull requests only", active on refs/heads/main, 2026-10-25] |
| Deploy | Vercel deploys `develop` and pull requests as dev previews; promotion to `main` deploys production | BUILT | [R docs/ENVIRONMENTS.md:19-39] |
| Migrate | On pushes to `main` or `develop` touching `supabase/**`, applies `supabase/run-order.txt` to the corresponding environment; rebuild and seed scripts are excluded. Automatic dev migrations wait for `SUPABASE_DB_URL_DEV` | BUILT for production; SCAFFOLDED for automatic dev migrations | [R .github/workflows/migrate.yml:33-39,66-96] [R docs/ENVIRONMENTS.md:75] |
| Watchdog | After CI completes on main (waiting 90 seconds), every two hours and by hand, calls `/api/health` and posts to Slack only when the answer changes; checks `PRODUCTION_URL` or falls back to the vercel.app address. It does not check which commit is live | BUILT | [R .github/workflows/post-deploy-watch.yml:16-22, 47-49, 54] |
| RLS audit | Weekly, Monday 12:23 UTC: lists public tables with RLS off or empty, tells Slack, goes red | BUILT | [R .github/workflows/rls-audit.yml:1-17] |
| Dev site and promotion | `promote.yml` opens a `develop` to `main` pull request when a person runs it, starts CI on its head commit, and merges with that commit pinned only if CI passed and `develop` holds everything on `main`; otherwise the pull request stays open and the run fails. CI starts by itself on pull requests into and pushes to `develop` | PARTIAL: the merge step has not yet run end to end on GitHub | [R .github/workflows/promote.yml:16-19, 48-56, 107-194] [R .github/workflows/ci.yml:3-7] [V-run, git ls-remote --heads origin, 2026-10-30: develop at cae5104] |
| Manual tools | `vercel-diagnose`, `vercel-protect`, `slack-announce` run by hand | BUILT | [R docs/PLATFORM.md:79, 153] |

Working in Claude Code: the `robinsons-store` skill, with its standards reference, loads from
`.claude/skills/`; a Stop hook refuses to end a turn while TypeScript is broken
[R .claude/settings.json:14-19]; update docs/STATUS.md and docs/VERIFICATION.md in the same
pull request as the work [R CLAUDE.md:23-24]. Human review of every dollar field stays
non-negotiable.

## 7. Security and privacy

Store data is fenced by store at the database. Money is fenced by role in the app and the API,
and the same fence at the database is built and applies on merge (ARCH-03;
docs/adr/ADR-003-money-by-role-at-the-database.md). Stored files are fenced by store and by
kind at the database, built and applying on merge (ARCH-04;
docs/adr/ADR-004-stored-files-by-store-and-role.md). The AI's description of a suggestion
screenshot follows the rule of the file it was read from, built and applied to the live
database on 2026-10-30 (ARCH-15;
docs/adr/ADR-005-screenshot-descriptions-follow-the-screenshot.md).

- Row-level security, repository default: a fresh install from `schema.sql` gets the open
  demo policy set (`dev_all`, anon read and write on every table) and a public `documents`
  bucket [R supabase/schema.sql:823-852]. BUILT, for demos only.
- Row-level security, production: the cutover in `auth_setup.sql` is applied: 21
  `member_store_rw` policies, no open dev policies, the `documents` bucket private, one login
  account [R docs/STATUS.md:495-498]. That was read live on 2026-10-18 and not re-read
  this session [J-open: killed if `select count(*) from pg_policies where policyname =
  'dev_all'` returns more than 0]. Once `money_by_role.sql` applies, the nine money tables
  carry `money_store_rw` instead of `member_store_rw`, and `receiving_line` also
  `member_store_insert` (ADR-003 condition 3 reads it).
- Login enforcement in the app is the build-time flag `NEXT_PUBLIC_REQUIRE_AUTH`; with it on,
  the member-facing API routes require a valid session and query as the caller
  [R src/lib/serverMember.ts:3-10, 35-50]. Two routes are exceptions by design: `/api/health`
  answers anyone and gives detail only with `CRON_SECRET`, and `/api/alerts` takes the cron
  secret instead of a session [R src/app/api/health/route.ts:127-130]
  [R src/app/api/alerts/route.ts:22-24]. Its production value was not read this session
  [Q: the developer, confirm it is `true` in Vercel production].
- Roles and money: `canSeeMoney` lets `lead`, `manager`, `owner` see costs and amounts, and
  treats an unknown role as staff, so money fails closed in the UI
  [R src/lib/auth.ts:34-40]. Ask withholds invoices from non-money roles and reorder refuses
  them, using the same rule on the server [R src/lib/serverMember.ts:18-21]
  [R src/app/api/ask/route.ts:39] [R src/app/api/reorder/route.ts:33-35]. Extract does not: any signed-in member gets the line
  costs it reads, because capture is staff work [R src/app/api/extract/route.ts:71-73, 147].
  The database applies the same rule as
  `app_auth.can_see_money()` [R supabase/auth_setup.sql:300-309]. BUILT in the repository: the
  nine tables that carry a dollar figure return no rows to staff and refuse their writes, the
  payment functions (security invoker) refuse them, and a payment cannot be allocated to
  another store's invoice [R supabase/auth_setup.sql:315-412]. Staff screens read three views
  with no dollar column: `vendor_directory` (Capture, Ask), `invoice_due` (the bell, Due) and
  `insurance_renewal` (the bell, Compliance) [R supabase/auth_setup.sql:414-490]. Capture still
  saves a priced line for staff without reading it back [R supabase/auth_setup.sql:407-412].
  Proven on fresh and upgraded copies [V-run, supabase/money_by_role_test.sql on
  supabase/postgres 17.11.0.005, 2026-10-25: 130 of 130 checks pass on both] and through
  PostgREST v14.18 with the app's own client [V-run, 48 of 48 read and write paths for owner,
  manager and staff, 2026-10-25]. Live once `supabase/money_by_role.sql` applies on merge
  [Q: the developer, run ADR-003 condition 3 after the merge]. `department.target_margin` is a
  percentage and stays readable (ADR-003).
- Documents: private bucket, read through signed URLs that expire after an hour
  [R supabase/auth_setup.sql:281-287] [R src/lib/docs.ts:5, 17]. BUILT in the repository:
  each file is saved under its store's folder and a kind folder (invoices, feedback,
  imports) [R src/lib/documentPath.ts:7-11]. A member opens only their own store's files:
  invoice photos only as lead, manager or owner; screenshots and voice notes also when they
  saved them; the workbook archive only as owner or manager. Any member saves invoice photos
  and suggestion files, only owner and manager save workbooks, and nothing is changed or
  deleted through the API [R supabase/auth_setup.sql:492-617]. Files saved before the store
  folders are recorded once with their store, so none moves [R supabase/auth_setup.sql:508-556].
  Proven on fresh and upgraded copies [V-run, supabase/documents_by_role_test.sql on
  supabase/postgres 17.11.0.005 with supabase/storage-api v1.79.5, 2026-10-25: 163 of 163
  checks pass on both] and through the storage service with the app's own client
  [V-run, @supabase/storage-js 2.106.2, 2026-10-25: uploads, signed URLs, downloads and
  listings for owner, manager, lead, two staff and a second store, 55 of 55 on a fresh copy
  and 108 of 108, older files included, on a copy upgraded from main]. Live once
  `supabase/documents_by_role.sql` applies on merge [Q: the developer, run ADR-004 condition 3
  after the merge]. Who opens which file follows the owner's
  requirement (ADR-004).
- Screenshot descriptions: BUILT. The AI's description of a suggestion screenshot is kept in
  `feedback_summary`, one row per suggestion with the file it was read from, and opens to the
  members of its store who may open that file, every role through the same file check, counting
  only the file saved under that name by the time the description was; for a suggestion file
  that is lead, manager, owner and the member who attached it [R supabase/auth_setup.sql:675-710].
  The database dates every save [R supabase/auth_setup.sql:641-656]. Whoever may read one may
  write it, for its own suggestion's file, so the reader runs as the caller; no member removes
  one [R supabase/auth_setup.sql:699-731]. Older descriptions moved off `feedback.ai_summary`,
  which is dropped [R supabase/auth_setup.sql:658-673]. Proven on fresh and
  upgraded copies [V-run, supabase/feedback_summary_test.sql on supabase/postgres 17.11.0.005
  with the storage schema of supabase/storage-api v1.79.5, 2026-10-25: 85 of 85 checks pass on
  both] and through PostgREST v14.18 and the storage service with the app's own client
  [V-run, @supabase/supabase-js 2.106.2, 2026-10-25: the Suggestions reads and the reader's
  save for owner, manager, lead, two staff and a second store]; the cases for every role and
  the save date (sections 4b and 4c of `supabase/feedback_summary_test.sql`) have not run yet
  [J-open: killed if any fails on a disposable Supabase stack]. Applied to the live database by
  the migration run on main 373b2b5 [V-run, `gh run list`: "Apply database scripts" succeeded,
  2026-10-30]; the save date and the file check for every role apply when
  `supabase/feedback_summary.sql` next runs on main. Verify with ADR-005 condition 3
  [Q: the developer, after each merge that changes section 3g].
- Audit trail: members may only insert `activity_log` rows attributed to themselves and have
  no update or delete policy [R supabase/auth_setup.sql:263-279]. BUILT.
- Service role key: server-side only, used by `/api/admin/users`, `/api/import`,
  `/api/alerts`, `/api/health` [R src/app/api/admin/users/route.ts:32]
  [R src/app/api/import/route.ts:381] [R src/app/api/alerts/route.ts:35]
  [R src/app/api/health/route.ts:121].
- PIPEDA and staff data: no AI route queries the employee, pay rate or shift tables; Ask and
  reorder read notes, vendors, invoices and orders [R src/app/api/ask/route.ts:45-58]
  [R src/app/api/reorder/route.ts:44-46]. BUILT. Staff data can still reach Anthropic as
  content: feedback triage sends the attached screenshot as an image, so a screenshot of the
  HR, pay or schedule screen carries that data [R src/app/api/feedback-triage/route.ts:63-75],
  and knowledge notes, typed freely by staff, go into every Ask prompt
  [R src/app/api/ask/route.ts:45, 73-76]. The screenshot picker says so before anything is attached
  [R src/app/suggestions/page.tsx:295-297]. BUILT.
- Canadian regions: records and stored files live in Toronto, and the API routes run in
  Montreal (section 2; ARCH-01 closed 2026-10-24). The four AI routes send data to Anthropic,
  which stores it in the US, and the due-date email goes through Resend, which stores its
  records in the US; what each flow sends, its region and its retention are in
  [R docs/PLATFORM.md:91-142]. The owner was told in writing, corrected 2026-10-24
  [R docs/owner-notes/store-app-infrastructure.html:516-532]; the owner's published copy
  changes only when the developer republishes it.

## 8. AI

Question: how does a photo or a question reach the model, and what stands between the model's
answer and the store's records?

```mermaid
flowchart LR
  P["Staff or owner"]
  R["AI route<br/>extract, ask, reorder, triage"]
  DB[("Postgres<br/>store data, feedback summaries")]
  CC["callClaude<br/>the one door"]
  LOG[("ai_call log<br/>daily cap per store")]
  AN["Anthropic API, US<br/>claude-sonnet-5"]
  CHK["Answer checks<br/>schema, stop reason, grounding"]
  H["Invoice capture: person confirms<br/>amber lines, I checked"]
  REC[("Receiving records")]
  P -- "photo or question, session" --> R
  R -- "Ask/reorder: store data by role" --> DB
  R -- "fenced prompt" --> CC
  CC -- "reserve; refused past the cap" --> LOG
  CC -- "Messages API, retries, timeout" --> AN
  AN -- "answer and stop reason" --> CHK
  CHK -- "invoice draft for review" --> H
  H -- "saves receiving only after confirming" --> REC
  CHK -- "Ask/reorder: display answer only" --> P
  CHK -- "triage: automatically save feedback_summary" --> DB
```

Plain flow: a route checks who is asking, reads store data where needed (Ask and reorder limit
dollar data by role), and hands a fenced prompt to `callClaude`, which counts the call against
the store's daily cap and then asks Anthropic. Checks include the invoice schema, the stop
reason and, for Ask, vendor names against the store data and app guide. Invoice capture saves
receiving records after a person confirms; `/api/feedback-triage` automatically saves the
screenshot description to `feedback_summary`. Ask and reorder answers are displayed, not saved.

What is in the AI side, layer by layer:

| Layer | What it does | State | Evidence |
|---|---|---|---|
| Agents | Four in the app (invoice reader, Ask the store, reorder summary, suggestion screenshot reader); the build side has the Slack autopilot and two read-only reviewers. Full register: docs/AGENTS.md | BUILT | [R docs/AGENTS.md] |
| Model | `claude-sonnet-5`; `ANTHROPIC_MODEL` overrides; no temperature or other sampling setting is sent | BUILT | [R src/lib/anthropic.ts:11-12, 56-58] |
| One door | Every call goes through `callClaude`: retries 429, 529 and 500, 502, 503, 504 twice with backoff, never retries a timeout or a 400, reads refusal and cut-off from `stop_reason` | BUILT | [R src/lib/anthropic.ts:53-54, 88-121, 137-142] |
| Prompt | Store data and the question are fenced and marked as data, not instructions | BUILT | [R src/app/api/ask/route.ts:145, 170-175] |
| Output contract | Invoice reader output is constrained to a JSON schema by the API | BUILT | [R src/app/api/extract/route.ts:43-67, 108] |
| Grounding | Checks vendor names the Ask answer mentions against the store data and app guide. Unsupported names withhold the answer; the question excuses them only if all occur in the question and the answer has no figures (no digits) | BUILT | [R src/lib/askGrounding.ts:256-290] [R src/app/api/ask/route.ts:185-196] |
| Human in the loop | Invoice capture requires a person to confirm and save; the database refuses a line under 0.7 confidence with a cost unless a person acknowledged it. Screenshot descriptions save automatically to `feedback_summary`; Ask and reorder answers are displayed, not saved | BUILT | [R src/app/capture/page.tsx:183-229, 432-439] [R supabase/edit_delete.sql:41-61] [R src/app/api/feedback-triage/route.ts:85-91] [R src/app/ask/page.tsx:23-42] [R src/app/reorder/page.tsx:151-157] |
| Cost | Daily cap per store, default 100 calls, roughly $10 on a runaway day; fails open so the receiving door is never blocked by the log | BUILT | [R src/lib/aiUsage.ts:8-15, 24-28] |
| Logging | Metadata only (route, model, tokens, time, outcome), never the prompt, store data or answer | BUILT | [R src/lib/anthropic.ts:162-171] [R supabase/ai_call.sql:4-8] |
| Failure words | Every failure has a plain sentence and a next step; capture always offers Enter manually | BUILT | [R src/lib/anthropic.ts:174-192] [R src/app/api/extract/route.ts:113-131] |
| Evals | 24 made-up golden cases scored by fixed rules; never run against the model, so a model change has no regression gate yet | PARTIAL | [R docs/AGENTS.md] |
| Data residency | The four routes send data to Anthropic in the US; what each sends is in section 7 and docs/PLATFORM.md | BUILT, recorded | Section 7 |
| Retrieval | The whole store's data goes in the prompt; a vector index waits until the data outgrows one prompt | TARGET | Section 9 |

Risks named after the standards, and where each is handled:

| Risk (OWASP LLM / NIST AI 600-1 term) | Handled by |
|---|---|
| Prompt injection | Fenced data in the prompt; issue logging is deterministic, not the model |
| Sensitive information disclosure | Money withheld by role before the prompt is built; no AI route reads staff tables (section 7) |
| Improper output handling | JSON schema, `plainText()` strip, grounding check |
| Excessive agency | Invoice capture requires a person to confirm and save; screenshot descriptions save automatically to `feedback_summary`; Ask and reorder answers are displayed, not saved. The build agent opens draft pull requests; only a words-only tier A change may merge itself, and that is off until `AUTOMERGE_TIER_A` is set (section 6) |
| Unbounded consumption | Daily cap per store |
| Confabulation | Confidence per line, amber lines, the 0.7 database gate |

Gap against the multi-store rule: the Ask and reorder prompts and the alert email name the store
and its town in code, so a second store's assistant would call itself Robinsons
[R src/app/api/ask/route.ts:62, 145] [R src/app/api/reorder/route.ts:54, 84]
[R src/app/api/alerts/route.ts:115, 120]. ARCH-13.

### AI enablement: how requests, requirements and rules reach Claude

Question: how does a request or a piece of owner feedback become a change, and what tells
Claude how to build it?

```mermaid
flowchart LR
  OWN["Owner and staff"]
  SUG["Suggestions page<br/>notes, voice, screenshots"]
  SLK["Slack<br/>store workspace"]
  DEV["Developer<br/>Claude Code sessions"]
  LED["Requirements ledger<br/>OWNER_NOTES, REQUIREMENTS"]
  RUL["Rules and templates<br/>CLAUDE.md, skill, standards, reviewers"]
  AP["Slack autopilot<br/>Claude Code in Actions"]
  PR["Draft pull request<br/>tier label, CI, merge"]
  ASK["Ask the store<br/>diagram above"]
  OWN -- "notes, voice, screenshots" --> SUG
  OWN -- "requests in the channel" --> SLK
  SUG -- "developer digest, pasted by hand" --> DEV
  DEV -- "triages each ask into" --> LED
  RUL -- "loaded by every session" --> DEV
  RUL -- "same rules for the build" --> AP
  SLK -- "request in the channel" --> AP
  SLK -. "questions, planned" .-> ASK
  SUG -. "asks filed into the ledger, planned" .-> LED
  DEV -- "opens" --> PR
  AP -- "opens and labels the tier" --> PR
```

Plain flow: owner and staff leave notes, voice and screenshots on the Suggestions page, and the
developer pastes its digest into a Claude Code session, files each ask in the requirements
ledger and opens a pull request; the same rules and templates load into every session and
into the Slack autopilot, which turns a channel request into a pull request; questions in
Slack and automatic filing of
asks are planned.

| Piece | What it does | State | Evidence |
|---|---|---|---|
| Suggestions page | Notes, voice and screenshots from the owner and staff; the screenshot reader describes images; "Copy developer digest" makes one block for a build session | BUILT | [R src/app/suggestions/page.tsx:7, 168, 244] |
| Requirements ledger | Every ask lands verbatim in docs/OWNER_NOTES.md, then gets a SHIPPED, QUEUED or OPEN line in docs/REQUIREMENTS.md. A person triages it in a session | BUILT, by hand | [R docs/REQUIREMENTS.md:284-291] |
| Rules and templates | CLAUDE.md; the robinsons-store skill and its invariants; the standards file's templates for every document, claim, decision record, diagram, review and basis footer; two read-only reviewers (money, invariants); a typecheck gate on every session | BUILT | [R .claude/skills/robinsons-store/references/standards.md:8-80] [R docs/AGENTS.md] |
| Slack autopilot | Turns a request in the channel into a draft pull request with Claude Code; the tier classifier labels it | BUILT; switched on 2026-10-30 when the repository variable `SLACK_REQUEST_CHANNEL` was set | [R docs/SLACK_AUTOPILOT.md:138] [V-run, `gh variable list`, 2026-10-30: `SLACK_REQUEST_CHANNEL` set at 20:57 UTC] |
| Review job on Slack-built pull requests | Two read-only reviewers read every Slack-built pull request before it ships | TARGET, open pull request #82 | Section 6 when it merges |
| Slack questions | Questions asked in Slack answered from the store's data by Ask the store | TARGET, not designed; the developer's stated direction, 2026-10-30 | [Q: owner] as in section 1 |
| Automatic filing of asks | Suggestions filed into the requirements ledger without a person | TARGET, not designed; the developer's stated direction, 2026-10-30 | None yet |

## 9. What is deliberately not here

Not the enterprise stack: no Snowflake, Fabric, Redpanda, MuleSoft, API gateway or MCP
governance at this scale. One store, thousands of rows a month; the upgrade path is earned
only if the business grows to many stores [R .claude/skills/robinsons-store/SKILL.md:25]
[R robinsons_store_build_spec.md:158]. Budget: $50 to $100 a month typical against a $200
ceiling [R docs/PLATFORM.md:13-14].

Also TARGET or declined, with the reasons in docs/PLATFORM.md:

| Capability | State | Evidence |
|---|---|---|
| pgvector for Ask the store | TARGET, deferred | [R docs/PLATFORM.md:176] |
| GPT-4o fallback, AWS Textract | TARGET, deferred | [R .claude/skills/robinsons-store/SKILL.md:23] |
| SMS alerts | TARGET | No SMS code exists [V-run, grep -ril "twilio\|sms" src/, 2026-10-24: no matches] |
| Email invoice intake (AgentMail) | Installed, not wired | [R docs/PLATFORM.md:82] |
| Supabase Edge Functions, Realtime | Declined | [R docs/PLATFORM.md:174-175] |
| Vercel AI Gateway, Blob, Workflows | Declined | [R docs/PLATFORM.md:165-167] |

## 10. Open items

| ID | Item | Owner | Blocking? |
|---|---|---|---|
| ARCH-01 | CLOSED 2026-10-24: Montreal function region confirmed, `x-vercel-id` second field reads `yul1` | The developer | No |
| ARCH-02 | `NEXT_PUBLIC_REQUIRE_AUTH` production value not read this session | The developer | No |
| ARCH-03 | BUILT 2026-10-25: money is fenced by role at the database as well as in the UI and API (ADR-003; `supabase/money_by_role.sql`), 130 of 130 checks on fresh and upgraded copies. Closes when the merge applies it and ADR-003 condition 3 reads clean | The developer | Yes, until it closes: before staff logins are made |
| ARCH-04 | BUILT 2026-10-25: stored files are fenced by store and by kind at the database (ADR-004; `supabase/documents_by_role.sql`): invoice photos open to lead, manager and owner, suggestion files also to whoever saved them, the workbook archive to owner and manager; 163 of 163 checks on fresh and upgraded copies. Closes when the merge applies it and ADR-004 condition 3 reads clean. Whether leads open the workbook archive [Q: Ravi Kiran] | The developer | Yes, until it closes: before staff logins are made |
| ARCH-05 | Supabase Free takes no backups (docs/PLATFORM.md risk 2; HANDOVER A-01) | Ravi Kiran | Yes |
| ARCH-06 | Vercel Hobby does not license commercial use (risk 1; HANDOVER A-01) | Ravi Kiran | Yes |
| ARCH-07 | Capture writes four separate requests; a failure part way leaves a stored file with no event, or an event with no lines | The developer | No |
| ARCH-08 | Credit notes do not reduce what the engine says is owed or change status. Intended? [Q: Ravi Kiran] | Ravi Kiran | No |
| ARCH-09 | CLOSED 2026-10-24: money stays `numeric` dollars and integer cents is not planned, decided by the developer; `schema.sql:3` now says so | The developer | No |
| ARCH-10 | ~~Tier A self-merge described in docs/LOOP_ENGINEERING.md section 3 is not wired into the live Slack loop~~ Closed 2026-10-24 by ADR-002: wired, off until `AUTOMERGE_TIER_A` is set | The developer | No |
| ARCH-11 | Domain renewal due 2026-10-16 not yet seen (HANDOVER A-04) | Ravi Kiran | Yes, for the domain |
| ARCH-12 | CLOSED 2026-10-30: the store's Miro board shows the nine diagrams in this file, built in Miro from the Mermaid here with the same colour key and named by section and date. The six older diagrams and their labels moved to a separate board, "Robinsons store architecture, archive". Redraw any diagram on the board whose Mermaid changes here | The developer | No |
| ARCH-13 | The store name and town are written into the Ask, reorder and alert prompts (section 8); read them from the store's settings so a second store needs no code change | The developer | Yes, before a second store |
| ARCH-14 | The AI golden-case evals have never run against the model; run them before any change to `ANTHROPIC_MODEL` or a prompt | The developer | No |
| ARCH-15 | BUILT 2026-10-25, applied to the live database 2026-10-30: the AI's description of a suggestion screenshot opens only to members who may open the file it was read from, every role through the same file check, with each save dated by the database (ADR-005; `supabase/feedback_summary.sql`; proof in `supabase/feedback_summary_test.sql`). Closes when ADR-005 condition 3 reads clean on the live database | The developer | Yes, until it closes: before staff logins are made |

## 11. How this maps to the rest of the docs

Every service and plan, adopted or declined: docs/PLATFORM.md. Who holds each account and
every secret: docs/HANDOVER.md. The AI agents and whose key each runs on: docs/AGENTS.md.
How the automation builds, ships and watches, and why each limit exists:
docs/LOOP_ENGINEERING.md and docs/SLACK_AUTOPILOT.md. Dev and production:
docs/ENVIRONMENTS.md. SQL scripts and run order: docs/SUPABASE_SETUP.md and
`supabase/run-order.txt`. Build state and sign-off: docs/STATUS.md and docs/VERIFICATION.md.
The rules every change follows: CLAUDE.md and `.claude/skills/robinsons-store/SKILL.md`;
the design system: `.claude/skills/robinsons-store/references/design-tokens.md`.

**Basis: 116 claims checked this session (2026-10-24), 108 confirmed, 8 killed, 42 sources.**
Opened: the SQL in `supabase/` (schema, payments_v2, order_invoice_fields, credit_notes,
edit_delete, auth_setup, run-order), all nine route files, five `src/lib` helpers, the
capture, overdue and vendor pages, `vercel.json`, nine workflow files and the classifier,
`.claude/settings.json`, CLAUDE.md, the robinsons-store skill, and docs PLATFORM, AGENTS,
HANDOVER, ENVIRONMENTS, LOOP_ENGINEERING, STATUS, README and the owner infrastructure note;
the eight killed are the six stale statements this rewrite replaces, the old diagram's upload
after the database writes, and tier A self-merge in the live Slack loop. Added the same day
by a later session: 1 claim checked, 1 confirmed, the Montreal region (ARCH-01), from a live
curl of the health route.
Amended 2026-10-24 by ADR-002: section 6 and ARCH-10 re-read against the changed workflow and
script, 6 claims checked, 6 confirmed. Source: this repository. Added 2026-10-25 by the ARCH-03 session: 19 claims checked, 19 confirmed, 0
killed, 3 sources (this repository, the local test databases and PostgREST runs cited in
section 7, and docs/adr/ADR-003-money-by-role-at-the-database.md); line references into
`supabase/auth_setup.sql` in sections 5 and 7 were re-read after section 3e moved them. Added
2026-10-25 by the ARCH-04 session: 9 claims checked, 9 confirmed, 0 killed, 3 sources (this
repository, the local test databases with the Supabase storage service cited in section 7, and
docs/adr/ADR-004-stored-files-by-store-and-role.md); the owner's choice stays `[D]` until Ravi
Kiran confirms it, and the references into `supabase/auth_setup.sql` after section 3d were
re-read and moved up ten lines. Added 2026-10-25 by the ADR-005 session: 12 claims checked, 12
confirmed, 0 killed, 3 sources (this repository, the local test databases with PostgREST and the
storage service cited in section 7, and
docs/adr/ADR-005-screenshot-descriptions-follow-the-screenshot.md); four references into the
screenshot reader route and the Suggestions page that had drifted were re-read and moved.
Amended 2026-10-30 on branch claude/feedback-summary-follow-up: the screenshot-description lines
in sections 5, 7 and 8 and ARCH-15 re-read against `supabase/auth_setup.sql` section 3g and the
screenshot reader route, 8 references opened at the named lines, 8 confirmed; the live apply read
with `gh run list` the same day.

**Basis, 2026-10-30 target context, AI enablement and colour key:** every `[R]` in the two new
tables opened at the named lines on this branch; the autopilot switch read live with
`gh variable list`. Slack questions and automatic filing are recorded as the developer's
stated direction with no design behind them [J-open: none designed].

**Basis, 2026-10-30 AI view and standards map:** every `[R]` in section 8 opened at the named
lines against main 3a90f50: `src/lib/anthropic.ts`, `src/lib/aiUsage.ts`, the extract, ask,
reorder and alerts routes, `supabase/ai_call.sql`, docs/AGENTS.md and the standards reference.
The standard names in the map are titles only; no conformance to any of them is claimed
[J-open: none audited].

**Basis, 2026-10-30 correction: 43 claims checked against main 4dfc97c, 32 confirmed, 11
killed, 26 sources.** An edge-by-edge audit of the six diagrams found arrows the code does not
back; each correction here was re-read in the code before it was written. Killed: the health
watchdog drawn as calling the database, every route querying as the caller, one mandatory
capture path, `edit_payment` leading to partially paid, five mandatory parent links that are
nullable foreign keys, "one or more invoices" per payment, the deploy triggering the watchdog,
the status card reaching "live" on its own, every API route needing a session, every route
applying the money rule, and every read filtering by store. Five stale line references were
also corrected (the confidence trigger, three `purchase_order` lines, the import service role).
Opened: `.github/workflows/` migrate, rls-audit, slack-autopilot, post-deploy-watch,
slack-lifecycle; `.github/scripts/` health-check and slack-lifecycle-stage; the extract, ask,
reorder, feedback-triage, import, alerts, health and admin users routes; `src/lib/` serverMember,
docs, auth and anthropic; the capture and vendor pages; `supabase/` schema, payments_v2, edit_delete and run-order.txt; and
`src/lib/importBookingsV2.ts`. All six diagrams rendered without error in Mermaid 10.9.1
[V-run, mermaid.render on each block in a browser, 2026-10-30].

**Basis, 2026-10-30 review job: 7 claims checked, 7 confirmed, 0 killed, 4 sources.** Section
6 redrawn on branch claude/slack-autopilot-review. Confirmed: the request channel variable is
unset and every sweep that day stopped at the gate (`gh variable list`, `gh secret list`, run
logs); the bot token and Anthropic key are set; the review job's checkout, permissions, layout
and reviewer tools, and the merge condition (workflow read at the cited lines); the decision
rules (42 script tests); the layout step on this branch's own diff (agent files removed, file
list written, git ignores the folder); the CI start limited to tiers A and B. Killed earlier
the same day: the Slack request row's BUILT, now PARTIAL. Sources: this repository, GitHub
CLI, Actions run logs, a local dry run.

**Basis, 2026-10-30 build job commit-only: 7 claims checked, 7 confirmed, 0 killed, 2 sources.**
Section 6 and its rows re-pointed on branch claude/autopilot-build-job-commit-only. Confirmed:
four jobs, with the Slack token only in find and ship and the build job holding the Anthropic
key and a read-only token (workflow parsed with js-yaml, secrets listed per job); the bundle
round trip and the guard, including renames and a commit built on an older base (`autopilot-change.test.mjs` against real repositories); the push
and the pull request in ship only, past the guard (`slack-autopilot.test.mjs`); every `[R]`
in this section opened at its line. Sources: this repository, local test runs. Not verified:
a real run.

**Basis, 2026-10-30 PR #86: 5 claims checked, 5 confirmed, 0 killed, 4 sources.**
Confirmed: the Slack intake configuration gate; the separate CI gates; promotion only when
a person starts it; the recorded dev preview and pending automatic dev migrations. Sources:
`.github/workflows/slack-autopilot.yml:105-121`, `.github/workflows/ci.yml:28-44`,
`.github/workflows/promote.yml:24-25,84-113`, and `docs/ENVIRONMENTS.md:19-39,54-56,75`.
