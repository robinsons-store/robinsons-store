# The docs, and which one to open

Status: PROPOSED, 2026-10-30. Owner: the developer. Approver: the store owner.

There are too many files to guess at. This is the index: what each one is for, who it is
written for, and how current it is. Start here.

## Start here, by who you are

| You are | Open, in order |
|---|---|
| New to the team | [../ONBOARDING.md](../ONBOARDING.md), then "Learn it one component at a time" below |
| Building or reviewing, person or AI session | [../CLAUDE.md](../CLAUDE.md), the skill and its standards (next section), then "Read first" below |
| The owner | [owner-notes/](owner-notes/), written for the owner rather than for the builder |
| Checking what is done or agreed | [STATUS.md](STATUS.md), [VERIFICATION.md](VERIFICATION.md), [REQUIREMENTS.md](REQUIREMENTS.md) |

## The rules every session loads

| File | What it is |
|---|---|
| [../CLAUDE.md](../CLAUDE.md) | Loads in every Claude Code session: the hard rules and the reading list |
| [../.claude/skills/robinsons-store/SKILL.md](../.claude/skills/robinsons-store/SKILL.md) | The invariants, the locked architecture, the screen map and the debugging playbook |
| [../.claude/skills/robinsons-store/references/standards.md](../.claude/skills/robinsons-store/references/standards.md) | How every document, decision record and review is written and checked |
| [data-model.md](../.claude/skills/robinsons-store/references/data-model.md), [design-tokens.md](../.claude/skills/robinsons-store/references/design-tokens.md) | Database conventions; the colors, status mapping and form rules |
| [../.claude/agents/](../.claude/agents/) | The two read-only reviewers, `money-reviewer` and `invariant-auditor` |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Day to day: the gates, branches, reviewers and writing rules |
| [../README.md](../README.md) | The front door: what the app is and where to start |

## Read first, in this order

| File | For | What it answers |
|---|---|---|
| [REQUIREMENTS.md](REQUIREMENTS.md) | Builder | Product direction, multi-store delivery states and configuration gaps; department fields edited by the owner and readable by managers; every ask with its state: shipped, queued, or waiting on the owner. **If it is not here, it is not agreed.** |
| [STATUS.md](STATUS.md) | Builder | What is built right now, and the before-production checklist |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Builder | The stack, data and capture flows, the develop-to-main release diagram, the AI enablement view, the target context with planned pieces in colour, and the colour key |
| [PLATFORM.md](PLATFORM.md) | Builder | Every service and plan in use, what is adopted, and what is deliberately declined with the reason. **Carries two open risks: the Vercel plan and database backups** |
| [CAPABILITIES.md](CAPABILITIES.md) | Builder | **The standing answer to "should we use X".** All 477 researched capabilities with a verdict each: 83 adopt now, 65 when needed, 329 declined with reasons. Ends with the sequenced build plan |
| [research/](research/) | Builder | The 2026-08-12 catalog of what all seven platforms can do, fetched from the vendors' live docs. Raw reference behind CAPABILITIES.md |

## Operating it

| File | What it answers |
|---|---|
| [AGENTS.md](AGENTS.md) | Every AI agent: the four inside the app for staff, and the ones that build and watch it. What each does, its guardrails, and whose key it runs on |
| [adr/](adr/) | Decision records, one decision each, with the alternatives rejected. ADR-001: the store owns every account. ADR-002: words-only changes from the Slack loop merge themselves. ADR-003: the database keeps dollar figures from staff. ADR-004: stored files open by store and role. ADR-005: a screenshot's AI description opens to the people who may open the screenshot |
| [../ONBOARDING.md](../ONBOARDING.md) | For a new team member: what we need from them, what access they get and why, and their first week |
| [HANDOVER.md](HANDOVER.md) | **What the store owns on each service, every secret and variable the app reads, and what is still open** |
| [ENVIRONMENTS.md](ENVIRONMENTS.md) | Production and the dev site: what each one is, how a change crosses, and the six steps that turn dev on |
| [SUPABASE_SETUP.md](SUPABASE_SETUP.md) | Every SQL script and the exact order to run it, fresh install and live upgrade |
| [../RUNBOOK.md](../RUNBOOK.md) | Go live, and the five-minute "turn on login" cutover |
| [DOMAIN_EMAIL.md](DOMAIN_EMAIL.md) | The domain, the ten mailboxes, and the design for email invoice intake |
| [VERIFICATION.md](VERIFICATION.md) | The per-feature sign-off record |

## Where the work comes from

| File | What it answers |
|---|---|
| [OWNER_NOTES.md](OWNER_NOTES.md) | The owner's feedback verbatim, round by round, Telugu translated. The raw input that REQUIREMENTS.md is triaged from |
| [owner-notes/](owner-notes/) | Documents written **for** the owner rather than for the builder, plus the PDF renderer |
| [LOOP_ENGINEERING.md](LOOP_ENGINEERING.md) | How the repo builds, ships and watches itself, and why each limit exists. **Read before touching `.github/` or `.claude/`** |
| [SLACK_AUTOPILOT.md](SLACK_AUTOPILOT.md) | How a message in the Slack requests channel becomes a draft pull request, what it will not do, and what it costs |
| [JIRA_AUTOPILOT.md](JIRA_AUTOPILOT.md) | The board loop, **parked since 2026-08-12**: kept whole and switched off, with how to wake it |
| [slack-app-manifest.yml](slack-app-manifest.yml) | The Slack bot app's manifest, the source for recreating the app on the store's workspace |

## The store's own data

| File | What it answers |
|---|---|
| [DATA_SOURCES.md](DATA_SOURCES.md) | The Google Drive folder, what each part maps to in the schema, and how to get at the files |
| [DATA_INVENTORY.md](DATA_INVENTORY.md) | The detailed per-file catalog with metadata and sample rows |
| [SYNC_PLAN.md](SYNC_PLAN.md) | The phased plan for syncing with the owner's live sheets |

## History

| File | What it answers |
|---|---|
| [../robinsons_store_build_spec.md](../robinsons_store_build_spec.md) | The original plan with evidence, pricing and citations. Kept for history; where it disagrees with the docs above, the docs above win |

## Learn it one component at a time

Each row is one sitting. Read the doc, open the code it points at, and stop when you can
answer the question in the last column without looking.

| # | Component | Read | Then open | You can now answer |
|---|---|---|---|---|
| 1 | The store and the idea | [../robinsons_store_build_spec.md](../robinsons_store_build_spec.md) sections 1 and 4, the skill's "What this project is" | `src/lib/auth.ts` (the roles and `canSeeMoney`), `src/lib/departments.ts` (the department order) | Who uses the app, the four roles, and why it is capture-first |
| 2 | Where it runs | [ARCHITECTURE.md](ARCHITECTURE.md) sections 1 and 2, [PLATFORM.md](PLATFORM.md) | `vercel.json`, `src/app/api/` | Which services it depends on, why Toronto and Montreal, and the two open plan risks |
| 3 | Data and the store fence | [ARCHITECTURE.md](ARCHITECTURE.md) section 5, the skill's data-model reference | `supabase/schema.sql`, `supabase/auth_setup.sql` | How every row is fenced to a store, and why a new table needs a policy in two places |
| 4 | The capture loop | [ARCHITECTURE.md](ARCHITECTURE.md) section 3 | `src/app/capture/page.tsx`, `src/app/api/extract/route.ts` | How a photo becomes a record, and why a low-confidence dollar line cannot post |
| 5 | The money engine | [ARCHITECTURE.md](ARCHITECTURE.md) section 4 | `supabase/payments_v2.sql`, `src/lib/payments.ts` | Why paid is never typed, what each engine function does, and why two owed rules must agree to the cent |
| 6 | The AI features | [AGENTS.md](AGENTS.md), "Inside the app"; [PLATFORM.md](PLATFORM.md), "What leaves Canada" | `src/lib/anthropic.ts`, `src/lib/aiText.ts`, `supabase/ai_call.sql` | What each feature sends out of Canada, the daily cap, and why no temperature is sent |
| 7 | Login and roles | [ARCHITECTURE.md](ARCHITECTURE.md) section 7, [../RUNBOOK.md](../RUNBOOK.md) "Turn on login" | `src/lib/auth.ts`, `src/lib/serverMember.ts` | Demo mode against enforced mode, `canSeeMoney`, and what ARCH-03 still leaves open |
| 8 | Dev and production | [ENVIRONMENTS.md](ENVIRONMENTS.md) | `.github/workflows/promote.yml`, `.github/scripts/distinct-databases.mjs` | Where a change lands first, what crosses to production, and what never does |
| 9 | The build loop | [LOOP_ENGINEERING.md](LOOP_ENGINEERING.md) sections 1 to 3, [SLACK_AUTOPILOT.md](SLACK_AUTOPILOT.md), [ADR-002](adr/ADR-002-words-only-changes-merge-themselves.md) | `.github/scripts/classify-change.mjs` and its test | How a Slack message becomes a pull request, tiers A, B and C, and why the automation cannot edit the automation |
| 10 | Watching production | [LOOP_ENGINEERING.md](LOOP_ENGINEERING.md) section 4 | `src/app/api/health/route.ts`, `.github/workflows/post-deploy-watch.yml`, `migrate.yml`, `rls-audit.yml` | What the health check proves that a green build cannot |
| 11 | The AI build setup | [../CLAUDE.md](../CLAUDE.md), [LOOP_ENGINEERING.md](LOOP_ENGINEERING.md) "The specialists" and "Borrowed skills" | `.claude/agents/`, `.claude/hooks/gate-typecheck.sh`, `.mcp.json` | What loads for every AI session, what the two reviewers and the stop hook enforce, and why the MCP server is read-only |
| 12 | Docs and decisions | The standards file, [adr/](adr/), [REQUIREMENTS.md](REQUIREMENTS.md), [VERIFICATION.md](VERIFICATION.md) | The basis footer of any doc | How a claim is tagged and checked, and how a decision is recorded |
| 13 | Accounts and secrets | [ADR-001](adr/ADR-001-the-store-owns-every-account.md), [HANDOVER.md](HANDOVER.md) | Nothing; this one is people and plans | Who owns each account, which secrets rotate when someone leaves, and what is still open |

## House rules for these files

- **Date anything that is a snapshot of the outside world**, and re-check it rather than
  reading it. Three records went stale and were caught only by checking: the custom domain
  recorded as blocked when it was live, the vendor ordering columns recorded as missing when
  the health check passed, and the mailbox quota recorded as 250MB when it is 1000MB. The
  last one had the owner on a to-do list to clear mailboxes that were never full.
- **One fact, one home.** If two files would both carry it, one of them links instead.
  `SOURCES.md` was merged into `DATA_SOURCES.md` on 2026-08-12 for exactly this reason.
- **Update in the same pull request as the work.** A doc that lands a week later is a doc
  nobody trusts.
- No em dashes, plain words, and no invented numbers about the store.

## How these docs are written with AI

Most of these files are drafted by Claude Code sessions. Six rules keep them trustworthy, and
each one is in a file or a script rather than in anyone's memory:

1. **The rules load every time.** CLAUDE.md loads automatically in every Claude Code session and
   names the skill and its standards file as required reading before building or writing, so
   the tenth session works to the same rules as the first.
2. **Evidence beside every claim.** `[R path:line]` read from the repo, `[V-run]` checked live,
   `[V-src]` read from vendor docs that session, `[D]` reported and awaiting a named person,
   `[J-open]` believed with a kill condition, `[Q]` an open question with an owner. A decision
   never rests on `[J-open]`.
3. **One state per capability.** BUILT, PARTIAL, SCAFFOLDED (with its switch) or TARGET, and
   present tense only for BUILT.
4. **A count at the bottom.** A document written to the standard ends with a basis footer:
   claims checked, confirmed, killed, sources. The killed number is the point: it shows the
   check found something. A document with no footer is a draft, whatever its status line says;
   on 2026-10-30, 10 of the 27 files at the root, in `docs/` and in `docs/adr/` carry one.
5. **Nothing verdicted by its writer.** A claim-making document gets a refutation read by a
   session that did not write it, and code changes get the read-only reviewer agents. A model
   asked whether its own work is right will usually say yes.
6. **Instructions are not words.** CLAUDE.md, the skill, AGENTS.md, the decision records and
   LOOP_ENGINEERING.md steer the automation, so the tier classifier treats them as tier C and
   only a person merges them (ADR-002).

## How this maps to the rest of the docs

This index gives the reading order. [STATUS.md](STATUS.md) holds the release checklist
[R `docs/STATUS.md:597`]; [VERIFICATION.md](VERIFICATION.md) records per-area sign-off
[R `docs/VERIFICATION.md:16`]. The document format comes from the skill's
[standards](../.claude/skills/robinsons-store/references/standards.md)
[R `.claude/skills/robinsons-store/references/standards.md:10`].

**Basis: 3 claims checked this session (2026-10-30), 3 confirmed, 0 killed, 1 source.**
Checked the release checklist, sign-off table and document format in the repository files
named above. The PR #81 catalogue description follows the review brief; that branch was
not inspected this session. Source: this repository.
