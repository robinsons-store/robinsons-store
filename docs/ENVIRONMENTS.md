# Dev and production: two environments, and how a change crosses between them

Status: ACCEPTED, 2026-10-30. Owner: the developer. Approver: Ravi Kiran.

**Both environments exist. Production is the live site on the store's database; dev is the
`develop` branch, deployed by the same Vercel project to its own address, on a separate
database holding only invented data [V-run, Supabase list_projects, Vercel
create_project_env and create_deployment, GitHub create_branch, 2026-10-30].** The movement
between them is automated in code: CI gates `develop`, the dev site is watched, promotion
refuses unless CI passed and the dev site is healthy, and main's own changes are carried back
to `develop` [R `.github/workflows/promote.yml`, `sync-develop.yml`, `dev-watch.yml`,
`.github/scripts/branch-flow.mjs`]. Three GitHub settings and one Vercel setting are still
missing, so dev scripts do not apply by themselves and promotion refuses until they exist
(steps 2, 5, 7 and 8 below). Asked
for on 2026-07-31: build to a dev site first, test there with dummy data, and promote to
production only when Ravi says yes.

## The shape

```mermaid
flowchart LR
  PR["A pull request"] -- "merge" --> DEV["develop branch"]
  DEV -- "deploys" --> DSITE["Dev site + dev database"]
  DEV -- "a person runs Promote" --> MAIN["main branch"]
  MAIN -- "deploys" --> LIVE["app.robinsonsgeneralstore.ca + live database"]
```

Plain flow: a change merges into `develop`, shows up on the dev site against dummy data, and
reaches the live site only when a person runs the promotion workflow.

| | Production | Dev |
|---|---|---|
| Branch | `main` | `develop` |
| Site | `app.robinsonsgeneralstore.ca` | `robinsons-store-git-develop-robinsons-store1.vercel.app`, or `dev.robinsonsgeneralstore.ca` once its DNS record exists |
| Vercel | Project `robinsons-store`, Production environment | **The same project**, Preview environment |
| Database | Supabase project `robinsons-store` (ref `mhcjreqvvhnrtgwtuwvr`) | Supabase project `robinsons-store-dev` (ref `wqxcmchxkdhigacvxgad`), Canada Central, same organization |
| Data | The store's | Invented: `schema.sql`, `seed.sql`, `seed_dev.sql`, then every script in `run-order.txt`. 2 stores, 46 vendors, 37 invoices on 2026-10-30 |
| Scripts | `supabase/run-order.txt`, on a push to `main` | The same list, on a push to `develop`, via `SUPABASE_DB_URL_DEV` |
| Daily email cron | Runs | Does not: Vercel runs crons on production deployments only |
| Login | Enforced (`auth_setup.sql` applied, `NEXT_PUBLIC_REQUIRE_AUTH` on) | Open demo mode: `auth_setup.sql` not run, the flag not set for Preview. Every column matches production except `app_user.auth_id`, which that script adds [V-run, information_schema on both, 2026-10-30] |
| State | BUILT | PARTIAL: steps 2, 5, 6, 7 and 8 below are open |

## Three decisions, and why

**One Vercel project, not two.** The dev site is the Preview environment of the existing
project, with its own database settings. A second project would mean a second set of
variables to keep in step, and it would run the daily email cron against dev, because crons
follow a project's production branch. This replaces the 2026-07-31 plan of a second project.

**A separate Supabase project, not a test store in the live database.** Test rows in the same
tables as the real ledger, and a bad migration hitting both at once, is exactly what dev
exists to prevent. A free second project costs nothing and keeps the two apart.

**Every preview uses the dev database, not only `develop`.** A pull request preview could
write to the store's real vendors and invoices until 2026-10-30. Now Preview points at dev
for every branch, so the live database is reachable only from the live site.

Approval is a person running **Actions, Promote develop to production**. It merges `develop`
into `main` only when CI passed on `develop`'s last commit and the dev site's `/api/health`
answers healthy; an unset `DEV_URL` is a refusal, because then nothing was tried there. It
then starts CI, the post-deploy watch and (when `supabase/` changed) the database scripts on
`main`, because a merge made by a workflow's token starts no workflow by itself
[R `.github/workflows/promote.yml`]. Nothing on a schedule can start it. Jira, which once carried QA and Approved statuses, is off
since 2026-08-12.

## What crosses, and what does not

- **Code crosses** from `develop` to `main` by the promotion pull request.
- **Schema crosses as scripts.** The same `run-order.txt` runs on dev first and production
  second, so every migration is exercised on dev before it touches the ledger.
- **Data never crosses.** Nothing copies either way. If dev needs to look more like
  production, extend `seed_dev.sql`. `run-order.txt` may never name a seed file, and CI
  enforces that, so dummy data cannot reach any database through the pipeline.
- **The guard.** Before any script runs on dev, `.github/scripts/distinct-databases.mjs`
  stops the run if the dev connection string points at the production project.

## Turning it on

| # | What | Who | State |
|---|---|---|---|
| 1 | Project `robinsons-store-dev` in Canada Central, loaded with `schema.sql`, `seed.sql`, `seed_dev.sql` and the `run-order.txt` list, from `main` at `4dfc97c` | The developer | BUILT 2026-10-30. In the store's existing organization, not a second one: only one is reachable from here. Free costs nothing; on Pro a second project adds compute (about $10 a month) [J-open, kill condition: the Pro upgrade quote shows otherwise] |
| 2 | Repository secret `SUPABASE_DB_URL_DEV`: the dev project's **session pooler** URI on port 5432 (docs/SUPABASE_SETUP.md). Needs the dev database password: Supabase, `robinsons-store-dev`, Project settings, Database, Reset database password | admin@ | TARGET. Until it exists, a merge to `develop` reports the dev script step as `skipped` |
| 3 | Vercel Preview gets the dev database: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for Preview hold the dev values; the production values are Production only | The developer | BUILT 2026-10-30. No `SUPABASE_SERVICE_ROLE_KEY` for Preview, so the Team page cannot create logins on dev; add it from the dev project's API settings if that is needed |
| 4 | Branch `develop` from `main`. The Slack autopilot now targets it, and promotion to `main` is Actions, Promote develop to production | The developer | BUILT 2026-10-30 |
| 5 | Repository variable `DEV_URL` = `https://robinsons-store-git-develop-robinsons-store1.vercel.app` | admin@ | TARGET |
| 6 | Let Ravi open the dev site. Preview addresses need a Vercel login on the team; or add `dev.robinsonsgeneralstore.ca` to the project for branch `develop` and ask Vianet for its CNAME by phone, since custom domains skip the login | Ravi Kiran | TARGET |
| 7 | Repository secret `VERCEL_AUTOMATION_BYPASS_SECRET`: Vercel, project `robinsons-store`, Settings, Deployment Protection, Protection Bypass for Automation, Add. Without it every workflow that asks the dev site gets Vercel's login page and reports it unhealthy, so promotion refuses | admin@ (Vercel), then a repository admin (GitHub) | TARGET |
| 8 | Settings, Actions, General, Workflow permissions: "Allow GitHub Actions to create and approve pull requests". Promote and sync-develop open pull requests with the workflow token | A repository admin | Unknown: not readable with Write access [V-run, `gh api .../actions/permissions/workflow` 403, 2026-10-30] |

**Keep `develop` level with `main`.** Anything merged straight to `main` must also reach
`develop`. **Bring develop level with main** does it on every push to `main`: it opens a
`main` to `develop` pull request when main has files develop lacks, merges it when it merges
cleanly, and leaves a conflict open for a person. After a promotion the two hold the same
files, so it opens nothing [R `.github/workflows/sync-develop.yml`].

**Check it worked:** the dev site lists the invented vendors, not the store's. After step 2,
Actions, Apply database scripts, on `develop`: the gate prints a non-zero length for the dev
secret and the guard passes. After steps 5 and 7, Actions, Dev site watch, Run workflow:
green, with "All 8 checks passed". Then Promote develop to production on a `develop` that is
ahead of `main`: the Decide step prints `merge`.

## What could still go wrong

- **Fixed 2026-10-30: dev scripts falling through to production.** migrate chose its
  connection as `develop && DEV || PROD`. In a workflow expression an empty value counts as
  false, so with `SUPABASE_DB_URL_DEV` unset a push to `develop` touching `supabase/` got the
  production string, and the guard passed it (no dev string to compare). The choice is now
  made in the shell, and an empty dev string skips the run. The health step had the same
  shape and would have reported the live site as dev's.
- **The dev site pointed at the live database.** A copy-paste mistake in Vercel's Preview
  variables. The Preview `NEXT_PUBLIC_SUPABASE_URL` must end in `wqxcmchxkdhigacvxgad`, the
  Production one in `mhcjreqvvhnrtgwtuwvr`.
- **Login differs.** Dev runs open; production enforces login. A change to sign-in or
  policies is not tested by dev until `auth_setup.sql` is run there and Preview gets
  `NEXT_PUBLIC_REQUIRE_AUTH=true` with dev logins.
- **Schemas drifting.** The pipeline runs the same list on both, but a script run by hand in
  one and not the other drifts them. `/api/health` on each site catches it.
- **Works on dummy data, fails on real data.** Dev holds hundreds of rows; production holds
  the full ledger. Volume bugs still reach production first.

## How this maps to the rest of the docs

Accounts and every secret: docs/HANDOVER.md. Script order and the connection string:
docs/SUPABASE_SETUP.md. The automation that targets `develop`: docs/LOOP_ENGINEERING.md and
docs/SLACK_AUTOPILOT.md. Services and plans: docs/PLATFORM.md.

**Basis: 11 claims checked this session (2026-10-30), 11 confirmed, 0 killed, 4 sources.**
Confirmed: the dev project exists in Canada Central and is healthy; the load counts; every
public table has RLS on dev; the `documents` bucket exists on dev; the column-by-column match
with production apart from `app_user.auth_id`; the Preview variables point at dev and the
Production ones are Production only; `develop` exists at `4dfc97c`; the first `develop`
deployment was assigned `robinsons-store-git-develop-robinsons-store1.vercel.app` in `yul1`;
the promotion workflow is started by hand only; migrate picks `SUPABASE_DB_URL_DEV` on
`develop` and runs the guard first [R `.github/workflows/migrate.yml:66-106`]. Not checked:
Vercel's crons-on-production-only rule and the Pro compute charge for a second project, both
`[J-open]`. Sources: Supabase API, Vercel API, GitHub API, this repository.

**Basis, second pass (2026-10-30): 7 claims checked, 7 confirmed, 0 killed, 4 sources.**
Confirmed: the dev site's built bundle carries the dev project's URL and its health check
passes all 8 checks [V-run, Vercel web_fetch_vercel_url]; the dev database holds 2 stores, 46
vendors (8 named DEV), 37 invoices, and the dev REST API returns the DEV vendors with the
Preview anon key [V-run, Supabase execute_sql and curl]; the repository has neither
`SUPABASE_DB_URL_DEV`, `VERCEL_AUTOMATION_BYPASS_SECRET` nor `DEV_URL` [V-run, `gh secret
list`, `gh variable list`]; repository auto-merge is off, which the old promote step relied
on [V-run, `gh api repos/...` `allow_auto_merge: false`]; `main`'s ruleset requires a pull
request and no status checks [V-run, ruleset 25802611]; `develop` is one commit behind `main`
[V-run, `git rev-list`]; the branch rules pass 23 cases [V-run, `node
.github/scripts/branch-flow.test.mjs`]. Not checked: that a CI run started by dispatch fires
the post-deploy watch by itself, so promote starts the watch directly `[J-open]`.
