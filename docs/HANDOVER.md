# Handover: every account owned by the store

Status: PROPOSED, 2026-10-24. Owner: the developer. Approver: Ravi Kiran (store owner).
Decision record: [docs/adr/ADR-001-the-store-owns-every-account.md](adr/ADR-001-the-store-owns-every-account.md).

**The store owns its domain and now has its own admin mailbox. Every other account the app
runs on (database, hosting, code, AI key, Slack app) is still held by the developer, and two
of them are on plans that put the store at risk.** This file is the register of what the
store will own and under which exact names, the order to move each one, and the checks that
prove each move landed. Evidence tags follow `.claude/skills/robinsons-store/references/standards.md`:
`[R]` read from a file, `[V-run]` read live this session, `[V-src]` from vendor
documentation this session, `[D]` reported and to be confirmed by a named person, `[J-open]`
believed but unchecked, `[Q]` open question with an owner.

Companion files: docs/owner-notes/handover-checklist.md (every task as numbered, tickable steps, labelled with which account does each), docs/PLATFORM.md (every service and why), docs/AGENTS.md (the AI agents and
whose key each runs on), ONBOARDING.md (the forms for the person taking over),
docs/ENVIRONMENTS.md (dev and production), docs/SUPABASE_SETUP.md (the database connection
secret), docs/DOMAIN_EMAIL.md (the domain and mailboxes).

## The rule

Every account is opened with **`admin@robinsonsgeneralstore.ca`**, paid with the **store's
card**, and owned by the store's company, **1000476363 ONTARIO INC.**, 1061 Main St, Dorset,
ON P0A 1E0 [R `docs/DOMAIN_EMAIL.md:29-30`]. People get the smallest role that lets them do
their job and can be removed without anything breaking. A person's own email as the login for
a store service is exactly what this removes.

## Progress

A step is done when its check passes, not when the button is clicked.

| Step | State | Check that closes it |
|---|---|---|
| 0. Store admin mailbox | **BUILT** 2026-10-18 [D: Vianet mailbox list, as shared by the developer; Ravi Kiran to confirm in the panel] | Listed on Vianet, 1000MB quota |
| 0. Store password vault, two-factor on every account | TARGET | Every login and recovery code below is in the vault |
| 1. Domain renewal confirmed | TARGET, overdue since 2026-10-16 | New expiry date written in docs/DOMAIN_EMAIL.md |
| 1. Watchdog checks the store's domain | TARGET | GitHub variable `PRODUCTION_URL` = `https://app.robinsonsgeneralstore.ca` |
| 2. Supabase owned by admin@, on Pro | TARGET. Plan is `free` today [V-run, Supabase get_organization, 2026-10-24] | Organization plan reads `pro`; a backup is listed the next day |
| 3. Vercel project on the store's team, on Pro | TARGET. Project is on the developer's personal team today [V-run, Vercel get_project `accountId`, 2026-10-24] | Project `accountId` is the store team's id; a production deploy is Ready there |
| 4. Repository in the store's GitHub organization | TARGET | Repository URL is under the store's organization; Vercel builds from it |
| 5. Keys reissued under the store | TARGET | Old Anthropic key and old `VERCEL_TOKEN` revoked |
| 6. Dev environment on the store's accounts | TARGET | `develop` branch exists; dev migration gate prints a non-zero length |

## The target: what the store will own, and under which names

Enter these exactly. Where a name has to be unique on the service and might be taken, the
fallback is in brackets; record the name actually used in the last column.

| Service | Account the store owns | Sign-in | Billing | Developer's role afterwards | Name actually used |
|---|---|---|---|---|---|
| Vianet (domain, mail) | Account **1000476363 ONTARIO INC.**, customer ID 616900 [R `docs/DOMAIN_EMAIL.md:29`] | Contact address: admin@ | Unchanged | None | (already the store's) |
| Password vault | Bitwarden or 1Password organization **"Robinson's General Store"** [Q: Ravi Kiran, which product] | admin@ | Store card | None | |
| Supabase | Keep organization **`robinsons-store`** (id `idijiwqgwlsebgpkfzry`), project **`robinsons-store`** (ref `mhcjreqvvhnrtgwtuwvr`, Canada Central) [V-run, list_projects, 2026-10-24] | admin@ as **Owner** | Pro, $25 a month, store card, billing email admin@ | **Developer**: reads the organization, works in the project, cannot change settings or billing [V-src, supabase.com/docs/guides/platform/access-control, 2026-10-24] | (keeps its name) |
| Vercel | New team **"Robinson's General Store"**, slug `robinsons-general-store` (`robinsons-store-team`); project `robinsons-store` (id `prj_sDGCXtpmypc0d3qw0ylbO1rnWqeo`) moves in | admin@ as **Owner** | Pro, $20 per seat a month, store card | **Member** while work continues, then removed | |
| GitHub | New user **`robinsons-store-admin`** for admin@, which creates organization **`robinsons-general-store`** (`robinsonsgeneralstore`); repository `robinsons-store` moves in | admin@'s GitHub user as **Owner** | Free, billing email admin@ | **Owner** only for the transfer, then **outside collaborator, Write** | |
| Anthropic | Console organization **"Robinson's General Store"** | admin@ | Store card, monthly spend limit [Q: Ravi Kiran, the limit] | None | |
| Slack | Workspace **robinsonsgeneralstore.slack.com** [R `docs/DOMAIN_EMAIL.md:18`]; the bot app from `docs/slack-app-manifest.yml` | admin@ as **Primary Owner** of the workspace [Q: the developer, who is Primary Owner today] and a collaborator on the app | Free | Member | |
| Resend | New account, domain robinsonsgeneralstore.ca verified | admin@ | Free tier | None | |
| Google | The store's existing Google account, which owns the live sheets [R `docs/SYNC_PLAN.md:67`] | [Q: Ravi Kiran, the account's address] | Unchanged | Viewer on the shared sheets only | (already the store's) |

## The order, and why

Mailbox and vault first, because every sign-up below needs the mailbox and every password
lands in the vault. The database before the hosting, because backups protect the one thing
that cannot be rebuilt. Hosting and code together, because moving either one breaks the link
between them until both have moved. Dev last and straight onto the store's accounts, so it
never needs moving.

### Step 0. Mailbox and vault (Ravi Kiran or the developer, 15 minutes)

1. BUILT: `admin@robinsonsgeneralstore.ca` exists. Open it through the Vianet account panel
   (https://myaccount.vianet.ca/), or a mail app with incoming `mail.vianet.ca`, outgoing
   `smtp.vianet.ca` port 587, the full address as username [J-open: settings from Vianet's
   support page as indexed by a search engine 2026-10-18; the page itself could not be opened
   from here. Kill condition: the mail app fails to connect].
2. Create the store vault with admin@. Save admin@'s own password in it first.
3. Write the vault's master password on paper; keep it at the store, with a second copy held
   by Ravi Kiran.

### Step 1. The domain (Ravi Kiran, 5 minutes)

1. Vianet panel: read the domain's expiry date and auto-renew state. Write them in
   docs/DOMAIN_EMAIL.md. It was due 2026-10-16 [R `docs/DOMAIN_EMAIL.md:45`].
2. Set the GitHub variable `PRODUCTION_URL` to `https://app.robinsonsgeneralstore.ca`. Today
   the watchdog falls back to the vercel.app address [R `.github/workflows/post-deploy-watch.yml:54`],
   which keeps passing even if the domain lapses.

### Step 2. Supabase (15 minutes)

Keep the organization; change who owns it. Moving the project would change nothing the store
needs and would put the connection strings at risk.

1. The developer, signed in with the account that owns organization `robinsons-store`, opens
   Team and invites `admin@robinsonsgeneralstore.ca` as **Owner**. Only an Owner can add
   owners or move projects; an Administrator cannot [V-src, access-control, 2026-10-24].
2. In a private window, open the invite from the admin@ inbox and follow its link; create the
   admin@ Supabase account there (password into the store vault), then accept.
3. As admin@: add the store card, upgrade to **Pro**, set the billing email to admin@.
4. The developer stays **Owner** until a second store-controlled owner exists (ADR-001,
   condition 2), then drops to **Developer** at close-out.
5. Reset the database password (Project settings, Database). Nothing in the app reads it.
   Rebuild `SUPABASE_DB_URL` as docs/SUPABASE_SETUP.md says (session pooler, port 5432) and
   replace the GitHub secret.

Until Pro is on, run the app's Export screen and save the workbook to the store's Google
Drive. It is a record, not a restore: it leaves out the uploaded invoice images.

### Step 3. Vercel (20 minutes)

1. Sign up at Vercel as admin@. Create the team from the table, on **Pro**, store card.
2. The developer, in project `robinsons-store`, Settings, General, **Transfer**, picks the
   store's team. A transfer is a request that the receiving team accepts [V-src,
   vercel.com/docs/rest-api/projects/accept-project-transfer-request, 2026-10-24].
3. As admin@: accept.
4. Check in the store team's copy. The vendor documentation read here does not say which
   settings travel with a project, so each one is checked rather than assumed [J-open, kill
   condition: any of these is missing after the transfer]:
   - Domains lists `app.robinsonsgeneralstore.ca`;
   - Environment Variables lists every name in the register below;
   - Functions, Function Region is **Montreal (yul1)**;
   - Cron Jobs lists `/api/alerts`.
5. Not moving with it: the **AgentMail** Marketplace install (reinstall on the store team when
   email intake is built [R `docs/PLATFORM.md`]), and **`VERCEL_TOKEN`**, which belongs to
   the developer's account. Create a new token as admin@, scoped to the store team, and
   replace the GitHub secret.

If a deploy shows as blocked after the move because its commit author is not a team member,
add whoever merges pull requests as a member [J-open, kill condition: a deploy is blocked for
any other reason].

### Step 4. GitHub (20 minutes)

1. Sign up at GitHub as admin@ with the username from the table. Turn on two-factor.
2. As that user, create the **Free** organization from the table, billing email admin@.
3. Invite the developer's GitHub account to the organization as **Owner**. The developer
   needs permission to create repositories there to transfer one in [J-open, kill condition:
   the transfer dialog does not offer the organization].
4. The developer: repository Settings, General, Danger Zone, **Transfer**, to the store's
   organization.
5. In the moved repository, Settings, Secrets and variables, **Actions**: compare the names
   against the register below and re-add anything missing. A missing secret does not fail a
   run; the workflow reports `skipped` and goes green [R `docs/SUPABASE_SETUP.md:76-78`].
6. Install the Vercel GitHub app on the organization and point the store's Vercel project at
   the moved repository, production branch `main`. Merge a small change and confirm a
   production deploy appears.
7. Install the Claude GitHub app on the organization so the Slack autopilot and future Claude
   sessions can reach the repository (docs/AGENTS.md).
8. Settings, Actions, General, Workflow permissions: allow GitHub Actions to create and
   approve pull requests. The promotion workflow needs it; merging stays human.
9. Reduce the developer to **outside collaborator, Write** once a second store-controlled
   owner exists (ADR-001, condition 2).

### Step 5. Keys reissued under the store (20 minutes)

| Key | Get it as admin@ from | Put it in | Then |
|---|---|---|---|
| Anthropic | Console, Create Key | Vercel `ANTHROPIC_API_KEY` (production and preview), GitHub secret `ANTHROPIC_API_KEY` | Redeploy, capture one invoice, revoke the old key |
| Vercel token | Account settings, Tokens, scoped to the store team | GitHub secret `VERCEL_TOKEN` | Run the Vercel diagnose workflow once |
| Slack bot and webhook | The app from `docs/slack-app-manifest.yml` in the store workspace | GitHub secrets `SLACK_BOT_TOKEN`, `SLACK_WEBHOOK_URL`; variable `SLACK_REQUEST_CHANNEL` | Actions, "Say something in Slack", run once |
| Resend | Verify robinsonsgeneralstore.ca (DNS records by phone to Vianet hosting) | Vercel `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO` | Call `/api/alerts` with the cron secret |
| `CRON_SECRET` | Make a new long random string | Vercel **and** GitHub, the same value | Watchdog and daily email both send it |
| Supabase service role | Project settings, API | Vercel `SUPABASE_SERVICE_ROLE_KEY` | The Team page can create staff logins |

### Step 6. The dev environment, on the store's accounts

Steps in docs/ENVIRONMENTS.md, Setting it up, with two changes: the dev database goes in a
**second, Free organization** owned by admin@ so it adds no compute charge, and the guard
`.github/scripts/distinct-databases.mjs` refuses any dev run whose connection string points
at production [V-run, its 16 checks passed 2026-10-18]. Then create the `develop` branch.

## Secrets and variables register

Every name the code and workflows read [V-run, search of `process.env` in `src/` and of
`secrets.` and `vars.` in `.github/workflows/`, 2026-10-18]. Values are never written here.

**Vercel, project environment variables**

| Name | Issued by | Notes | Rotate if the developer leaves |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Public by design | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Public by design; the database policies protect the data | No |
| `NEXT_PUBLIC_REQUIRE_AUTH` | Set by hand | `true` once login is enforced | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Server only, bypasses the policies | **Yes** |
| `ANTHROPIC_API_KEY` | Anthropic | Also a GitHub secret | **Yes** |
| `ANTHROPIC_MODEL` | Set by hand | Optional; the code defaults to `claude-sonnet-5` [R `src/app/api/extract/route.ts:80`] | No |
| `AI_DAILY_CAP_PER_STORE` | Set by hand | Optional; AI calls per store per Ontario day, the code defaults to 100 [R `src/lib/aiUsage.ts:28`]. A change applies after a redeploy | No |
| `CRON_SECRET` | Made up | Same value as the GitHub secret | **Yes** |
| `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO` | Resend, set by hand | Only when the daily email is wanted | Key only |
| `SLACK_SIGNING_SECRET` | Slack app, Basic Information | NEW (ADR-006), not yet set. Ask in Slack: without it `/api/slack/events` refuses every request | **Yes** |
| `SLACK_BOT_TOKEN` | Slack app | NEW in Vercel (ADR-006), not yet set; same value as the GitHub secret. Posts the answers | **Yes** |
| `SLACK_REQUEST_CHANNEL` | Slack | NEW in Vercel (ADR-006), not yet set; the channel id the answers are given in, same as the GitHub variable | No |
| `SLACK_STORE_ID` | Supabase, `store.id` | NEW (ADR-006), not yet set; which store a Slack question is answered about. Unset: "not set up" replies, no model call | No |

**GitHub, Actions repository secrets**

| Name | Used by | Rotate if the developer leaves |
|---|---|---|
| `SUPABASE_DB_URL` | migrate, rls-audit | **Yes** (reset the database password) |
| `SUPABASE_DB_URL_DEV` | migrate, once dev exists | Yes |
| `CRON_SECRET` | migrate, post-deploy-watch | **Yes** |
| `SLACK_WEBHOOK_URL` | migrate, rls-audit, post-deploy-watch, slack-announce | **Yes** |
| `SLACK_BOT_TOKEN` | slack-autopilot, slack-lifecycle | **Yes** |
| `ANTHROPIC_API_KEY` | slack-autopilot | **Yes** |
| `VERCEL_TOKEN` | vercel-diagnose, vercel-protect | **Always**: tied to a person's Vercel account |
| `JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN` | jira-autopilot, parked | Delete them; Jira is off |

**GitHub, Actions repository variables**

| Name | What |
|---|---|
| `PRODUCTION_URL` | The address the watchdog checks: `https://app.robinsonsgeneralstore.ca` |
| `DEV_URL` | The dev site, once it exists |
| `SLACK_REQUEST_CHANNEL` | The Slack channel ID the autopilot reads (accepted as a secret too) |
| `SLACK_REQUIRE_MENTION` | Optional. `false` only for a requests-only channel |

**Slack app, scopes and events** (the app from `docs/slack-app-manifest.yml`)

| What | Why | State |
|---|---|---|
| Scopes `channels:history`, `chat:write`, `reactions:read`, `reactions:write` | The build sweep and its status card | Set |
| Scope `app_mentions:read`, Event Subscriptions on with bot event `app_mention`, Request URL `https://<the app's address>/api/slack/events` | Ask in Slack (ADR-006). Changing scopes needs the app reinstalled to the workspace | NEW, not yet set; the manifest is unchanged until approved |

## Proof the move worked

- [ ] `https://app.robinsonsgeneralstore.ca/api/health` answers `ok: true`.
- [ ] `curl -sD- -o /dev/null https://app.robinsonsgeneralstore.ca/api/health | grep -i x-vercel-id` shows `yul1` as the second field: the header reads `<edge>::<function region>::<id>`, and the first field is the edge nearest the caller (before the move, 2026-10-24: `cle1::yul1::...`).
- [ ] A merge to main produces a production deploy on the **store's** Vercel team.
- [ ] Actions, Apply database scripts, run by hand: the gate prints a non-zero secret length.
- [ ] Actions, "Say something in Slack", posts in the channel.
- [ ] Post-deploy watch runs green against the custom domain.
- [ ] The owner signs in; a staff account signs in and sees no dollar figures.
- [ ] Supabase, Database, Backups lists a backup from the day after the upgrade.
- [ ] One invoice photo goes through Capture on the store's Anthropic key.

## Close-out

1. Remove the developer from what they no longer need: the Vercel team, the Supabase
   organization (or keep Developer), the Slack app's collaborators, Drive shares. GitHub stays
   Write while work continues.
2. If the developer is leaving entirely, rotate everything marked **Yes** above.
3. Delete the Lawson "PO Details.docx" from Drive. It holds a full card number in plain text.
4. Record the handover date in docs/STATUS.md and fill in the "Name actually used" column.

## Open items

| ID | Item | Owner | Blocking? |
|---|---|---|---|
| HO-01 | Domain renewal not seen; was due 2026-10-16 | Ravi Kiran | **Yes**, for anything on the domain |
| HO-02 | Which vault product | Ravi Kiran | Yes, for Step 0 |
| HO-03 | Anthropic monthly spend limit | Ravi Kiran | No |
| HO-04 | Who is Primary Owner of the Slack workspace today | The developer | No, for Steps 2 to 4 |
| HO-05 | The store Google account's address | Ravi Kiran | No |
| HO-06 | Second store-controlled GitHub owner (ADR-001 condition 2) | Ravi Kiran | No, until close-out |
| HO-07 | The handover commits sit on a branch not yet pushed, because the session's GitHub connection is not the developer's personal account | The developer | No |

## How this maps to the rest of the docs

Why this is the rule: [ADR-001](adr/ADR-001-the-store-owns-every-account.md). Service
inventory and plan risks: docs/PLATFORM.md. Which agent runs on which key: docs/AGENTS.md. The
new member's forms and first week: ONBOARDING.md. Domain and mailboxes: docs/DOMAIN_EMAIL.md.

**Basis: 9 claims checked this session (2026-10-24), 8 confirmed, 0 killed, 4 sources.**
Confirmed: Supabase organization plan `free` and project ref and region (Supabase API);
Vercel project id, team id and domains (Vercel API); Supabase organization roles and the
Owner-only rights (Supabase access-control docs); Vercel transfer by accepted request (Vercel
REST docs); the watchdog's fallback address (`.github/workflows/post-deploy-watch.yml:54`);
the default model (`src/app/api/extract/route.ts:80`). One claim from the 2026-10-18 version,
that environment variables and domains travel with a Vercel project, could not be confirmed
from the documentation reachable here and is now `[J-open]` with a check in Step 3. Sources:
Supabase Management API, Vercel API, Supabase documentation, Vercel documentation.
