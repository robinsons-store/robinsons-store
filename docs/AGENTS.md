# Agents: the ones inside the app, and the ones that help build it

Status: ACCEPTED as a register, 2026-10-24. Owner: the developer. Approver: Ravi Kiran.

**There are two kinds of agent here and they run on different keys.** Five AI features run
inside the app for the store's staff, on the store's Anthropic key held in Vercel. The build
side has one autonomous agent (the Slack autopilot, on the same key held in GitHub), two
read-only reviewer agents and a set of skills used by Claude Code sessions, and a script, not
a model, that decides how far any change may travel. After the handover (docs/HANDOVER.md)
every one of them runs on accounts the store owns.

Evidence tags as in `.claude/skills/robinsons-store/references/standards.md`. States: BUILT (exists,
evidenced), PARTIAL, SCAFFOLDED (built, switched off), TARGET (not built).

## Inside the app (used by store staff)

All of them call the Anthropic Messages API directly with `ANTHROPIC_API_KEY`, default model
`claude-sonnet-5`, overridable with `ANTHROPIC_MODEL`. None sets a temperature, deliberately:
current Claude models reject non-default sampling settings [R `src/app/api/extract/route.ts:103`].

| Agent | What it does for the store | Where | Guardrails | State |
|---|---|---|---|---|
| **Invoice reader** | Reads an invoice photo or PDF into vendor, date, line items and confidence per line | `/api/extract` [R `src/app/api/extract/route.ts:80`] | Signed-in member resolved first [R `:69`]; strict JSON contract; low-confidence dollar lines cannot save until a person fixes or confirms them [R `RUNBOOK.md:105-107`]; a refusal tells staff to enter it by hand [R `:124`] | BUILT |
| **Ask the store** | Answers questions from the store's own notes, vendors and invoices, with citations; also logs "log this issue: ..." straight into Suggestions | `/api/ask` [R `src/app/api/ask/route.ts:39`] | Dollar data withheld from roles that cannot see money [R `:36`, `:91`]; issue logging is deterministic, verbatim, attributed and only for signed-in members [R `:95-96`]; answer stripped to plain text [R `:166`] | BUILT |
| **Reorder summary** | Turns the formula-based reorder list into a short plain-language summary | `/api/reorder` [R `src/app/api/reorder/route.ts:23`] | Money roles only once login is enforced [R `:33`]; plain text [R `:110`] | BUILT |
| **Suggestion screenshot reader** | Describes a screenshot attached to an owner suggestion, so the developer digest carries it as text | `/api/feedback-triage` [R `src/app/api/feedback-triage/route.ts:12`] | Under 120 words, plain text [R `:21`, `:86`]; best-effort, never blocks saving the suggestion [R `:14`] | BUILT |
| **Ask in Slack** | Answers a question that names the bot in the requests channel, in its thread, from the store's notes and vendors; asks "question or change?" when the words do not say | `/api/slack/events` [R `src/app/api/slack/events/route.ts:15`], `src/lib/slackAsk.ts` | Signed Slack requests only; asker treated as staff: no invoice read, no vendor money column, an answer with a dollar figure withheld; the ask route's grounding check, daily cap and `ai_call` log (route `slack_ask`); question vs build decided by words in `.github/scripts/slack-intent.cjs`, never a model (ADR-006) | BUILT in code, SCAFFOLDED live (needs the Vercel values and Slack event in docs/HANDOVER.md) |
| Ask the store over a vector index | Same answers, at a data size one prompt cannot hold | Not built | | TARGET (deferred until the data outgrows one prompt [R `docs/ARCHITECTURE.md:279`]) |
| Email invoice intake | Vendors email invoices to invoices@, the reader files them | AgentMail installed, not wired [R `docs/PLATFORM.md`] | Sender allowlist (design in docs/DOMAIN_EMAIL.md section 4) | SCAFFOLDED (blocked on the invoices@ mailbox) |

**Who pays and who can switch it off after handover:** the store's Anthropic organization
(HANDOVER Step 5). Removing `ANTHROPIC_API_KEY` from Vercel turns them all off; the app still
builds and the capture screen still offers Enter manually.

## Building the app (used by whoever develops it)

| Agent or control | What it does | Where | Runs on | State |
|---|---|---|---|---|
| **Slack autopilot** | Turns a request in the Slack requests channel into a draft pull request: reads the channel, builds the change, opens the PR, reports back in the thread | `.github/workflows/slack-autopilot.yml`, using `anthropics/claude-code-action@v1` [R `:138`] with `--model claude-sonnet-5`, tools limited to Bash, Read, Write, Edit, Glob, Grep, at most 60 turns [R `:152`] | GitHub Actions; `ANTHROPIC_API_KEY`, `SLACK_BOT_TOKEN` | BUILT. Idle sweeps cost no model tokens (docs/SLACK_AUTOPILOT.md) |
| **Slack lifecycle** | Keeps the status card under a Slack request current: ready to review, checks passed or failed, merged, live on the store's site; no model | `.github/workflows/slack-lifecycle.yml` [R `:3-4`] | GitHub Actions; `SLACK_BOT_TOKEN` | BUILT |
| **Tier classifier** | A script, not a model, that reads the diff and decides how far a change may go: words merge themselves; app changes wait for a person; money, access, database and automation changes never merge on their own | `.github/scripts/classify-change.mjs` [R `:8-12`] | Called only by the parked Jira autopilot [R `.github/workflows/jira-autopilot.yml:184`]; the live Slack autopilot always opens a draft pull request for a person to merge, so nothing self-merges today | PARTIAL |
| **Health watchdog** | Calls the live app's `/api/health` on a schedule and posts to Slack when the answer changes; no model | `.github/workflows/post-deploy-watch.yml` | GitHub Actions; `CRON_SECRET`, `SLACK_WEBHOOK_URL`; checks `PRODUCTION_URL` or falls back to the vercel.app address [R `:54`] | BUILT |
| **money-reviewer** | Read-only reviewer for anything touching amounts, HST, freight, payments or invoice status | `.claude/agents/money-reviewer.md` | Claude Code sessions; tools Read, Grep, Glob only | BUILT |
| **invariant-auditor** | Read-only check against store scoping, money visibility, soft voids, audit rows, RLS on new tables, blank-env build | `.claude/agents/invariant-auditor.md` | Claude Code sessions; tools Read, Grep, Glob only | BUILT |
| **Typecheck stop hook** | Refuses to end a Claude Code turn while TypeScript is broken; fails open if it cannot run | `.claude/hooks/gate-typecheck.sh` [R `:2`], wired in `.claude/settings.json` | Claude Code sessions | BUILT |
| **Skills** | `robinsons-store` (domain, invariants, playbooks, and the documentation and review standard in `references/standards.md`), `supabase` and `supabase-postgres-best-practices` (vendor guidance) | `.claude/skills/` | Claude Code sessions | BUILT |
| **Jira autopilot** | The board-driven version of the Slack autopilot | `.github/workflows/jira-autopilot.yml` | Parked since 2026-08-12; tests still run in CI | SCAFFOLDED |
| **Golden-case evals** | Sends 24 made-up invoices and questions through the real invoice reader and Ask routes and scores the answers by fixed rules, with a pass rate per case | `scripts/aievals-check`, run with `npm run eval:ai` [R `package.json:11`] | The developer's machine, on whatever `ANTHROPIC_API_KEY` is in `.env.local` or the shell; exits at once in CI [R `scripts/aievals-check/live.ts:55`]. Its scorer tests use no model and are a step in `.github/workflows/ci.yml` | PARTIAL (built and checked offline; not yet run against the model) |

**What the build agents can never do on their own:** merge money, access, database or
automation changes (tier C), run `auth_setup.sql`, or promote to production; promotion is a
person running the promotion workflow (docs/LOOP_ENGINEERING.md, docs/ENVIRONMENTS.md).

**What changes at handover:** the Slack autopilot's `ANTHROPIC_API_KEY` and `SLACK_BOT_TOKEN`
are reissued under the store, and the Claude GitHub app is installed on the store's GitHub
organization so the autopilot and future Claude Code sessions can reach the moved repository
(HANDOVER Steps 4 and 5). A new developer uses their own Claude account; nothing in this
table needs their personal key.

## Open items

| ID | Item | Owner | Blocking? |
|---|---|---|---|
| AG-01 | `CLAUDE.md` said AI routes run at "low temperature"; none sets one, deliberately. Corrected in the same change as this file | The developer | No (fixed) |
| AG-02 | No spend limit is recorded for the Anthropic key | Ravi Kiran (HO-03) | No |
| AG-03 | Email intake waits on the invoices@ mailbox | Ravi Kiran | Yes, for that agent only |

## How this maps to the rest of the docs

How changes travel and why each limit exists: docs/LOOP_ENGINEERING.md. The Slack request
loop in detail: docs/SLACK_AUTOPILOT.md. Whose account each key belongs to:
docs/HANDOVER.md. The rules every agent works under: CLAUDE.md and
`.claude/skills/robinsons-store/SKILL.md`.

**Basis: 24 claims checked this session (2026-10-24), 23 confirmed, 1 killed, 1 source.**
Each `[R]` above was read from the named file and line in this repository this session, plus
the subagent and settings files read whole. One stale rule found and corrected (AG-01); one state killed on review: the tier classifier was first recorded as BUILT and is PARTIAL, because only the parked Jira loop calls it.
Source: this repository.
The Ask in Slack row was added on branch claude/slack-answers-2d32e7 (2026-10-30): read at
the named line that session.
The Golden-case evals row was added on branch ai-golden-evals (2026-10-24): 2 claims, both
read at the named lines that session.
