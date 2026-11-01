# Accounts: what the store owns, and every secret the app reads

Status: ACCEPTED, 2026-10-30. Owner: the developer. Approver: Ravi Kiran (store owner).
Decision record: [docs/adr/ADR-001-the-store-owns-every-account.md](adr/ADR-001-the-store-owns-every-account.md).

**The move to the store's accounts is done: the hosting and the code now sit under the
store, not under a person, and production and dev each have their own database
(docs/ENVIRONMENTS.md). What is left is finishing: two paid plans are unconfirmed and the
original keys have not been reissued.** This file is the register of each account, every secret and
variable the code reads, and the items still open. Evidence tags follow
`.claude/skills/robinsons-store/references/standards.md`.

## The rule

Every account is opened with **`admin@robinsonsgeneralstore.ca`**, paid with the **store's
card**, and owned by the store's company, **1000476363 ONTARIO INC.**, 1061 Main St, Dorset,
ON P0A 1E0 [R `docs/DOMAIN_EMAIL.md:29-30`]. People get the smallest role that lets them do
their job and can be removed without anything breaking. A new service gets a row here in the
same change that adds it.

## Who owns what, today

| Service | What the store owns | State |
|---|---|---|
| Vianet (domain, mail) | Account 1000476363 ONTARIO INC., customer ID 616900 [R `docs/DOMAIN_EMAIL.md:29`]; mailbox admin@ | BUILT |
| Vercel | Team **robinsons-store** (slug `robinsons-store1`, id `team_pEEbrKESMFC4HpgFi3pa26P8`), project `robinsons-store` (id `prj_sDGCXtpmypc0d3qw0ylbO1rnWqeo`) [V-run, Vercel list_teams and get_project, 2026-10-30]. Domains `app.robinsonsgeneralstore.ca` (verified) and `robinsons-store.vercel.app` [V-run, list_project_domains, 2026-10-30] | BUILT. Plan not readable from here (A-01) |
| GitHub | Repository **`robinsons-store/robinsons-store`**; `main` is protected [V-run, GitHub list_branches, 2026-10-30]. The owner is admin@'s GitHub account, not an organization [D: the developer, 2026-10-25] | BUILT, with A-05 open |
| Supabase | Organization `robinsons-store` (plan `free` [V-run, Supabase get_organization, 2026-10-30]) holding project `robinsons-store` (ref `mhcjreqvvhnrtgwtuwvr`, the live database) and project `robinsons-store-dev` (ref `wqxcmchxkdhigacvxgad`, invented data, docs/ENVIRONMENTS.md), both Canada Central. admin@ is a member [D: the developer, 2026-10-25; confirm the Owner role on the Team page] | PARTIAL: still on Free (A-01) |
| Anthropic | Console organization for the store [Q: Ravi Kiran, confirm it exists] | PARTIAL: the key in Vercel is the original from 2026-05-29 (A-02) |
| Slack | Workspace robinsonsgeneralstore.slack.com [R `docs/DOMAIN_EMAIL.md:18`] and the bot app from `docs/slack-app-manifest.yml` | BUILT. Primary Owner not recorded (A-07) |
| Resend | Not opened. The daily due-date email stays off until it is | TARGET |
| Google | The store's own Google account, which owns the live sheets [R `docs/SYNC_PLAN.md:67`] | BUILT. Address not recorded (A-07) |
| Password vault | Bitwarden or 1Password, opened with admin@ | TARGET (A-03) |

## Still open

| ID | Item | Owner | Blocking? |
|---|---|---|---|
| A-01 | Confirm Supabase **Pro** ($25 a month, daily backups) and Vercel **Pro** ($20 a seat, licenses commercial use) on the store's card. Supabase read `free` on 2026-10-30 [V-run]; on Pro the dev project adds about $10 a month in compute [J-open]. Vercel's plan is not readable here; its billing API returned no charges for October [V-run, list_billing_charges, 2026-10-30], which is what Hobby looks like. See docs/PLATFORM.md risks 1 and 2 | Ravi Kiran | **Yes** |
| A-02 | Reissue the keys under the store and revoke the originals: `ANTHROPIC_API_KEY` (Vercel and GitHub), `VERCEL_TOKEN` (a token that can see team `robinsons-store1`), a new `CRON_SECRET` set in both Vercel and GitHub | The developer, with admin@ | No |
| A-03 | Pick the password vault, put admin@'s password and every recovery code in it | Ravi Kiran | No |
| A-04 | Domain renewal was due 2026-10-16 and has not been seen. Write the new expiry in docs/DOMAIN_EMAIL.md | Ravi Kiran | **Yes**, for anything on the domain |
| A-05 | The repository sits on a single GitHub account, which cannot have a second owner. Create an organization as that account and transfer the repository in, then reconnect Vercel's Git link | Ravi Kiran | No |
| A-06 | Reduce the developer to the least role (Developer on Supabase, Member on Vercel, Write on GitHub) once a second store-controlled owner exists; remove the project's leftover `*.vercel.app` aliases from before the move | Ravi Kiran | No |
| A-07 | Record the Slack Primary Owner, the store Google account's address, and the Anthropic monthly spend limit | Ravi Kiran | No |
| A-08 | Delete the Lawson "PO Details.docx" from Drive. It holds a full card number in plain text | Ravi Kiran | No |

## Secrets and variables register

Every name the code and workflows read. Values are never written here.

**Vercel, project environment variables** [V-run, Vercel filter_project_envs, 2026-10-30]

| Name | Issued by | Set today, for | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Production: the live project. Preview: the dev project | Public by design. Two separate entries since 2026-10-30, so a preview cannot reach the live database. Production ends `mhcjreqvvhnrtgwtuwvr`, Preview `wqxcmchxkdhigacvxgad` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Production: live. Preview: dev | Public by design; the database policies protect the data |
| `NEXT_PUBLIC_REQUIRE_AUTH` | Set by hand | Production | `true` once login is enforced |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Production | Server only, bypasses the policies. Rotate if the developer leaves |
| `ANTHROPIC_API_KEY` | Anthropic | Production, Preview | Also a GitHub secret. A-02 |
| `ANTHROPIC_MODEL` | Set by hand | Production, Preview | Optional; the code defaults to `claude-sonnet-5` [R `src/app/api/extract/route.ts:80`] |
| `AI_DAILY_CAP_PER_STORE` | Set by hand | Not set | Optional; the code defaults to 100 calls per store per Ontario day [R `src/lib/aiUsage.ts:28`] |
| `CRON_SECRET` | Made up | **Not set** | Same value as the GitHub secret. A-02 |
| `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO` | Resend, set by hand | Not set | Only when the daily email is wanted |
| `AGENTMAIL_API_KEY` | AgentMail | All | Installed, not wired in [R `docs/PLATFORM.md`] |
| `POSTGRES_*`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The Supabase integration | Production | Written by the integration on 2026-07-31; the code reads none of them |

**GitHub, Actions repository secrets**

| Name | Used by | Rotate if the developer leaves |
|---|---|---|
| `SUPABASE_DB_URL` | migrate, rls-audit | **Yes** (reset the database password) |
| `SUPABASE_DB_URL_DEV` | migrate, on a push to `develop`. **Not set yet** (docs/ENVIRONMENTS.md step 2) | Yes |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | migrate on `develop`, dev-watch, promote: lets a workflow past Vercel's login wall on the dev site. Issued by Vercel, project Settings, Deployment Protection, Protection Bypass for Automation. **Not set yet** (docs/ENVIRONMENTS.md step 7) | Yes (regenerate it in Vercel) |
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
| `DEV_URL` | The dev site, `https://robinsons-store-git-develop-robinsons-store1.vercel.app`. **Not set yet** (docs/ENVIRONMENTS.md step 5). Read by migrate on `develop`, dev-watch and promote; promote refuses while it is unset |
| `VERCEL_TEAM_ID` | Optional. The team the Vercel workflows ask; unset, they use `team_pEEbrKESMFC4HpgFi3pa26P8` [R `.github/workflows/vercel-diagnose.yml:39`] |
| `SLACK_REQUEST_CHANNEL` | The Slack channel ID the autopilot reads (accepted as a secret too) |
| `SLACK_REQUIRE_MENTION` | Optional. `false` only for a requests-only channel |

## When someone leaves

Remove them from the Vercel team, the Supabase organization, the GitHub repository, the
Slack app's collaborators and the Drive shares. If it is the developer, rotate everything
marked **Yes** above.

## How this maps to the rest of the docs

Why this is the rule: [ADR-001](adr/ADR-001-the-store-owns-every-account.md). Service
inventory and plan risks: docs/PLATFORM.md. Dev and production: docs/ENVIRONMENTS.md. Which
agent runs on which key: docs/AGENTS.md. The new member's forms: ONBOARDING.md. Domain and
mailboxes: docs/DOMAIN_EMAIL.md.

**Basis: 11 claims checked this session (2026-10-30), 11 confirmed, 0 killed, 3 sources.**
Confirmed: the Vercel team name, slug and id; the project on that team; both domains and
the custom one verified; every Vercel variable name and its targets, including Preview on the
live database URL until it was removed from Preview the same day, and no `CRON_SECRET`; the Anthropic key unchanged since 2026-05-29; no
October charges on the Vercel team; the repository at `robinsons-store/robinsons-store` with
`main` protected; `develop` created the same day; the Supabase plan `free` and both projects.
admin@'s Supabase role stays `[D]`: it is not readable from the Supabase API. Sources: Vercel API, GitHub API, Supabase API.
