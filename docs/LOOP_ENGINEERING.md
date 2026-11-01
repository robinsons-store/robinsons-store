# Loop engineering: how this project builds and ships itself

The design behind the automation, and the reasoning for each limit. Written 2026-07-28 when
the owner asked to automate the whole flow: a request lands, the work gets built, the change
deploys, and a bug we introduced gets caught without anyone watching.

The short version: **an agent in a loop is only as reliable as the thing it checks itself
against.** Everything below is either a loop or a check, and the checks are code, not
instructions. An instruction in a prompt is a suggestion the model can talk itself out of. A
script reading the diff is not.

## What a loop actually is

An agent is a model using tools in a loop: gather context, take an action, verify the
result, repeat. Each tool result is ground truth for the next step. The interesting
engineering is not in the model, it is in two things:

1. **What enters the context**, because accuracy decays as a context fills with noise. This
   is why the project rules live in CLAUDE.md and a skill rather than in whoever's memory,
   why searching is delegated to subagents that return a conclusion instead of a file dump,
   and why each automated run does one thing and then exits.
2. **What the loop checks itself against**, because a model asked "is this right?" will
   usually say yes. The checks here are the three gates, the health endpoint, and the tier
   classifier. None of them involve asking a model to grade its own homework.

## The five loops

### 1. Intake: a request becomes work

**Parked 2026-08-12, not deleted.** This is `.github/workflows/jira-autopilot.yml`, which
read the Jira board every 15 minutes and handed the oldest waiting ticket to a build. The
workflow and its scripts are still in the repo with the schedule commented out, so a future
board can wake it up without rebuilding it, and CI still runs its tests so it cannot rot
while it sleeps.

It is parked because of what it cost, though not for the reason first recorded here. Its
model step was gated behind having found a ticket, so a quiet board started no model and
cost no tokens. What it did do was run `actions/checkout` and `npm ci` on every one of its 96
daily sweeps BEFORE checking whether there was anything to check: about a minute each, near
2,880 Actions minutes a month against a 2,000-minute allowance. The loop spent its budget
getting ready to discover there was nothing to do.

That distinction is the whole design lesson, and it is why the Slack loop that replaces it
asks the cheap question first. See docs/SLACK_AUTOPILOT.md. An intake loop is only worth its price when requests actually arrive through it, and the
owner's requests arrive by phone and by WhatsApp, are relayed by the developer, and never
touched the board at all.

Intake is now `.github/workflows/slack-autopilot.yml`: somebody types a request in the store's
Slack channel and it becomes a draft pull request, with a reply in the thread under their own
message. State lives in reactions on the message (none, then eyes, then a tick), so the queue
is readable by anyone scrolling the channel.

### 2. Build: implement, then prove it

The build runs the three gates (`tsc --noEmit`, blank-env `npm run build`, `npm run lint`)
and does not proceed while any is red. This is the evaluator-optimizer pattern with the
compiler as the evaluator: the model generates, the toolchain judges, and the judgement is
not negotiable.

Locally the same rule is enforced by a **Stop hook** (`.claude/hooks/gate-typecheck.sh`):
a session cannot end with TypeScript broken. The hook fails open on anything unexpected,
because a hook that wrongly blocks every turn gets disabled, and a disabled hook enforces
nothing.

### 3. Ship: how far a change travels on its own

This is the part that needed the most care, and the design principle is a split:

> **The model writes the code. A script decides whether it merges.**

`.github/scripts/classify-change.mjs` reads the actual diff and returns a tier. Nothing in
a ticket, a prompt, or the model's own reasoning can move it.

| Tier | What it is | What happens |
|---|---|---|
| **A** | Words only: `.md` and `.txt` files under `docs/` and `.md` files at the root, plain text, 300 lines or fewer. | Merges itself once CI passes on that exact commit, and deploys. Only while `AUTOMERGE_TIER_A` is `true`. |
| **B** | Anything else in the app, including the in-app guide (it is TypeScript), and scripts, HTML pages, images, links or binary files under `docs/`. | Draft pull request. A person merges. **The default.** |
| **C** | Money, access, the database, or the automation's own files and instructions. | Nothing merges. Labelled and left for a person. |

Tier C deserves its list spelled out: `supabase/**`, `src/lib/payments.ts`, the auth and
edit helpers, `src/app/api/**`, `package.json`, and critically **`.github/**`, `.claude/**`,
`.agents/**`, every agent instruction file by name at any depth (`CLAUDE.md`, `AGENTS.md`,
`docs/AGENTS.md` included, `GEMINI.md`, `SKILL.md` and the like), this file and `docs/adr/`**,
plus any `.sql`, manifest or configuration file wherever it sits. CLAUDE.md is the one that
looks like words and is not: the autopilot reads it first on every run, so a "documentation"
change to it rewrites the next run's rules (ADR-002).

**How the Slack loop applies it** (ADR-002, since 2026-10-24; the build job made commit-only
on 2026-10-30). The model builds in a job that holds the Anthropic key and a read-only token
and nothing else. It cannot push; its commit leaves the runner as a git bundle. A later job
on a fresh runner checks out the workflow's own commit, fetches the bundle as data, refuses
any change to `.github/` or `.claude/` (a file moved out of them included) and any commit not
built on the base commit read before the build, runs the classifier on that commit against the base
the run chose, pushes the branch, opens the draft pull request, labels it `tier-a`, `tier-b`
or `tier-c`, and comments the reason. Nothing the model left on its runner reaches that job.
For tier A, and only while the repository variable `AUTOMERGE_TIER_A` is `true`, it starts CI
on that commit itself, waits for it, reads the pull request again, and merges with the head
commit pinned. It starts CI itself because the pull request was opened with `GITHUB_TOKEN`,
and an event made with that token starts no workflow. Anything unexpected leaves the pull
request open for a person; the step fails closed and never fails the run. Rules tested in
`.github/scripts/classify-change.test.mjs`, which CI runs.

**Promotion to `main` merges the same way** (since 2026-10-30). `promote.yml` opens the
`develop` to `main` pull request with `GITHUB_TOKEN` too, so it starts CI on that pull
request's head commit itself, waits, reads the pull request again, and merges with the head
commit pinned. It first requires `develop` to hold everything on `main`, then confirms that
`main` is still at its recorded commit immediately before merging. Anything unexpected leaves
the pull request open and fails the run, because a person started it and is waiting to see
production change. After the
merge it starts CI on `main`, for the watchdog, and Apply database scripts when `supabase/`
changed, since a merge made with that token may start neither. Promotion merges immediately
after these checks pass
[R `.github/workflows/promote.yml:119-187`]. CI itself starts on pull requests into
`develop` and pushes to it exactly as on `main` [R `.github/workflows/ci.yml:3-7`].

**The runner the model builds on holds nothing worth taking.** The builder has a shell, and
on GitHub's runners that shell has `sudo`. Anything it leaves behind (a background process,
a line in `$GITHUB_ENV` or `$GITHUB_PATH`, a git hook, a gitignored settings file) runs with
every later step in the same job and can read what those steps hold. Moving a script to a
safe copy does not help when the step that runs it is still on that runner. So the Slack loop
splits by runner, not by step: the Slack token lives in the job before the build and the job
after it, the reviewers and every script that judges the change run on fresh runners, and
the build job's only product is the commit. `.github/scripts/slack-autopilot.test.mjs`
fails if any of that moves back.

That last exclusion is the one people forget. **A loop that can edit its own limits does not
have limits, and a loop that can edit its own reviewer has no reviewer.** The automation is
not allowed to modify the automation. Changing what the autopilot may do requires a human
merging a pull request, every time.

**`main` takes changes only through pull requests.** A repository ruleset on `main` requires
a pull request for every change and blocks force pushes and deletion, so the Slack loop,
`promote.yml` and a person at a terminal all reach production the same way. It requires no
approvals and no status checks: the tier classifier decides what may merge, and
`docs/CAPABILITIES.md` item 9 says why a required check waits.

### 4. Watch: catching what we broke

`.github/workflows/post-deploy-watch.yml` runs when CI completes on main, every two hours,
and by hand [R `.github/workflows/post-deploy-watch.yml:16-28`]. It runs after CI, not after
the deploy, so it does not confirm which commit is live (docs/ARCHITECTURE.md section 6). It
asks the live site `/api/health`, which is answered by the app itself and checks the things a
green build cannot see:

- The deployed app and the deployed **database agree on what an invoice owes**. It asks the
  database what a tax-included invoice of 113 with 13 of embedded HST owes, and compares
  that with what `invoiceTotal()` says. A migration that was never run, or a money rule
  changed on one side only, fails right here.
- The payments engine functions are installed.
- The columns this release needs exist.
- **No invoice is showing a status its own payments do not support.** This is the drift
  detector, and it is the one that catches a genuinely broken money change: if the total is
  wrong, statuses stop matching their allocations.

A failure posts to Slack and fails its own run, so it is visible in two places at once.
Until 2026-08-12 it raised a bug on the Jira board that the intake loop then picked up, which
is what made this a loop rather than a pipeline. With intake retired the last step is a
person reading the message. That is the honest description: the machine still finds the
problem within minutes, and a human now starts the fix.

**And it stands down what it raises.** When the site is well again it says so, once. That
half was missing until 2026-08-09 and its absence was not cosmetic: SCRUM-12 stayed open
through its own recovery, and an alarm that goes on saying the site is broken is one where
the next real incident arrives as noise people have learned to scroll past. Raising is the
easy half of monitoring.

The state that used to live in the ticket now comes from this workflow's own run history, one
API call, no model. One deliberate loss in the swap, recorded in `health-notify.mjs`: the
Jira version spoke up again when the list of failing checks CHANGED mid-outage, and this one
does not, because a run's history says pass or fail and not what failed.

It never reports a dollar figure, so the endpoint is safe to call from anywhere.

### 5. Refine

Since the board was parked on 2026-08-12 there is no single queue, and this section says
where each kind of input lands instead. The owner's asks arrive by phone and WhatsApp, are
recorded verbatim in docs/OWNER_NOTES.md and triaged into docs/REQUIREMENTS.md, which is the
list of what is agreed. Feedback typed in the app lands on the Suggestions screen (the
`feedback` table). Watchdog, migration and RLS audit results land in Slack. Work is asked for
in the Slack requests channel. A person reads all four; nothing joins them automatically.

## Why not just let it merge everything

Because of the exposure, not the capability. The useful frame is: **private data, external
action, untrusted input: pick at most two without a human.**

This system has private data (the store's vendors and payments) and untrusted input (Slack
request text, which anyone in the channel can write, and before it ticket text, both of which
the model reads as instructions). That is two. Adding unrestricted external action (merging and deploying
whatever it likes) makes three, and three is where an instruction hidden in a ticket
becomes a deployed change to how the store pays people.

So external action is not off, it is **bounded to a tier where the blast radius is words**.
Tier A can merge because the worst outcome is wrong wording, which is visible, harmless, and
one revert away. Everything that can move money stops for a person. That is not caution for
its own sake; it is the specific reason the automation is allowed to run unattended at all.

The prompt also tells the model to treat instructions embedded in ticket text as text to
ignore rather than orders to follow. That is worth saying, but it is the weak layer. The
tier classifier is the strong one, because it does not read the request.

## What is deliberately NOT automated

- **Merging anything that touches money, access, or the schema.** Tier C.
- **Deciding a database migration.** Writing or approving one is human work: `supabase/**`
  is tier C and never auto-merges. Since 2026-07-31 the APPLYING is automated
  (`.github/workflows/migrate.yml`, on push to main only, from the explicit list in
  `supabase/run-order.txt`), which is a different thing. A person still reads the SQL and
  merges it; the machine only stops them from having to paste it into a web editor
  afterwards. `auth_setup.sql` is excluded, because running it while enforced login is off
  would lock everyone out of a working store.
- **Reverting automatically.** The watchdog raises a bug and fails the run; it does not roll
  production back on its own. An automatic revert during a real incident can undo the fix
  someone is mid-way through applying.
- **Acting on more than one ticket per run.** A bad run affects one ticket, and the next run
  starts clean.

## The specialists

`.claude/agents/` holds two read-only reviewers with narrow tools:

- **money-reviewer** knows the ways this codebase has actually broken before: a select that
  forgets `tax_mode`, an inline amount-plus-freight-plus-HST that bypasses `invoiceTotal`,
  SQL and TypeScript changed on one side only.
- **invariant-auditor** checks store scoping, money gating, soft voids, attributed audit
  rows, and the blank-env build.

Both have `tools: Read, Grep, Glob` and no write access at all. That is config, not
instruction: they cannot edit even if asked to.

Since 2026-10-30 the Slack autopilot runs both on every change it builds, before the pull
request opens, in a review job between the build and ship (docs/SLACK_AUTOPILOT.md, "What reads the work before you see
it"). Four choices there follow from the rules above. They run on a fresh runner, because the
builder had a shell on its own. Their instructions come from the workflow's own commit and
the change's agent instruction files are removed from what they read, because a loop that can
edit its reviewer has no reviewer. They never see the Slack request, so text typed in Slack
cannot argue with them. And they decide only one thing, which is to stop: a finding, or no
verdict at all, keeps tier A from merging itself. They never let anything through. A model
asked "is this right?" usually says yes, so a pass adds nothing to what the tier and the CI
run already allow, and a person still merges tier B and C.

## Borrowed skills

`vercel-react-best-practices` from `vercel-labs/agent-skills` supplies general React and
Next.js performance guidance. It is vendored in `.claude/skills/` and `.agents/skills/`,
pinned in `skills-lock.json` [R skills-lock.json:16,20]. Follow root AGENTS.md for precedence.

`.agents/skills/` also holds two skills installed from Supabase's official `supabase/agent-skills`
repository on 2026-08-09, pinned by content hash in `skills-lock.json` and symlinked into
`.claude/skills/` so Claude Code picks them up:

- **supabase-postgres-best-practices** covers schema design, migrations, RLS policies and
  their tests, indexes, and diagnosing slow queries or rows visible to the wrong tenant.
- **supabase** covers the client libraries, auth and session handling, and the CLI.

They earn their place here specifically because this repository's recurring failures have all
been database ones: a migration nobody ran, a policy that scoped a table but not its children,
a money rule changed on one side only. That is exactly the ground the first skill covers.

They were read before being committed, because a skill runs with the agent's permissions.
Both are documentation only: 208K of markdown, no scripts of any kind, nothing executable.
Re-check that after any update, because it is the property that makes them safe to keep.

The Supabase MCP server is configured separately, in `.mcp.json`, and it is read-only and
limited to two tool groups: `docs` (searching Supabase's documentation) and `debugging` (the
project's logs and its security and performance advisors). `read_only=true` runs any SQL as
a read-only Postgres user and hides every tool that writes; the `features` list leaves the
database, development, functions, branching and account groups off, so it does not query
the store's tables. It needs an interactive sign-in, so a headless run cannot use it.

CI holds it there: `.github/scripts/distinct-databases.test.mjs` reads `.mcp.json` and fails
if a hosted Supabase URL drops `read_only=true`, has no `features` list (the server would
then turn on its defaults, database included), or gives production any group beyond those
two. The file is kept rather than deleted because the vendored `supabase` skill writes a new
one with no parameters when it finds none, and that one would fail the same check. These
skills make the agent better at writing SQL a person still applies; the MCP server reads
documentation, logs and advisors.

## How these standards travel (and why they are not a plugin)

The question came up on 2026-07-31: should the store's standards be packaged as a Claude
Code plugin so other people get them?

**For anyone working in this repo, they already do, and no plugin is involved.** Everything
in `.claude/` is project-scoped and loads for whoever opens the repo: the skill, the two
reviewer subagents, the permission deny rules, and the Stop hook. That is verified, not
assumed: creating `.claude/agents/money-reviewer.md` made `money-reviewer` available as a
subagent in the same session, with no install step and no restart.

So a plugin would add nothing for the case that was actually asked about. What a plugin is
for is the OTHER case: using these standards in a different repo.

If that is ever wanted, the mechanism to use is a **skills-directory plugin**: a folder
under a skills directory containing its own `.claude-plugin/plugin.json` loads as a plugin
with no marketplace and no install, and can be copied into another project's `.claude/skills/`
to travel. It needs the skill and the agents restructured into the plugin folder's own
`skills/` and `agents/` subdirectories, and plugin-shipped agents may not use `hooks`,
`mcpServers`, or `permissionMode`, so the Stop hook and the deny rules stay project-level
either way.

That restructure is deliberately NOT done here. It would move working, verified
configuration to gain sharing that nobody has asked for yet, and it cannot be verified from
the build sandbox: whether the manifest actually loads can only be seen in a real session.
Breaking the thing that works today, to enable a thing nobody needs yet, on a change nobody
can test, is a bad trade. When a second project genuinely wants these standards, do it then,
and check it loads before trusting it.

## Costs

A Slack sweep with no new request stops after a checkout and before `npm ci` and any model
call [R `.github/workflows/slack-autopilot.yml:9-10, 101-137`]. A real request costs roughly what one build conversation
costs. The sweep runs twice an hour, at minutes 13 and 43
[R `.github/workflows/slack-autopilot.yml:56-57`]; that is the polling interval, not the run
rate.

## What would make this better

Honest list, in the order I would do them:

1. **A revert path for tier A.** If a words-only change ever does break something, the
   watchdog currently posts to Slack. For tier A specifically, an automatic revert is
   defensible, because the change was words.
2. **Runtime error signal.** The health endpoint checks correctness, not crashes. Wiring the
   Vercel runtime errors API in would catch the class of bug that only appears under real
   use.
3. **A staging database.** Today a migration is verified by running it on production and
   watching the health check. That works because the store is small and the scripts are
   idempotent, but it is the weakest link in the chain. The dev database that closes it
   exists since 2026-10-30 (docs/ENVIRONMENTS.md); scripts run there first only once the
   `SUPABASE_DB_URL_DEV` secret is set, so this stays open until then.
4. **Screenshot verification.** The gates prove it compiles, not that it looks right. A
   Playwright pass over the key screens would close that gap.

## How this maps to the rest of the docs

docs/AGENTS.md registers the skills used by each agent. Root AGENTS.md defines precedence.

**Basis (React skill): 3 claims checked this session (2026-10-30), 3 confirmed, 0 killed,
4 sources.** The skill's two copies, skills-lock.json and root AGENTS.md were read locally.
