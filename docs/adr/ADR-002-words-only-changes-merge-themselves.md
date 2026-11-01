# ADR-002: Words-only changes from the Slack loop merge themselves; everything else waits for a person

| Field | Value |
|---|---|
| Status | PROPOSED, 2026-10-24 |
| Proposer | The build automation (a Claude Code session working for the developer) |
| Deciders | The developer (approver; chose this option over retiring tier A, 2026-10-24) |
| Technical owner | The developer |
| Supersedes | Nothing. Amends docs/LOOP_ENGINEERING.md section 3 to match the code |

## Context

docs/LOOP_ENGINEERING.md section 3 says a words-only change (tier A) merges itself once its
checks pass. Before this change nothing did that:

- The tier classifier was called only by the Jira autopilot
  [R `.github/workflows/jira-autopilot.yml:184`], which has been parked since 2026-08-12.
- The live Slack autopilot always opened a draft pull request and stopped
  [R `.github/workflows/slack-autopilot.yml:23` on main].
- docs/AGENTS.md and docs/ARCHITECTURE.md section 6 recorded the classifier as PARTIAL for this
  reason, and ARCHITECTURE kept it open as ARCH-10.

Wiring the classifier in as written would have opened three holes:

1. **`CLAUDE.md` counted as words.** The words-only rule `^[^/]+\.md$` matches it and nothing
   blocked it [V-run, regex tested in node, 2026-10-24: `true`]. The autopilot reads CLAUDE.md
   first on every run [R `.github/workflows/slack-autopilot.yml:162`], so a Slack message could
   have had the loop rewrite its own rules and merge that unattended. The same holds for
   `.agents/skills/`, which is symlinked into `.claude/skills/` [V-run, `ls -la .claude/skills`,
   2026-10-24].
2. **The in-app guide counted as words** [R `.github/scripts/classify-change.mjs:42` on main],
   but it is TypeScript, so a diff to it can carry code.
3. **CI may never run on these pull requests.** The autopilot opens them with `GITHUB_TOKEN`
   [R `.github/workflows/slack-autopilot.yml:141` on main], and GitHub starts no workflow for an
   event made with that token, except `workflow_dispatch` and `repository_dispatch` [J-open:
   GitHub's documentation could not be reached from the build sandbox. Kill condition: a
   `claude/slack-*` pull request whose checks list a `pull_request` CI run]. "Merge once CI is
   green" would then wait forever, or, with `--auto` and no required checks, land at once.

There is no `develop` branch [V-run, `git ls-remote --heads origin`, 2026-10-24: main and two
`claude/` branches], so a tier A merge lands on main and is live on the store's site within
minutes. Update 2026-10-30: `develop` now exists [V-run, `git ls-remote --heads origin`,
2026-10-30], and the Slack loop opens its pull requests against `develop` whenever it does
[R `.github/workflows/slack-autopilot.yml:140-148`], so a tier A merge now lands on the dev
site, and reaches the store's site only when `develop` is promoted to main.

Not deciding has a specific failure: the documents promise one loop, the code runs another,
and the next person to wake the Jira loop gets an unattended merge path nobody has reviewed in
two months.

## Decision

1. **The Slack loop classifies every pull request it opens, in a job of its own.** After the
   build job ends, a second job on a fresh runner checks out the workflow's own commit, finds
   the one open pull request from this repository's `claude/slack-*` branch (never a fork's),
   reads its head commit and its base, and runs `classify-change.mjs` on that commit against
   that base [R `.github/workflows/slack-autopilot.yml:197-257`]. It runs nothing from the
   pull request, so nothing the model left on the build runner reaches the decision. A pull
   request whose base is not the one the run chose is tier C. The build job's token can push
   and open pull requests and nothing more [R `.github/workflows/slack-autopilot.yml:68-79`],
   and it expires when that job ends [V-src, docs.github.com GITHUB_TOKEN concepts page,
   2026-10-24]. Update 2026-10-30: the build job's token can now only read, and it holds no
   Slack token. The model's commit leaves as a git bundle; ship reads it on its fresh runner,
   refuses any change to `.github/` or `.claude/`, classifies it, then pushes the branch and
   opens the pull request itself, after the review job (docs/SLACK_AUTOPILOT.md). The rulings
   below are unchanged; line references in this record are to the workflow as it was then.
2. **Every Slack pull request carries its tier.** It gets a `tier-a`, `tier-b` or `tier-c`
   label and a one-line comment saying why [R `.github/workflows/slack-autopilot.yml:259-282`].
   The label is for people. The merge never reads it. The step calls GitHub's REST label and
   comment endpoints, which GitHub lists under the pull requests permission for installation
   tokens, so the workflow asks for no issues permission [V-src, docs.github.com "Permissions
   required for GitHub Apps", 2026-10-24].
3. **Only tier A merges itself, and only like this** [R `.github/workflows/slack-autopilot.yml:284-343`]:
   CI is started with `workflow_dispatch` on the exact head commit and waited for; immediately
   before merging, the pull request is read again and must still be open, on that commit and
   aimed at the base it was judged against; the merge is pinned with `--match-head-commit`;
   anything unexpected (CI never starts, fails, times out, the pull request changed, branch
   protection refuses) leaves the pull request open for a person and does not fail the run.
   `--auto` is not used.
4. **It is off until switched on.** The merge step runs only while the repository variable
   `AUTOMERGE_TIER_A` is `true` [R `.github/workflows/slack-autopilot.yml:299`]. Unset, every
   pull request is labelled and waits for a person, as before.
5. **Instructions are never words.** Agent instruction files are tier C by name, at any depth
   and in any case: `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `AGENT.md`, `GEMINI.md`,
   `SKILL.md`, `copilot-instructions.md`, `.cursorrules`, `.windsurfrules`, `.clinerules` and
   `.mcp.json`, and anything under a `.claude/`, `.agents/`, `.kiro/`, `.cursor/`, `.windsurf/`
   or `.clinerules/` folder. That includes `docs/AGENTS.md`: it is this project's register of
   agents, but its name makes it instructions to every tool that follows the AGENTS.md
   convention. `skills-lock.json`, `docs/LOOP_ENGINEERING.md` and `docs/adr/` are tier C too,
   as is every other doc CLAUDE.md tells an agent to read before building (`ONBOARDING.md`,
   and `docs/` README, REQUIREMENTS, PLATFORM, HANDOVER, OWNER_NOTES, SUPABASE_SETUP and
   ENVIRONMENTS), except `docs/STATUS.md` and `docs/VERIFICATION.md`, which every pull
   request updates; a test reads that list from CLAUDE.md itself. So is any `.sql` file and
   any manifest or configuration file (`.yml`, `.yaml`, `.json`, `.toml`, `.ini`, `.env`
   files, `.npmrc`) wherever it sits. Every tier C rule ignores case.
   A file name with a control character is tier C, and is kept out of the reason, which the
   script writes to the job's outputs one value per line, the tier last
   [R `.github/scripts/classify-change.mjs:25-68`, `:85-101`, `:150-181`].
6. **Words means prose files.** Only `.md` and `.txt` files under `docs/` and `.md` files at
   the root count as words. Scripts, HTML pages and images under `docs/` are tier B, as is the
   in-app guide (TypeScript). A file git reports as binary, a link, a submodule or a file with
   the executable bit is never words, whatever its name: git counts a binary file as zero
   lines, so the line limit could not see its size
   [R `.github/scripts/classify-change.mjs:70-79`, `:120-148`].
7. **The rules are tested.** `classify-change.test.mjs` pins 110 cases across all tiers,
   including every rule above and the parsing of git's output, and runs in CI
   [V-run, `node .github/scripts/classify-change.test.mjs`, 2026-10-30: 110 passed, 0 failed]
   [R `.github/workflows/ci.yml:93`].

## Conditions

1. A person merges this change. It touches `.github/`, which is tier C, and the classifier
   says so of this branch [V-run, `node .github/scripts/classify-change.mjs origin/main HEAD`,
   2026-10-24: tier C].
2. Before setting `AUTOMERGE_TIER_A`, the developer confirms in Settings, Actions, General that
   Actions may create pull requests (the loop already needs this) and that workflow
   permissions allow read and write. Approving pull requests is not needed: nothing here
   approves.
3. Main takes changes only through a pull request, with no required approvals and no required
   status checks [V-run, `gh api` on ruleset 25802611 of the repository before its move,
   2026-10-25], so tier A merging its own pull request is allowed. If approvals are ever
   required, tier A cannot merge and fails closed. Either accept that (labels only) or exempt
   the Actions bot. That is the developer's call [Q: the developer].
4. The first live tier A request is watched end to end: CI starts, the pull request merges,
   the card says merged, and the watchdog runs. Until then the merge path is SCAFFOLDED.
5. Before the Jira autopilot is ever woken, its own merge step
   [R `.github/workflows/jira-autopilot.yml:186-199`], which uses `--auto`, is replaced with
   the Slack loop's.

## Consequences

Accepted costs:

- A tier A run holds its runner while CI runs, about as long as one CI run, and holds the
  autopilot's queue for that time. Tier A requests are rare, so the monthly cost is small.
- A merge made with `GITHUB_TOKEN` starts no CI on main by itself, so the step asks for one;
  if that dispatch does not wake the post-deploy watch [J-open: kill condition, the first
  tier A merge shows no watch run within ten minutes], the two-hourly schedule still catches
  a bad deploy.
- Wording changes reach the live site with nobody reading them first. The worst case is wrong
  wording, one revert away.

Benefits:

- The docs and the automation agree, and ARCH-10 closes.
- Every Slack pull request shows its blast radius on its face before anyone opens the diff.
- Two holes are closed whether or not tier A is ever switched on: the loop can no longer
  classify its own instructions as words, and the in-app guide can no longer carry code
  through the words tier.

## Alternatives considered

- **Retire tier A; every change waits for a person.** Rejected by the developer in favour of
  this option. It was the proposer's first recommendation: it needs no settings, and
  words-only requests from the store are rare.
- **`gh pr merge --auto` as the Jira loop does.** Rejected: on a branch with no required
  checks it does not wait for CI, so it depends on branch protection being set correctly.
- **A separate workflow that merges on the CI `workflow_run` event.** Rejected: whether that
  event fires for a run started by `GITHUB_TOKEN` could not be verified, and a merge that
  depends on an unverified event can stall silently.
- **Open the pull requests with a personal access token so CI runs normally.** Rejected: the
  token would belong to a person, against ADR-001.

## Related

docs/LOOP_ENGINEERING.md section 3 (the tiers and why), docs/SLACK_AUTOPILOT.md (the request
loop), docs/AGENTS.md (the register), docs/ARCHITECTURE.md section 6 (build and release),
ADR-001 (why no personal token).

**Basis: 11 claims checked this session (2026-10-24), 9 confirmed, 0 killed, 3 sources.**
Confirmed by reading the classifier, the Slack, Jira and CI workflows on main and on this
branch; running the classifier tests, the classifier on this branch, the `CLAUDE.md` regex,
`ls -la .claude/skills` and `git ls-remote`; and reading `gh` 2.89.0's own help for
`--match-head-commit`, `run watch --exit-status`, `run list --event` and `pr ready --undo`.
Two stay `[J-open]` with kill conditions: GitHub's `GITHUB_TOKEN` trigger rule and whether a
dispatched CI run wakes the post-deploy watch. The decision does not rest on either, because
the merge step fails closed when CI does not start. Sources: this repository, the `gh` CLI, git.

**Amended 2026-10-24, before merge: decisions 1, 2, 3, 5 and 7 tightened, decision 6 added.
12 further claims checked, 12 confirmed, 0 killed, 1 source added (GitHub's documentation).**
Condition 3 re-read on 2026-10-25 against the ruleset main gained that day. On 2026-10-30 the
docs CLAUDE.md names as required reading joined tier C (decision 5), checked by a test that
reads CLAUDE.md (110 passed). The same test then caught `docs/ENVIRONMENTS.md`, added to that
list on main, and it joined tier C.
Confirmed by running the classifier tests (110 passed); the classifier on this branch (tier C);
the classifier end to end on a scratch repository (a binary `.md`, an executable `.md` and a
link named `.md` rate B, a `CLAUDE.md` under a folder with a non-ASCII name rates C, an
unreadable commit rates C, and a file name holding a carriage return rates C with clean
output lines); parsing the workflow and `bash -n` on every `run:` block; both
new `jq` filters against live `gh` output; `gh` 2.102.0's help for `api -f key[]=` and the
`pr list` JSON fields; and GitHub's documentation for the label and comment permissions, job
outputs, and the token's lifetime. Not verified: a live run of the two-job workflow.
