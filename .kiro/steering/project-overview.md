---
inclusion: always
---

# Robinsons General Store - Project Standards

This is the Robinsons General Store operations platform, a capture-first receiving app for a Canadian general store in Dorset, Ontario. The codebase is private and carries real store data.

#[[file:CONTRIBUTING.md]]
#[[file:docs/ARCHITECTURE.md]]

## Locked Architecture (do not change without owner decision)

- Frontend and API: Next.js 14 App Router on Vercel, TypeScript
- Database, auth, storage: Supabase Postgres in ca-central (Toronto), with Auth and Storage
- Document AI: Claude Sonnet vision via Anthropic API (/api/extract route)
- Ask-your-store: /api/ask passes store context to Claude directly
- Not the enterprise stack. No Snowflake, Fabric, Redpanda, MuleSoft, API gateway, or MCP governance at this scale
- Budget ceiling: a couple hundred a month, realistic run 50 to 100

## Key Invariants (breaking any is a regression)

1. Store scoping: every read filters by active store_id; every insert stamps it
2. Money by role: every cost, order amount, invoice amount, payment, premium, and pay figure is behind canSeeMoney(role). Retail prices are not hidden
3. Actor integrity: created_by and activity_log.actor_id come from useEffectiveActor(); the actor dropdown is hidden when REQUIRE_AUTH is on
4. Audit: every meaningful write inserts an activity_log row with a non-null entity_id
5. Human in the loop on dollars: extracted lines carry confidence; low-confidence dollar fields never auto-post; discrepancy needs explicit acknowledgement
6. New table, two places: a new table in schema.sql must also be added to auth_setup.sql or production breaks silently; a table with a dollar figure goes in its section 3e and supabase/money_by_role.sql, never section 3a
7. Build-safe: code must build with blank env. Auth and data helpers degrade to null, never throw

## Writing Rules

- No em dashes anywhere
- No AI buzzwords (significantly, dramatically, meaningful, comprehensive, noticeably)
- Never invent or inflate store numbers. Use only real values from the bookings sheet or the owner
- Commit messages are short imperative sentences
- Lead with the answer, then context. Short and direct
- Mark illustrative seed data as illustrative

## Key Files

- `docs/STATUS.md` - live source of truth for what is built and what remains
- `RUNBOOK.md` - go-live steps and environment variables
- `CONTRIBUTING.md` - coding standards, branches, commits
- `docs/ARCHITECTURE.md` - system diagrams and data flow
- `robinsons_store_build_spec.md` - original plan with evidence
- `supabase/schema.sql` - full data model with dev RLS
- `supabase/auth_setup.sql` - production per-store per-role policies
- `supabase/edit_delete.sql` - edit/delete columns and triggers

## Canada Rules

- Ontario 13% HST default, tax_rules table for portability
- PIPEDA for staff data (HR, employee info)
- Canadian regions preferred for hosting
- Currency CAD, currency input masks
- Keep records six years (CRA requirement)
- Quebec Law 25 only if Quebec-resident personal data is processed

## Auth Model

Two modes via NEXT_PUBLIC_REQUIRE_AUTH:
- Demo mode (default): open access, "Acting as" dropdown picks the actor
- Enforced mode: Supabase Auth session required, AuthGate sends unauthenticated to /login

Identity resolution:
- useAuthUser(): the Supabase Auth user
- useMember(): the app_user row linked by auth_id
- useEffectiveActor(users, actorId): the actor to write with (always signed-in member in enforced mode)
- useCurrentRole(): role for screens without dropdown (defaults to owner in demo)

## Operational Reality

- Database changes are delivered as SQL the owner runs in Supabase SQL editor
- Deploys happen by pushing to the branch (Vercel auto-deploys main)
- The owner is non-technical: lead with one or two things they must do, in order, in plain language
- Keep secrets out of the repo and out of chat
- For live databases with data: deliver targeted, non-destructive SQL (ALTER, single policy, backfill)
- Never tell the owner to re-run schema.sql on a live DB with data worth keeping

## Branches and CI

- Develop on a feature branch, not main. Pushing to main auto-deploys to Vercel
- CI (.github/workflows/ci.yml) runs npm run lint and npm run build on every push and PR
- Keep both green (warnings acceptable, errors are not)
- Node 20 in CI
