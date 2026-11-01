# Robinsons General Store, Store Operations Platform

Status: PROPOSED, 2026-10-30. Owner: the developer. Approver: Ravi Kiran.

**A capture-first operations app for Robinson's General Store in Dorset, Ontario: staff photograph
a vendor invoice, Claude reads it into lines with a confidence on each, a person confirms the
uncertain ones, and it posts with author and time. Around that sit the vendor ledger, invoices
and payments, inventory, price signs, maintenance, compliance, HR and an Ask-the-store
assistant, so the owner can run the store remotely from a phone.** To find any document, open
[docs/README.md](docs/README.md).

Private. All rights reserved, not open source. It carries the store's real vendor and
operations data.

## Where it runs

| Piece | What | State |
|---|---|---|
| Site | `app.robinsonsgeneralstore.ca`, Next.js App Router on Vercel, functions in Montreal | BUILT (docs/ARCHITECTURE.md section 2) |
| Data | Supabase Postgres, Auth and Storage in Canada Central (Toronto), row-level security per store | BUILT (docs/ARCHITECTURE.md section 5) |
| AI | Four features on the Anthropic API: invoice reader, Ask the store, reorder summary, screenshot reader | BUILT (docs/AGENTS.md) |
| Dev site | Branch `develop`, its own Supabase project holding seed data, never the live ledger | PARTIAL (docs/ENVIRONMENTS.md) |
| Build loop | Slack request to draft pull request, CI gates, a script that decides what may merge, health watchdog | PARTIAL: the classifier's rules are tested but it has not yet run on a live request; tier A self-merge SCAFFOLDED (docs/ARCHITECTURE.md section 6, docs/AGENTS.md) |

## Start here

| You are | Open first |
|---|---|
| New to the team | [ONBOARDING.md](ONBOARDING.md), then the learning path in [docs/README.md](docs/README.md) |
| Building or reviewing, person or AI session | [CLAUDE.md](CLAUDE.md), then [.claude/skills/robinsons-store/SKILL.md](.claude/skills/robinsons-store/SKILL.md) and its [standards](.claude/skills/robinsons-store/references/standards.md) |
| Asking what is done | [docs/STATUS.md](docs/STATUS.md) and [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) |
| Asking who owns which account or secret | [docs/HANDOVER.md](docs/HANDOVER.md) |
| Setting up a database or going live | [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) and [RUNBOOK.md](RUNBOOK.md) |

## Run it on your machine

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values (RUNBOOK.md lists each one).
   With the file blank the app still builds and starts; it simply has no data.
3. `npm run dev`, then open http://localhost:3000.

A fresh Supabase project needs `supabase/schema.sql` then `supabase/seed.sql` in the SQL
editor; `schema.sql` also creates the `documents` bucket. The full order, including the
scripts that upgrade a live database, is docs/SUPABASE_SETUP.md. Never point a local copy at
the live database; use the dev project (docs/ENVIRONMENTS.md).

## How a change ships

Branch, draft pull request, checks (lint, `tsc --noEmit`, a blank-env build, the module checks
and the automation tests), a person merges. CI starts by itself for pull requests into
`main` or `develop` and for pushes to either branch [R `.github/workflows/ci.yml:3-7`].
`main` accepts changes only through a pull request;
Vercel deploys `main`; merged database scripts apply themselves from `supabase/run-order.txt`.
The details, and why the automation may never merge money, access, database or automation
changes on its own, are in [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/LOOP_ENGINEERING.md](docs/LOOP_ENGINEERING.md).

## How this maps to the rest of the docs

This file only routes. Every fact above has its home in the file it links to, and
[docs/README.md](docs/README.md) indexes them all. The original plan with evidence and
pricing is [robinsons_store_build_spec.md](robinsons_store_build_spec.md), kept for history.

**Basis: 11 claims checked this session (2026-10-30), 9 confirmed, 2 killed, 1 source.** Each
state in the table and each step above was read from the linked file in this repository:
ARCHITECTURE sections 2, 5 and 6, AGENTS, ENVIRONMENTS, SUPABASE_SETUP, RUNBOOK step 2,
`.github/workflows/ci.yml` lines 4 to 7 and `supabase/run-order.txt`. Killed by a refutation
read from a separate session: the build loop marked BUILT (the classifier is PARTIAL), and
"every screen shows a Connection card" with blank env (several screens show none). Source:
this repository.
