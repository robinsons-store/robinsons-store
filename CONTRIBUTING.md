# Contributing and standards

Status: PROPOSED, 2026-10-30. Owner: the developer. Approver: Ravi Kiran.

**Work on a branch, open a draft pull request, keep CI green, update docs/STATUS.md and
docs/VERIFICATION.md in the same pull request, and let a person merge.** The rules every
change follows are in CLAUDE.md and `.claude/skills/robinsons-store/SKILL.md`; this file is
how to work day to day.

## Run it

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase and Anthropic values (RUNBOOK.md).
   Point it at the dev project, never the live one (docs/ENVIRONMENTS.md).
3. `npm run dev`, then open http://localhost:3000.

The app must build with blank env, so nothing may depend on env at build time.

## The gates

Run these before every pull request; CI runs the same and more [R `.github/workflows/ci.yml:36-42`]:

```
npm run lint
npx tsc --noEmit
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run build
```

CI then runs the checks that pin behaviour, each without a model or a key:

| Step | What it pins | Run it yourself |
|---|---|---|
| Module checks | Every `scripts/*-check/run.sh`, in name order | `for f in scripts/*-check/run.sh; do bash "$f"; done` |
| Extraction, Ask grounding, AI eval scorers, AI usage cap, import and export | The invoice reader's values, that Ask names only vendors it was given, the golden-case scorers, the daily AI cap, schedule names and export paging | The commands under each step in `.github/workflows/ci.yml` |
| Automation rules | The tier classifier, the database guard, the watchdog, the Slack scripts, the parked Jira scripts, and that `supabase/run-order.txt` never names a seed file | `for f in .github/scripts/*.test.mjs; do node "$f"; done` |

A new check adds its own `run.sh` (contract in `scripts/vendorfields-check/README.md`) or its own
`.test.mjs`, and needs no edit to `ci.yml`. The live AI evals spend the API key and run only by
hand: `npm run eval:ai`.

## Branches and pull requests

- Never push to `main`: a repository ruleset accepts changes there only through a pull request
  (docs/ARCHITECTURE.md section 6).
- The documented path for app changes is a pull request into `develop`, checked on the dev site,
  then a person runs Actions, Promote develop to production (docs/ENVIRONMENTS.md). A change
  merged straight to `main` needs a `main` to `develop` pull request after it.
- CI starts by itself on every pull request into `main` or `develop` and every push to either
  [R `.github/workflows/ci.yml:3-7`]. Merge only once that run is green. The promotion pull
  request is opened with the workflow's own token, which may start no CI (ADR-002, context
  item 3), so the promotion starts CI on the exact commit itself and merges only after it
  passes (docs/ENVIRONMENTS.md).
- Open pull requests as drafts. Commit messages are short imperative sentences.
- Name the reviewers the change needs before the work, from the table in
  `.claude/skills/robinsons-store/references/standards.md`: `money-reviewer` for amounts and
  status, `invariant-auditor` for tables, queries, screens and routes, a security read for
  login, roles and secrets.
- Anything under `.github/`, `.claude/` or `supabase/`, every agent instruction file, and
  `docs/adr/` is tier C: the automation never merges it, a person does
  (docs/LOOP_ENGINEERING.md section 3).
- A new table goes in `schema.sql`, in `auth_setup.sql` section 3a and in a migration for live
  databases (CLAUDE.md, hard rules). The migration is a script in `supabase/` named in
  `supabase/run-order.txt`, which is the only list the migrate workflow applies
  (docs/SUPABASE_SETUP.md).

## Coding conventions

- Database identifiers are snake_case. Application code follows the existing TypeScript style;
  prefer typed Supabase rows over `any` in new code.
- Every write records who and when: an `activity_log` row, and `created_by` where the table has
  it, from `useEffectiveActor()`, never a raw dropdown id.
- Every store-scoped screen reads through `useActiveStore()` and filters by the active
  `store_id`; every insert stamps it.
- Money is `numeric` dollars and stays that way; integer cents is not planned (decided
  2026-10-24, docs/ARCHITECTURE.md ARCH-09). Format with `formatCAD()`; compare dates with
  `todayISO()`, `daysOverdue()` and `dueBand()` from `src/lib/format.ts`.
- Hide cost and margin from the `staff` role with `canSeeMoney(role)`. Retail prices are not
  hidden.
- Payments move only through the engine functions in `src/lib/payments.ts`.
- Color carries meaning: the tokens in `src/app/globals.css` and the `.chip-*` classes, one
  meaning per hue, never status by color alone. Labels above fields, WCAG AA.

## Writing rules (comments, UI copy, commits, docs)

- No em dashes. No AI buzzwords (significantly, dramatically, meaningful, comprehensive,
  noticeably).
- Never invent or inflate store numbers. Use real values from the bookings sheet,
  docs/DATA_SOURCES.md or the owner, and mark illustrative seed data as illustrative.
- Every document follows `.claude/skills/robinsons-store/references/standards.md`: a status line,
  the answer first, an evidence tag on every claim, BUILT, PARTIAL, SCAFFOLDED or TARGET on
  every capability, and a basis footer. Add or retire a file and docs/README.md changes in the
  same pull request.
- Never write personal references (personal emails, personal account names, employers) into the
  repository. Store identities are fine.

## Before real staff use

Follow the release checklist in [docs/STATUS.md](docs/STATUS.md#gates-before-the-product-is-real-in-order)
before real staff use. Related release items are tracked privately.

## How this maps to the rest of the docs

Rules: CLAUDE.md and the robinsons-store skill. Architecture: docs/ARCHITECTURE.md. Setup and
go-live: RUNBOOK.md and docs/SUPABASE_SETUP.md. Dev and production: docs/ENVIRONMENTS.md. Why
the automation is limited the way it is: docs/LOOP_ENGINEERING.md. Every doc: docs/README.md.

**Basis: 15 claims checked this session (2026-10-30), 12 confirmed, 3 killed, 1 source.**
Killed by a refutation read from a separate session and corrected above: that the documented
`develop` path keeps CI green by itself (CI does not start on it), that a blank env shows a
Connection card on every screen, and that a new table needs only `auth_setup.sql` beside the
script (CLAUDE.md names three places).
Read from this repository: the CI steps and loops in `.github/workflows/ci.yml`; the
`eval:ai` and `typecheck` scripts in `package.json`; the `run.sh` contract pointer; the main
ruleset and tier rules in docs/ARCHITECTURE.md section 6 and docs/LOOP_ENGINEERING.md section
3; the develop path in docs/ENVIRONMENTS.md; ARCH-03, ARCH-09 and A-01; the conventions in
the skill. The automation tests were run: all eight `.github/scripts/*.test.mjs` passed
[V-run, 2026-10-30]. Source: this repository.
Updated the same day when CI was turned on for `develop`: the branches paragraph now reads
`ci.yml:3-7` [R] and the promotion's merge step [R `.github/workflows/promote.yml:107-194`].
