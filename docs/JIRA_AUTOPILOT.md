# Jira autopilot: a ticket becomes a deployed change

> **PARKED since 2026-08-12. It does not run on its own.** The workflow, its scripts and
> this page are all kept whole so a future Jira account can pick it up without rebuilding
> anything. It was parked, not deleted, because it swept a board the owner never wrote to 96
> times a day, not because the design was wrong.
>
> Corrected 2026-08-13: that cost was first written down as "96 model runs a day", which was
> wrong. The model step below is gated behind having found a ticket, so an empty board
> started no model. The waste was Actions minutes, because the sweep ran checkout and
> `npm ci` before checking: about 2,880 minutes a month against a 2,000-minute allowance.
> If this is ever woken up, move the find-work step above the install first, the way
> `.github/workflows/slack-autopilot.yml` does.
>
> **To wake it up:** uncomment the two schedule lines in
> `.github/workflows/jira-autopilot.yml`, then set the four secrets listed there. Without
> those secrets it exits quietly, so uncommenting alone cannot start it spending. It can
> also be run by hand from the Actions tab at any time, which is the safe way to try it
> against a new account: one ticket, one run, nothing on a timer.
>
> Everything below describes it as it behaves when awake.

The loop the owner asked for on 2026-07-28: he types what he wants into a Jira ticket, and
the work gets built, checked, and put in front of a person to merge, without anyone
starting a chat session.

## The loop

1. Ravi writes a ticket, or comments on one, on the connected board
   (robinsonsgenerastore.atlassian.net, projects SCRUM and RGS).
2. Within about 15 minutes, `.github/workflows/jira-autopilot.yml` wakes up and picks the
   oldest ticket that is not Done and is not already waiting on a person.
3. It reads CLAUDE.md and the project skill first, so the store's rules (store scoping,
   money fails closed, payments only through the engine, soft voids, blank-env build)
   apply to anything it writes.
4. It implements the ticket on a branch, runs the three gates, updates the docs, and opens
   a DRAFT pull request.
5. It writes a plain-words comment back on the ticket: what was built and that a pull
   request is waiting, or why the ticket needs a person.
6. Vercel builds the preview from the pull request as usual. A person merges, and the
   merge deploys to production.

The reasoning behind every limit below, and the shape of the whole system, is in
docs/LOOP_ENGINEERING.md. This page is the operating manual; that one is the design.

## How far a change travels on its own

The model writes the code. A script (`.github/scripts/classify-change.mjs`) reads the
resulting diff and decides whether it may merge. Nothing in a ticket or a prompt can move
that decision, because the script never reads either.

| Tier | What it is | What happens |
|---|---|---|
| A | Words only: `.md` and `.txt` under `docs/`, root `.md`, 300 lines or fewer (ADR-002) | Merges itself once checks pass, and deploys |
| B | Anything else in the app | Draft pull request, a person merges. The default |
| C | Money, access, the database, or the automation's own files | Nothing merges |

Tier C covers `supabase/**`, `src/lib/payments.ts`, the auth and edit helpers,
`src/app/api/**`, `package.json`, and `.github/**` and `.claude/**`. The automation is not
allowed to edit the automation: a loop that can change its own limits does not have any.

## What it will not do

The point of a loop like this is that it can run unattended. That only stays true if the
things it refuses to do are the right ones.

- It merges only wording. Anything that touches the app ends at a draft pull request, and
  production changes when a person says so.
- It stops and asks on anything touching the payments engine or its RPCs, auth or RLS, or
  anything that deletes data. Those get a comment, not a commit. A wrong guess about money
  costs the store real money, so guessing is not allowed there. The tier classifier enforces
  this on the diff even if the model talks itself past the instruction.
- It cannot change its own rules. Its workflows, scripts, and the project settings are
  tier C, so altering what the autopilot may do takes a person merging a pull request.
- It ignores instructions written inside ticket text that try to change its process or its
  permissions. Ticket text is a request for work. Anyone who can comment on the board can
  write anything in it, so it is treated as input, never as orders.
- It works one ticket per run. A run that goes wrong affects one ticket, and the next run
  starts clean.
- It never writes secrets into the repository, a pull request, or a Jira comment.

## Turning it on

The workflow is merged and inert. It exits quietly on every run until these four secrets
exist under Settings, Secrets and variables, Actions:

| Secret | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | The key that already powers Capture, Ask, and Reorder. |
| `JIRA_BASE_URL` | `https://robinsonsgenerastore.atlassian.net` |
| `JIRA_USER_EMAIL` | The Atlassian account the ticket comments should come from. |
| `JIRA_API_TOKEN` | From id.atlassian.com, Security, API tokens. |

Add them, then run it once by hand: Actions, Jira autopilot, Run workflow. Leave the
ticket box blank to sweep the board, or type a key like `SCRUM-12` to make it work that
one ticket. Watch that first run before leaving it on a schedule.

## How it decides a ticket is new

It marks its own comments with `[autopilot]`. A ticket whose newest comment carries that
marker is waiting on a person and gets skipped, so the loop never works the same ticket
twice in a row. Replying on the ticket puts it back in the queue: that is the way to ask
for another pass.

**Closed tickets count too, and this was learned the hard way.** The first version asked
Jira only for tickets that were not Done, which quietly broke the promise in the paragraph
above: the owner left five follow-up comments on a story that had just been closed, and
thirty-one green sweeps went straight past them over two days. A closed ticket somebody is
still talking on is open work, whatever its status says.

So a closed ticket is picked up when the newest comment landed more than a minute after the
ticket was closed. The minute matters: the ordinary way a ticket gets closed is a note
saying what was done, then the transition a moment later, and on this board that gap has
been as little as nine seconds. Without the window, whether a finished ticket reopened
itself would depend on which of those two clicks landed first. A genuine follow-up arrives
hours or days later, so a minute costs nothing.

That rule is tested against the board's real timestamps in
`.github/scripts/jira-find-work.test.mjs`, which CI runs on every push.

## Cost

One run costs roughly what one build chat costs, and only when there is something to work.
Runs with an empty board stop before any model call. Fifteen minutes is the polling
interval, not the run rate.

## A run that does nothing is not automatically a healthy run

The first live run went green and did nothing, and the reason was in the log: Atlassian had
removed the old search endpoint and was answering 410 Gone. An empty board and a broken
setup looked identical from the outside.

The script now fails the run on any bad response from Jira, so a configuration problem
turns the run red instead of passing quietly. A network blip still exits cleanly, because
turning red every fifteen minutes over a transient hiccup would train everyone to ignore
it. If a run is green and says "Nothing new on the board", that sentence is now real.

## When something looks wrong

Every ticket comment links to its run. The run log shows the gates, the diff, and the pull
request. If the autopilot did something unwanted, close its pull request: nothing reached
production, because nothing merges without a person.

To stop it entirely, disable the workflow under Actions, or delete the `ANTHROPIC_API_KEY`
secret and it goes inert again.
