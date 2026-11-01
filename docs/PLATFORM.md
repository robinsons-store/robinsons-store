# Platform surface: every service, what it does, and what we deliberately have not adopted

The full inventory of what this app runs on, written so that a person or an AI session
picking this repo up knows the whole surface without guessing: which services are in use,
which plan each one is on, which platform features are adopted, and which are available and
deliberately declined with the reason.

Companion files: docs/ARCHITECTURE.md (the stack and data flow), docs/ENVIRONMENTS.md (dev
and production and how a change crosses), docs/DOMAIN_EMAIL.md (the domain and mailboxes),
docs/REQUIREMENTS.md (what has actually been asked for).

**The rule this file exists to serve.** A capability is adopted when a requirement in the
ledger needs it, not because it is free or new. The budget was set in
robinsons_store_build_spec.md section 8: typical $50 to $100 a month against a $200 ceiling.
Cost has never been the binding constraint on this project. Complexity is, because a
non-technical owner has to rely on this while running a store remotely, and every added
service is one more key, one more failure mode, one more answer to "where does the store's
data live", and one more thing that breaks in August when it matters most.

## Two open risks, both found 2026-08-12

These outrank every feature question below. The accounts now belong to the store
(docs/HANDOVER.md); both risks close only when the store's card is on the paid plan, which
is item A-01 there and not yet confirmed.

### 1. Vercel Hobby does not license this app

The project is on the store's team `robinsons-store1` since 2026-10-25. Its plan is not
readable from the API used here, and the team showed no charges for October [V-run, Vercel
list_billing_charges, 2026-10-30], which is what **Hobby** looks like. Vercel's fair use guidelines
(https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) say:

> Hobby teams are restricted to non-commercial personal use only. All commercial usage of
> the platform requires either a Pro or Enterprise plan.
>
> Commercial usage is defined as any Deployment that is used for the purpose of financial
> gain of anyone involved in any part of the production of the project, including a paid
> employee or consultant writing the code.

Two independent triggers apply, either one sufficient on its own: the store is a business
and this app runs its operations, and anyone paid to write the code counts by itself.

The exposure is not a fine, it is availability. If this is enforced, the app the store
receives stock on stops, and nothing in the design routes around it. **Vercel Pro is $20 per
seat per month.** Also lifts: edge requests 1M to 10M, WAF custom rules 3 to 40, WAF IP
blocks 3 to 100, runtime logs 1 hour to 1 day, plus spend management and deployment password
protection.

### 2. Supabase Free takes no backups

Confirmed at https://supabase.com/docs/guides/platform/backups:

| Plan | Backups |
|---|---|
| Free | **None.** Supabase's own advice is to run `db dump` yourself and keep off-site copies |
| Pro | Last 7 days of daily backups |
| Team | Last 14 days |
| Enterprise | Up to 30 days |

Point-in-time recovery is a paid add-on on top (about $100 a month for 7 days), and enabling
it replaces daily backups rather than adding to them. PITR is overkill at this volume; daily
backups are not.

**The organization was still on Free when last read, 2026-10-30.** So the store's vendors,
invoices, payments, HR records and uploaded invoice images have no automatic backup, against
a six-year Canadian record-keeping requirement. Supabase Pro is $25 a month, on the store's
card as admin@ (docs/HANDOVER.md, A-01).

The app's own Export screen (one workbook, a tab per table) is a real mitigation and worth
running on a schedule regardless, but it is a manual export, not a restore path: it does not
carry the storage bucket, and nobody will remember to run it every week in season.

## In use today

| Service | Does what | Plan | Notes |
|---|---|---|---|
| **Vercel** | Hosts the app, deploys on push, runs the daily cron | **Hobby unless confirmed otherwise, see risk 1** | Team `robinsons-store1`, project `robinsons-store`. Preview deploys per PR, all on the dev database (ENVIRONMENTS.md) |
| **Supabase** | Postgres, Auth, Storage (`documents` bucket) | **Free as of 2026-10-30, see risk 2** | ca-central Toronto. RLS per store per role. Second project `robinsons-store-dev` holds the repository seed data for dev, never the live ledger (ENVIRONMENTS.md) |
| **Anthropic API** | Capture extraction, Ask-the-store, reorder summary, feedback triage | Pay as you go | Stores in the US; what each route sends is in "What leaves Canada" below. Default model claude-sonnet-5. $5 to $40 a month by volume |
| **Resend** | The daily due-date email | Free tier is adequate | Optional. Off unless the keys are set. No Canadian region, see "What leaves Canada" |
| **Vianet** | Domain robinsonsgeneralstore.ca, 5 of 10 mailboxes, store internet | About $10/mo | Domain expires 2026-10-16, auto-renew on. No self-serve DNS editor, changes are a phone call |
| **GitHub** | Code at `robinsons-store/robinsons-store`, and eleven Actions workflows | Free | `ci`, `migrate`, `post-deploy-watch`, `promote`, `rls-audit`, `slack-announce`, `slack-autopilot`, `slack-lifecycle`, `vercel-diagnose`, `vercel-protect`, and `jira-autopilot` (parked) |
| **Slack** | Build requests in, watchdog and migration messages out | Free | Bot app from docs/slack-app-manifest.yml plus an incoming webhook. See docs/SLACK_AUTOPILOT.md |
| **Jira** | Switched off 2026-08-12 | None | The autopilot is parked, not deleted. See docs/JIRA_AUTOPILOT.md |
| **AgentMail** | Inbound programmatic inbox | Marketplace, free tier | Installed 2026-08-12, **not yet wired in**. Chosen mechanism for email invoice intake, see DOMAIN_EMAIL.md section 4 |

### Vercel features adopted

- **Cron Jobs.** One entry in `vercel.json`, the daily 13:00 UTC call to `/api/alerts`.
- **Preview deployments.** Every PR gets one; this is the practice site in ENVIRONMENTS.md.
- **Custom domain.** `app.robinsonsgeneralstore.ca`, live and verified 2026-08-11.
- **DDoS mitigation.** On by default on all plans, nothing to configure.

## What leaves Canada

Checked 2026-10-24 against the code on main and each provider's published terms. The
database and the stored files are in Supabase in Toronto, and the API routes run in Montreal
(ARCHITECTURE.md section 2). Each row says what one flow sends outside Canada, where it goes,
and how long the provider keeps it.

| Route or job | What it sends | Provider | Region | Retention |
|---|---|---|---|---|
| `/api/extract` (Capture) | The invoice photo or PDF, and a fixed reading prompt | Anthropic API | US (a) | 30 days (b) |
| `/api/ask` (Ask the store) | The question as typed. Every knowledge note (department, topic, body, tags), which staff type freely. Every vendor's name, department, terms, status, phone, notes and ordering profile. Each vendor's minimum order, and each non-voided invoice's vendor, invoice total (amount, freight and HST, as `invoiceTotal()` computes it; paid invoices included, nothing subtracted), status, due date and terms: for money roles (lead, manager, owner) when sign-in is on, for every caller when it is off. The app guide text | Anthropic API | US (a) | 30 days (b) |
| `/api/reorder` (Reorder summary) | Every vendor's name, department, status, terms, notes and ordering profile, minimum order included. Every purchase order's vendor, season, amount, ship date and status. Knowledge notes tagged `reorder` (topic, body). Money roles only when sign-in is on | Anthropic API | US (a) | 30 days (b) |
| `/api/feedback-triage` (Suggestions) | The attached screenshot, plus the note and screen name typed with it. The screenshot is whatever was on screen, which can be the HR, pay rate or schedule screen. The Suggestions page warns about this under the picker | Anthropic API | US (a) | 30 days (b) |
| `/api/alerts` (daily due-date email; off until the Resend keys are set) | For each unpaid invoice overdue or due within 7 days: vendor name, invoice number, amount left to pay, due date, store name, with the counts and total owed in the subject. Sent to the `ALERT_EMAIL_TO` addresses | Resend | Account data, email metadata and logs in the US; the sending region is picked when the domain is added, and none is in Canada (c) | 30 days on Free, Pro and Scale (d) |
| `slack-autopilot.yml` (build requests from Slack) | The request text typed in the store's Slack channel, and the repository files the agent reads while building. Sent with the same Anthropic key from a GitHub-hosted runner. The request text also appears in the run log, which is public because the repository is. The build writes a branch, a draft pull request and entries in docs/STATUS.md and docs/VERIFICATION.md into this public repository | Anthropic API, through GitHub Actions on Azure (region not published, e) | US (a) | Anthropic 30 days (b). The public run log 90 days (f). The branch, pull request and ledger entries stay in the repository until someone removes them. The request stays in Slack, which deletes it after one year on Free (g) |

`git grep -n 'callClaude(' src/app/api` lists the four Anthropic routes above; a fifth match
means this table is out of date. Where the `ai_call` usage log is present
(`supabase/ai_call.sql`), its rows sit in the Toronto database and hold the route, model,
token counts, duration and outcome of each call, never the prompt, the store data sent with
it, or the answer.

Sources, read 2026-10-24:

- (a) Anthropic stores API data in the US: workspace geo `us` is the only one offered. Where
  the model runs is a separate setting. The app sends no `inference_geo`, so each call
  follows the workspace's default inference geo, and the API default `global` may run in any
  available geography. https://platform.claude.com/docs/en/manage-claude/data-residency
- (b) Anthropic commercial retention, updated 2026-07-01: inputs and outputs are deleted from
  the backend within 30 days; up to 2 years if flagged under the Usage Policy, with
  classifier scores up to 7 years. This is the default unless a zero data retention agreement
  is signed; none is recorded in this repo.
  https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data.
  Commercial Terms section B, effective 2025-06-17: "Anthropic may not train models on
  Customer Content from Services." https://www.anthropic.com/legal/commercial-terms. Capture's
  structured output caches only the JSON schema, up to 24 hours, and the schema holds no
  store data. https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- (c) Four sending regions (North Virginia, Ireland, Sao Paulo, Tokyo); "All account data,
  including email metadata, logs, and API records, is stored in the United States".
  https://resend.com/docs/dashboard/domains/regions
- (d) Data retention row of the plan comparison. https://resend.com/pricing
- (e) "GitHub hosts Linux and Windows runners on virtual machines in Microsoft Azure", no
  region stated. https://docs.github.com/en/actions/concepts/runners/github-hosted-runners
- (f) The default; a public repository can set 1 to 90 days.
  https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization
- (g) Free plan: 90 days of visible history, content older than a year deleted.
  https://slack.com/help/articles/7050776459923-Pricing-changes-for-the-Pro-plan-and-updates-to-the-Free-plan

**The rule for a new flow.** A change that sends store data to a new provider, or sends a new
kind of data to an existing one, adds or edits its row here in the same pull request, and
updates the data section of docs/owner-notes/store-app-infrastructure.html if the owner's
picture changes.

## Worth adopting, each tied to a real requirement

Ordered by value. None of these is adopted yet.

| Capability | The requirement it serves | Why now |
|---|---|---|
| **Supabase Pro** | Six-year record keeping; the whole ledger | Risk 2. Nothing else on this list matters if the database is lost |
| **Vercel Pro** | Availability of a system the store depends on | Risk 1 |
| **AgentMail wired to intake** | "Email invoice intake", QUEUED in REQUIREMENTS.md | Fills the exact hole DOMAIN_EMAIL.md section 4 left open. Preferred over an IMAP poll because a scoped key cannot read info@ or drygoods@ if it leaks |
| **Vercel WAF rate limit on `/login`** | Auth is enforced and the app is now on a public domain | ADOPTED 2026-08-17: `.github/workflows/vercel-protect.yml` reads and writes the firewall by API (preview and apply modes, idempotent by rule name). Run apply once after any token change |
| **GitHub secret scanning with push protection** | "Keep secrets out of the repo and out of chat" (skill) | Still open, and it is a repo setting no API in this session can flip: GitHub, repo Settings, Advanced Security, enable secret scanning and push protection. Two clicks by the developer |
| **Supabase Advisors** | Invariant 6: a new table needs RLS in schema.sql AND auth_setup.sql | The RLS half is COVERED 2026-08-17 by `.github/workflows/rls-audit.yml`: weekly and on demand, lists public tables with RLS off or empty, tells Slack and goes red. The hosted Advisors page (performance lints and the rest) stays a dashboard visit |
| **Deployment protection on the dev site** | ENVIRONMENTS.md: dev holds seed data, including the curated 2026 bookings rows | Already on: preview addresses require a Vercel login [V-run, get_project `ssoProtection`, 2026-10-30]. A custom `dev.` domain skips it, which is fine while dev data is invented |

## Available, deliberately not adopted

Recorded with reasons so the question does not get reopened every time somebody sees the
sidebar.

| Capability | Why not |
|---|---|
| **Vercel AI Gateway** | Inserts a hop in front of the route that reads dollar amounts off invoices. The skill records a hard-won rule there: sending a `temperature` parameter 400s every AI route, caught in review once already. A layer that can rewrite request params is that bug class waiting to happen, for $5 to $40 a month of spend that is not hurting anyone |
| **Vercel Blob / Storage** | Would split invoice images across two providers and contradict what the owner has been told about Canadian data residency. Supabase Storage already holds them, in Toronto, behind signed URLs |
| **Vercel Workflows** | Cron plus a route handles this volume. Revisit if email intake grows past a few dozen messages a day |
| **Vercel Sandboxes** | No untrusted code to run |
| **Vercel Agent** | The AI work already runs through `src/app/api/*` against the Anthropic API. A second agent layer duplicates it |
| **Vercel Flags** | The dev site plus the promotion workflow already answers "try it before it ships" |
| **Vercel Image Optimization** | Thumbnails come from Supabase signed URLs, which expire; optimizing them is fiddly for little gain on department laptops |
| **Vercel Toolbar comments (browser extension)** | Comments are visible only to signed-in members of the Vercel team, and this plan seats one. The owner would need a paid seat, a Vercel account, and a developer tool to say what the in-app Suggestions page already lets him say in plain words on his phone. The developer can install the extension for personal use any time; that needs no project change |
| **Vercel Connect: Miro, Notion** | Those are the builder's tooling, not the store's app, and nothing in the app connects to either. The one Miro use is the architecture board on the store's own account (docs/HANDOVER.md): a drawing of the diagrams in docs/ARCHITECTURE.md, which stays the source, redrawn from it when it changes |
| **Supabase Edge Functions** | The API routes on Vercel cover it; splitting server code across two runtimes doubles where to look when something breaks |
| **Supabase Realtime** | The notification bell polls on navigation, focus, open and timer. Polling is enough for one store and has fewer states to get wrong |
| **pgvector** | Deferred by design until the store's data outgrows one prompt. Ask-the-store passes context directly today and that works at tens of vendors |
| **Supabase PITR** | About $100 a month, and it replaces daily backups rather than adding to them. Daily backups on Pro are the right tier for this volume |
| **The enterprise stack** | Snowflake, Fabric, Redpanda, MuleSoft, API gateways. Locked out in the build spec section 8. One store, thousands of rows a month |

## How to decide the next one

1. Name the requirement in docs/REQUIREMENTS.md that needs it. If there is not one, stop.
2. Say where the store's data goes and whether that changes what the owner has been told in
   docs/owner-notes/store-app-infrastructure.html.
3. Say what breaks if the service is down or the free tier changes, and whether the store can
   still receive stock that day.
4. Add it here with the reason, adopted or declined.

A free tier on a path the store depends on is not free. It is an unpriced dependency that
can be withdrawn during the season, which is the one time of year it cannot be.
