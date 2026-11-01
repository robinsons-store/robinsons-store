# Agents: the ones inside the app, and the ones that help build it

Status: ACCEPTED as a register, 2026-10-24. Owner: the developer. Approver: Ravi Kiran.

**There are two kinds of agent here and they run on different keys.** Four AI features run
inside the app for the store's staff, on the store's Anthropic key held in Vercel. The build
side has one autonomous agent (the Slack autopilot, on the same key held in GitHub), two
read-only reviewer agents and a set of skills used by Claude Code sessions, and a script, not
a model, that decides how far any change may travel. After the handover (docs/HANDOVER.md)
every one of them runs on accounts the store owns.

Evidence tags as in `.claude/skills/robinsons-store/references/standards.md`. States: BUILT (exists,
evidenced), PARTIAL, SCAFFOLDED (built, switched off), TARGET (not built).

## Inside the app (used by store staff)

All four call the Anthropic Messages API directly with `ANTHROPIC_API_KEY`, default model
`claude-sonnet-5`, overridable with `ANTHROPIC_MODEL`. None sets a temperature, deliberately:
current Claude models reject non-default sampling settings [R `src/app/api/extract/route.ts:103`].

| Agent | What it does for the store | Where | Guardrails | State |
|---|---|---|---|---|
| **Invoice reader** | Reads an invoice photo or PDF into vendor, date, line items and confidence per line | `/api/extract` [R `src/app/api/extract/route.ts:80`] | Signed-in member resolved first [R `:69`]; strict JSON contract; low-confidence dollar lines cannot save until a person fixes or confirms them [R `RUNBOOK.md:105-107`]; a refusal tells staff to enter it by hand [R `:124`] | BUILT |
| **Ask the store** | Answers questions from the store's own notes, vendors and invoices, with citations; also logs "log this issue: ..." straight into Suggestions | `/api/ask` [R `src/app/api/ask/route.ts:39`] | Dollar data withheld from roles that cannot see money [R `:36`, `:91`]; issue logging is deterministic, verbatim, attributed and only for signed-in members [R `:95-96`]; answer stripped to plain text [R `:166`] | BUILT |
| **Reorder summary** | Turns the formula-based reorder list into a short plain-language summary | `/api/reorder` [R `src/app/api/reorder/route.ts:23`] | Money roles only once login is enforced [R `:33`]; plain text [R `:110`] | BUILT |
| **Suggestion screenshot reader** | Describes a screenshot attached to an owner suggestion, so the developer digest carries it as text | `/api/feedback-triage` [R `src/app/api/feedback-triage/route.ts:30`] | Under 120 words, plain text, no dollar amounts, pay or personal details copied [R `:21-26`, `:82`]; runs as the caller and saves to `feedback_summary`, which opens only to lead, manager, owner and whoever attached the screenshot [R `:85-91`] [R `supabase/auth_setup.sql:675-710`] (ADR-005); best-effort, never blocks saving the suggestion [R `:14-19`] | BUILT |
| Ask the store over a vector index | Same answers, at a data size one prompt cannot hold | Not built | | TARGET (deferred until the data outgrows one prompt [R `docs/ARCHITECTURE.md:279`]) |
| Email invoice intake | Vendors email invoices to invoices@, the reader files them | AgentMail installed, not wired [R `docs/PLATFORM.md`] | Sender allowlist (design in docs/DOMAIN_EMAIL.md section 4) | SCAFFOLDED (blocked on the invoices@ mailbox) |

**Who pays and who can switch it off:** the store's Anthropic organization; the key is due
to be reissued under it (docs/HANDOVER.md, A-02). Removing `ANTHROPIC_API_KEY` from Vercel turns all four off; the app still
builds and the capture screen still offers Enter manually.

## Building the app (used by whoever develops it)

| Agent or control | What it does | Where | Runs on | State |
|---|---|---|---|---|
| **Slack autopilot** | Turns a request in the Slack requests channel into a draft pull request: reads the channel, builds the change, has it reviewed, opens the PR, labels it with its tier, reports back in the thread; merges only tier A, and only while `AUTOMERGE_TIER_A` is `true` (ADR-002). The model builds in a job that cannot push and holds no Slack token; it hands its commit over as a bundle, and ship pushes it unless it touches `.github/` or `.claude/` | `.github/workflows/slack-autopilot.yml`, using `anthropics/claude-code-action@v1` [R `:195-197`] with `--model claude-sonnet-5`, tools limited to Bash, Read, Write, Edit, Glob, Grep, at most 60 turns [R `:211`]; the build job's token can only read [R `:175-176`]; the bundle [R `:265-292`]; the guard and the base-commit check, read by `.github/scripts/autopilot-change.mjs` | GitHub Actions; the build job holds `ANTHROPIC_API_KEY` only; `SLACK_BOT_TOKEN` is held by the find and ship jobs, never on the runner the model builds on | PARTIAL: switched on 2026-10-30; the first request was found and carded, and its build stopped because the Anthropic account behind the key is out of credit [V-run, Actions run 41127237310]. Idle sweeps cost no model tokens (docs/SLACK_AUTOPILOT.md) |
| **Autopilot review job** | Between build and ship, on a fresh runner at the workflow's own commit: reads the build's commit from its bundle and lays it out as data with agent instruction files removed, runs money-reviewer and invariant-auditor as two separate model runs without the Slack text; no verdict counts as not passed. The pull request opens only after it; verdicts on the pull request, reports in the Slack thread; a finding stops tier A merging itself | `.github/workflows/slack-autopilot.yml` [R `:308-427`], decided by `.github/scripts/autopilot-review.mjs` | GitHub Actions; `ANTHROPIC_API_KEY`; `claude-sonnet-5`, Read, Grep, Glob only, at most 30 turns each [R `:367`, `:397`]; job token read-only [R `:313-314`] | BUILT, not yet run on a live request (script tests 42/42) |
| **Slack lifecycle** | Keeps the status card under a Slack request current: ready to review, checks passed or failed, merged, live on the store's site; no model | `.github/workflows/slack-lifecycle.yml` [R `:3-4`] | GitHub Actions; `SLACK_BOT_TOKEN` | BUILT |
| **Tier classifier** | A script, not a model, that reads the diff and decides how far a change may go: prose files merge themselves; app changes wait for a person; money, access, database, configuration and automation changes, and every agent instruction file at any depth (this register included, by its name), never merge on their own | `.github/scripts/classify-change.mjs` [R `:8-11`, `:25-79`], tested by `classify-change.test.mjs` in CI [R `.github/workflows/ci.yml:93`] | Called by the Slack autopilot, in a separate job on a fresh runner, on every change it builds, before the pull request opens [R `.github/workflows/slack-autopilot.yml:462-519`], and by the parked Jira autopilot | PARTIAL: rules tested (110 cases); the label step has not yet run on a live request |
| **Tier A self-merge** | Merges a words-only Slack pull request after both reviewers passed and CI passes on its exact head commit; anything unexpected leaves it for a person | `.github/workflows/slack-autopilot.yml` [R `:536-584`] | GitHub Actions; `GITHUB_TOKEN` | SCAFFOLDED, switch is the repository variable `AUTOMERGE_TIER_A` = `true` (ADR-002 conditions 2 to 4) |
| **Health watchdog** | Calls the live app's `/api/health` on a schedule and posts to Slack when the answer changes; no model | `.github/workflows/post-deploy-watch.yml` | GitHub Actions; `CRON_SECRET`, `SLACK_WEBHOOK_URL`; checks `PRODUCTION_URL` or falls back to the vercel.app address [R `:54`] | BUILT |
| **money-reviewer** | Read-only reviewer for anything touching amounts, HST, freight, payments or invoice status | `.claude/agents/money-reviewer.md` | Claude Code sessions, and every Slack autopilot change before its pull request opens; tools Read, Grep, Glob only | BUILT |
| **invariant-auditor** | Read-only check against store scoping, money visibility, soft voids, audit rows, RLS on new tables, blank-env build | `.claude/agents/invariant-auditor.md` | Claude Code sessions, and every Slack autopilot change before its pull request opens; tools Read, Grep, Glob only | BUILT |
| **Typecheck stop hook** | Refuses to end a Claude Code turn while TypeScript is broken; fails open if it cannot run | `.claude/hooks/gate-typecheck.sh` [R `:2`], wired in `.claude/settings.json` | Claude Code sessions | BUILT |
| **Skills** | `robinsons-store` (domain, invariants, playbooks, and the documentation and review standard in `references/standards.md`), `supabase` and `supabase-postgres-best-practices` (vendor guidance), `vercel-react-best-practices` (React and Next.js performance guidance, pinned in `skills-lock.json` [R skills-lock.json:16,20]) | `.claude/skills/` and `.agents/skills/`; `robinsons-store` lives only in `.claude/skills/` | Claude Code, Codex and other agents; precedence follows root AGENTS.md | BUILT |
| **Jira autopilot** | The board-driven version of the Slack autopilot | `.github/workflows/jira-autopilot.yml` | Parked since 2026-08-12; tests still run in CI | SCAFFOLDED |
| **Golden-case evals** | Sends 24 made-up invoices and questions through the real invoice reader and Ask routes and scores the answers by fixed rules, with a pass rate per case | `scripts/aievals-check`, run with `npm run eval:ai` [R `package.json:11`] | The developer's machine, on whatever `ANTHROPIC_API_KEY` is in `.env.local` or the shell; exits at once in CI [R `scripts/aievals-check/live.ts:55`]. Its scorer tests use no model and are a step in `.github/workflows/ci.yml` | PARTIAL (built and checked offline; not yet run against the model) |

**What the build agents can never do on their own:** merge money, access, database or
automation changes (tier C), run `auth_setup.sql`, or promote to production; promotion is a
person running the promotion workflow (docs/LOOP_ENGINEERING.md, docs/ENVIRONMENTS.md).

**Still to do:** the Slack autopilot's `ANTHROPIC_API_KEY` and `SLACK_BOT_TOKEN` are
reissued under the store (docs/HANDOVER.md, A-02). The repository already lives at
`robinsons-store/robinsons-store`, where the Claude GitHub app reaches it. A new developer uses their own Claude account; nothing in this
table needs their personal key.

## Open items

| ID | Item | Owner | Blocking? |
|---|---|---|---|
| AG-01 | `CLAUDE.md` said AI routes run at "low temperature"; none sets one, deliberately. Corrected in the same change as this file | The developer | No (fixed) |
| AG-02 | No spend limit is recorded for the Anthropic key | Ravi Kiran (HANDOVER A-07) | No |
| AG-03 | Email intake waits on the invoices@ mailbox | Ravi Kiran | Yes, for that agent only |

## How this maps to the rest of the docs

How changes travel and why each limit exists: docs/LOOP_ENGINEERING.md. The Slack request
loop in detail: docs/SLACK_AUTOPILOT.md. Whose account each key belongs to:
docs/HANDOVER.md. The rules every agent works under: CLAUDE.md and
`.claude/skills/robinsons-store/SKILL.md`.

**Basis: 24 claims checked this session (2026-10-24), 23 confirmed, 1 killed, 1 source.**
Each `[R]` above was read from the named file and line in this repository this session, plus
the subagent and settings files read whole. One stale rule found and corrected (AG-01); one state killed on review: the tier classifier was first recorded as BUILT and is PARTIAL, because only the parked Jira loop calls it.
Amended 2026-10-24 by ADR-002: the classifier and tier A rows re-read against the changed workflow and script, 5 claims checked, 5 confirmed. Amended again the same day when the classifier moved to its own job and its rules widened: the Slack autopilot, classifier and tier A rows re-read, 6 claims checked, 6 confirmed.
Source: this repository.
The Golden-case evals row was added on branch ai-golden-evals (2026-10-24): 2 claims, both
read at the named lines that session.
The screenshot reader row was updated on branch claude/arch-04-feedback-summary (2026-10-25,
ADR-005): 5 claims, each read at the named lines that session. Its two moved references were
re-read on branch claude/feedback-summary-follow-up (2026-10-30).
The autopilot review job, 2026-10-30, branch claude/slack-autopilot-review: 7 claims checked,
6 confirmed, 1 killed. Killed: the Slack autopilot row's BUILT, now PARTIAL, because the
request channel variable is unset and no sweep has passed its first step. Confirmed: the
review job's lines, tools, read-only token and merge condition; both reviewers now run on
every autopilot pull request; every line reference in the four rows re-read. Sources: this
repository, `gh variable list`, `gh secret list`, Actions run logs.
The build job made commit-only, 2026-10-30, branch claude/autopilot-build-job-commit-only: 5
claims checked, 5 confirmed. Confirmed: the build job holds only `ANTHROPIC_API_KEY` and a
read-only token, the Slack token only find and ship (workflow parsed, secrets listed per job);
the reviewers and the classifier read the build's bundle before the pull request opens; every
line reference in the six rows re-read. Source: this repository.
**Basis (skills row): 3 claims checked this session (2026-10-30), 3 confirmed, 0 killed,
4 sources.** The React skill exists in both skill directories, its source is pinned in
skills-lock.json, and precedence is defined in root AGENTS.md.
