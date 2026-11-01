# ADR-006: Questions in Slack are answered in the thread, not built

| Field | Value |
|---|---|
| Status | PROPOSED, 2026-10-30 |
| Proposer | The developer |
| Deciders | The store owner (approver) |
| Technical owner | Whoever holds the Slack app and the Vercel project |
| Supersedes | Nothing. Builds on the Slack autopilot (docs/SLACK_AUTOPILOT.md) |

## Context

The requests channel has one reader: the 30-minute build sweep, which turns any message that
names the bot into a draft pull request [R `.github/scripts/slack-find-work.mjs`]. People also
ask it questions ("when is the candle order due?"), and a question built as a pull request
costs a model run and a reviewer and answers nothing. The app already answers questions
in-app through `/api/ask`, with a grounding check [R `src/lib/askGrounding.ts:256`], prompt
caching, a per-store daily cap and an `ai_call` log [R `src/lib/aiUsage.ts:57`], and money
withheld by role [R `src/app/api/ask/route.ts:34`].

## Decision

Five parts, one decision: a question that names the bot is answered in its thread from the
store's records; build requests keep going to the sweep.

1. **Classification is words, never a model.** `.github/scripts/slack-intent.cjs` decides:
   an `ask:` or `build:` prefix first, then the sentence shape (a question word or a closing
   question mark; an imperative such as "add" or "fix"; "can you add" is a build, "can you
   tell me" a question). Neither, or both, is **unclear** and gets one reply asking the
   person to resend with `ask:` or `build:`. The sweep and the answer route import the same
   file, so they cannot disagree. It sits under `.github/` so it is tier C: a build request
   cannot loosen what gets built [V-run `node .github/scripts/slack-intent.test.mjs`, 40 cases].
2. **Where it runs: Slack's Events API calling a route on the existing Vercel project**
   (`/api/slack/events`). Latency is the model's, typically seconds, against up to 30 minutes
   (plus GitHub's schedule delay) on the sweep. No new service, no new plan: Slack events
   are free and the route is one more function in the project that already serves the app.
   The sweep stays the only builder and skips anything not classified as a build.
3. **Money: the asker is staff.** A Slack channel holds every role and nothing maps a Slack
   user to an app role. The invoice table is never read, vendor money columns are left out
   by the field registry's own `money` flag, and an answer that still carries a dollar
   figure is replaced by a pointer to the app. All three fail closed
   [V-run `scripts/slackask-check`, MONEY cases].
4. **Grounding and cost are the ask route's.** Same `checkVendorGrounding`, same
   `callClaude` with the store as scope, so the daily cap and the `ai_call` log apply, logged
   as route `slack_ask`. The store comes from `SLACK_STORE_ID`, and its name from the `store`
   table; nothing store-specific is in code. Unset or unknown store: a "not set up" reply
   and no model call.
5. **Message text is data.** The question is fenced in `<question>` with the ask route's
   instruction to ignore instructions inside data; model output is escaped so it cannot
   ping the channel or forge a link; only signed requests from Slack are accepted.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Answer inside the 30-minute sweep | Up to 30 minutes for an answer, and the sweep would need the database service key in GitHub |
| Poll every 5 minutes for questions | Still minutes late; GitHub delays scheduled runs; more runner time for no gain over events |
| A model decides question or build | A wrong guess is invisible: a question becomes a pull request, or a request is never built |
| Show money to Slack askers who are managers | No mapping from Slack users to app roles exists; deferred to a later decision |
| A new always-on bot service (Socket Mode) | Needs a host that stays up; this has none and the budget has no line for one |
| Move `/api/ask` onto the new shared builder now | Three open pull requests rewrite that route's context; merging into all three is a conflict, not a fix. Follow-up below |

## Consequences

- Needs four things before it does anything, all listed in docs/HANDOVER.md: the signing
  secret, the bot token in Vercel, the channel and store ids in Vercel, and the Slack app's
  `app_mentions:read` scope with an `app_mention` event subscription. Until then the route
  refuses every request and the sweep simply no longer builds questions.
- A question in a requests-only channel (`SLACK_REQUIRE_MENTION=false`) must still name the
  bot: only a mention reaches the route.
- "log this issue" from Slack is not filed: there is no member to attribute it to.
- `src/lib/slackAsk.ts` repeats the ask route's context lines for the staff case. Once the
  open changes to `/api/ask` land, both should build from one function [J-open: kill when
  `/api/ask` imports the shared builder].
- The service role key reads past the per-role policies, so store scoping is in code; every
  read names the store and the check asserts it.
- `ai_call_begin` must be callable by the service role on the live database [J-open: kill
  when the first live answer writes an `ai_call` row with route `slack_ask`].

## Related

docs/SLACK_AUTOPILOT.md (how to ask, setup), docs/AGENTS.md (the register), docs/HANDOVER.md
(secrets and scopes), docs/LOOP_ENGINEERING.md (why `.github/**` is tier C).

**Basis: 9 claims checked this session (2026-10-30), 7 confirmed, 0 killed, 2 open.**
Confirmed by reading the named files and by running `slack-intent.test.mjs`,
`slack-find-work.test.mjs`, `scripts/slackask-check` and `scripts/askroute-check`. Open: the
two `[J-open]` items above, both needing a live run the user has not yet approved.
Sources: this repository.
