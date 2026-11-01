# Capability catalog

## How to read this

This file is the standing answer to "should we use X". Every capability researched across Vercel, Supabase, GitHub, AWS, Anthropic, OpenAI and the third-party services in the Marketplace is listed here with a verdict, so that the question is settled once and can be looked up rather than argued again.

**The rule: a capability is adopted when a named requirement needs it, not because it exists.** A named requirement means an entry in `docs/REQUIREMENTS.md`, an invariant in the skill, a Canadian legal obligation the store carries, or a recorded owner ask in `docs/OWNER_NOTES.md`. "It is free", "it is on the dashboard" and "it would be tidy" are not requirements. This matters more here than on most projects, because one person builds and supports this system for a store that cannot lose a receiving day in August. Every service adopted is another thing that can be down at 7am on a Saturday, and another sentence in the answer to "where does the store's data go".

Four sections follow:

- **Adopt now.** A named requirement needs it today. Ordered by business value, so the top of the table is where to start. Items near the bottom are already in use with nothing to change; they are listed so their absence does not read as an oversight.
- **Adopt when needed.** Worth doing later, with the trigger condition written down now so the decision is a lookup rather than a fresh debate.
- **Declined, with reasons.** Grouped by platform, one line each.
- **Sequenced plan.** What to build first, second, third, and why that order.

Cost is stated as a fact and left there. Effort uses the same units as the rest of the docs: minutes, hours, days, weeks.

---

## Adopt now

| # | Capability | Platform | Serves | What the store gets | Effort | Cost |
|---|---|---|---|---|---|---|
| 1 | Pro plan tier | Supabase | Six-year record retention; PLATFORM.md open risk 2 | Every vendor, invoice, payment and staff record gets an automatic daily backup. Today one bad script loses the lot. | minutes | $25/mo |
| 2 | Daily backups | Supabase | Six-year record retention | If the database goes wrong, the records come back from yesterday instead of not coming back. | minutes | Included with Pro (7 days) |
| 3 | Supabase on the Marketplace | Marketplace | PLATFORM.md open risk 2 | The plan change, without moving the live database anywhere. | hours | $25/mo Pro |
| 4 | Amazon S3 Standard, write-only archive | AWS | Six-year retention; the half of risk 2 backups do not cover | The invoice photos get a second copy, in Toronto. Today they exist in exactly one place. | days | ca-central-1 $0.025/GB-month, $0.0055 per 1,000 PUTs |
| 5 | S3-compatible Storage protocol | Supabase | The same archive | The copy mechanism: rclone or aws s3 sync, no code in the app. | hours | Free, plus egress |
| 6 | Push protection | GitHub | Keep secrets out of the repo | A password or key cannot be published by accident. This is the one mistake here that cannot be undone. | minutes | Free on public repos |
| 7 | Secret scanning alerts | GitHub | Keep secrets out of the repo | If a key has already leaked into the history, you find out now rather than when someone uses it. | minutes | Free on public repos |
| 8 | Actions environments | GitHub | Invariants 1 and 4; secrets discipline | The one key that opens every record, bypassing all permission rules, stops being readable by the job that runs AI-written code. | hours | Free on public repos |
| 9 | Repository rulesets | GitHub | LOOP_ENGINEERING tier C | The rule that stops the robot rewriting its own safety rules becomes one GitHub enforces, not one the robot enforces on itself. | hours | Free on public repos |
| 10 | Publishable and secret API keys | Supabase | Availability of a system the store depends on | The app keeps working past December 31, 2026, when the legacy keys stop. | hours | Free |
| 11 | Functions: region and body limit | Vercel | PIPEDA residency; capture | Makes true the written promise that staff and store records stay in Canada, and stops a normal phone photo failing to read. | hours | No charge for the region setting |
| 12 | Included quotas and overage rates | Supabase | Capture loop; retention | Knowing that capture stops when the 1 GB file bucket fills, before it fills in season. | hours | Free tier 1 GB files; Pro 100 GB then $0.0213/GB |
| 13 | Spend Cap | Supabase | Build spec section 8 budget | A loop or a crawler cannot turn into a four-figure bill while nobody is looking. | minutes | Free (Pro feature) |
| 14 | Spend limits and workspace split | Anthropic | PLATFORM.md budget rule | The robot that writes the code cannot spend the money the store needs to read its invoices. | minutes | Free |
| 15 | Spend limits and alerts | OpenAI | Build spec section 8 budget | A stuck retry loop trips a cap instead of the credit card. | minutes | Free |
| 16 | Dependabot alerts | GitHub | Availability; six-year retention | If a security hole is found in a building block this app is made of, somebody gets told. Today nobody would. | minutes | Free |
| 17 | Dependabot security updates | GitHub | Availability | The fix arrives already written. You read it and merge it. | minutes | Free |
| 18 | Dependency graph | GitHub | Prerequisite for the two above | The list of every outside piece of software the app depends on. | minutes, verify only | Free |
| 19 | WAF custom rules and rate limiting | Vercel | PLATFORM.md worth adopting; invariant 2 | Nobody can sit outside guessing the store's login all night, or run up the AI bill by pointing a script at the invoice reader. | hours | Hobby 3 rules, 1M rate-limited requests/mo included |
| 20 | Security Advisor and Performance Advisor | Supabase | Invariant 6 | The most likely security mistake in this codebase becomes something the platform catches. | hours | Free |
| 21 | gpt-transcribe | OpenAI | REQUIREMENTS open item: the un-decoded voice notes | The owner says what he wants in the Telugu and English he actually speaks, and it becomes typed words. | hours | $0.0045/minute |
| 22 | Amazon Transcribe, batch | AWS | Suggestions voice recordings (shipped, unread) | Same job, run inside Canada, if the first attempt does not hold up. | days | ca-central-1 $0.006/minute |
| 23 | Transcribe Telugu (te-IN) | AWS | OWNER_NOTES round 3 | Feedback in the owner's own language becomes text the builder can act on. | days | No premium over $0.006/minute |
| 24 | Structured outputs | Anthropic | Capture; untrained seasonal staff | An invoice photo can no longer fail with a message nobody in the store can act on. | hours | Small input-token increase |
| 25 | Adaptive thinking, set on purpose | Anthropic | Capture reliability | Removes a silent cause of failed captures: the model runs out of room mid-answer and the app blames the format. | hours | Free |
| 26 | Effort parameter | Anthropic | Capture; phone-first | Invoice capture gets faster and cheaper without changing what it reads. | hours | Free |
| 27 | Refusal stop reason handling | Anthropic | The owner is never asked to debug | When the model declines, the store is told that in plain words instead of a technical error. | hours | Free |
| 28 | Vision input, resized before upload | Anthropic | Capture; phone-first | Photos upload faster on store internet and stop failing when a phone takes a very large picture. | hours | Lower token count than today |
| 29 | Resend send-email API, two defects | Marketplace | Due and overdue alerts (shipped) | The daily money email stops being able to fail silently. | hours | Free tier |
| 30 | Resend domains: SPF, DKIM, DMARC | Marketplace | DOMAIN_EMAIL section 3 | The daily payment alert arrives from the store's own name, so it is less likely to land in junk. | hours, plus a Vianet call | Free: 1 domain |
| 31 | Auth rate limits and custom SMTP | Supabase | Enforced auth cutover | A staff member locked out mid-shift gets the reset email, and it comes from the store. | hours | Free (Resend covers it) |
| 32 | Email, password, magic link and OTP auth | Supabase | Enforced auth mode; RUNBOOK | The owner gets in from his phone without a password to lose. Staff logins are made and removed on the Team page. | minutes | Billed by MAU; 100,000 on Pro |
| 33 | SSL enforcement | Supabase | PIPEDA duty of care | Nothing carrying vendor terms, payment history or staff pay can travel unencrypted. | minutes | Free |
| 34 | Deployment Protection on the dev project | Vercel | ENVIRONMENTS: dev is publicly reachable | The practice copy is not sitting open on the internet for anyone who finds the address. | hours | Free (All Deployments scope needs Pro) |
| 35 | Code scanning with CodeQL | GitHub | LOOP_ENGINEERING loop 2; invariants 1 to 5 | A second automatic reviewer reads every change the robot writes, looking for the mistakes that let one store's data reach the wrong person. | minutes to enable | Free on public repos |
| 36 | Private vulnerability reporting | GitHub | Public repo pointing at production | Someone who spots a way in has a private way to tell you, instead of posting it publicly. | minutes | Free |
| 37 | GITHUB_TOKEN permissions on ci.yml | GitHub | LOOP_ENGINEERING | The job that only checks the code loses the ability to change it. One line. | minutes | Free |
| 38 | Concurrency group on ci.yml | GitHub | migrate.yml single-apply safety | Two runs of the same job can never race. | minutes | Free |
| 39 | Workflow trigger events | GitHub | LOOP_ENGINEERING loops 1, 3, 4 | Knowing that scheduled workflows switch themselves off after 60 quiet days, which would stop the watchdog over a slow winter. | minutes | Free |
| 40 | Auto-merge for pull requests | GitHub | Not used since 2026-10-30 | Nothing to switch on: promote.yml now waits for CI itself and merges with the commit pinned. | none | Free |
| 41 | Instant Rollback | Vercel | LOOP_ENGINEERING: reverting is deliberately manual | If a change breaks the app on a busy Saturday, the store is back on the last working version in under a minute. | hours | Free |
| 42 | Observability, base | Vercel | LOOP_ENGINEERING improvement 2 | When something breaks for a staff member there is a record to read instead of a guess. | hours (runbook lines) | Base free; Hobby keeps logs 1 hour, Pro 1 day |
| 43 | Log Explorer | Supabase | Debugging playbook | When the owner says "it did not save yesterday", you can find out why. | none | Included; Free 1 day, Pro 7 days |
| 44 | Sentry | Marketplace | LOOP_ENGINEERING improvement 2 | You usually know a screen crashed before the owner tells you. | days | Developer $0; Team $26/mo annual |
| 45 | Vercel app for Slack | Marketplace | DOMAIN_EMAIL: a deploys channel | The builder learns a deploy failed when it fails, not when the owner phones. | hours | Free integration |
| 46 | Slack Free plan | Marketplace | The same channel | Nothing to buy for a deploys channel. | none | $0 |
| 47 | AgentMail Inboxes API | Marketplace | Email invoice intake (queued) | One address for the invoice mailbox to point at. | hours | Free tier covers 3 inboxes |
| 48 | AgentMail Threads and Messages | Marketplace | Email invoice intake | The app reads the actual email, sender and subject included, so a wrong sender is rejected before anything is extracted. | hours | Included on Free |
| 49 | AgentMail attachments | Marketplace | Email invoice intake | The PDF or photo a vendor emailed becomes a draft invoice, read by the extraction the store already trusts, with the same human confirm. | hours | Included on Free; 3 GB cap |
| 50 | AgentMail webhooks | Marketplace | Email invoice intake | Invoices arrive in the app within seconds of the vendor sending them. | days | Basic webhooks free |
| 51 | AgentMail spam and blocked events | Marketplace | Email intake; the owner-editable allowlist ask | Spam and forged mail never becomes a draft invoice. | hours to gate; days for the allowlist table | Included |
| 52 | AgentMail scoped keys and idempotency | Marketplace | Email intake; credentials in env only | If the app's email key leaks, the damage stops at the invoice inbox. The store's real mailboxes are untouched. | hours | Free |
| 53 | AgentMail as a Marketplace integration | Marketplace | Email invoice intake | One less account and card, and no unused provider keys sitting in the app's environment. | hours | Billed through Vercel |
| 54 | AgentMail Free tier | Marketplace | Email invoice intake | Nothing to buy: 3 inboxes and 3 GB, against one inbox needed. | none | $0 |
| 55 | Marketplace Integrations | Vercel | Email invoice intake; DOMAIN_EMAIL section 4 | Vendors email invoices to one address and they show up in the app to confirm, instead of sitting unread. | days once invoices@ exists | AgentMail free tier |
| 56 | Google Sheets API | Marketplace | Sheets two-way sync (SYNC_PLAN phases 2 and 3) | The owner keeps running the store in the spreadsheets he uses, and the app stays current by itself. | days | $0 today |
| 57 | Google service account auth | Marketplace | SYNC_PLAN phase 2 | He shares the two spreadsheets once, the way he would with a person. No sign-in screen, nothing that expires. | hours | $0 |
| 58 | Storage buckets with RLS | Supabase | Capture; invariant 1 | No permanent public link to a picture of the store's invoices exists. | none, in use | Free 1 GB; Pro 100 GB |
| 59 | Smart CDN | Supabase | Arrives with Pro; department photo tiles | Photos and documents load from a nearby cache instead of from Toronto every time. | none | Included with Pro |
| 60 | Row Level Security | Supabase | Invariants 1, 2, 6 | A staff login cannot read the store's money or the payroll table even if a screen forgets to hide it. | none, in use | Free |
| 61 | Database functions and triggers | Supabase | Invariants 4, 5, 8, 10 | A payment cannot be half-recorded and an unchecked dollar amount cannot post, whichever screen wrote it. | none, in use | Free |
| 62 | Managed Postgres | Supabase | The whole data model | One database one person can read with SQL, which is why the health check can compare app against database at all. | none, in use | Included |
| 63 | Data API / PostgREST | Supabase | Every screen | The data layer every screen already reads through, with RLS making it safe. | none, in use | Free; counts toward egress |
| 64 | Supavisor connection pooling | Supabase | migrate.yml; SUPABASE_SETUP | Merged database scripts apply themselves instead of waiting for someone to open the SQL editor. | none, in use | Free |
| 65 | Claude Sonnet 5 | Anthropic | Capture; invariant 9 | The model already reading the invoices is the right one, at a price that is now permanent. | none, in use | $2/MTok in, $10/MTok out |
| 66 | PDF and document input | Anthropic | Capture; email intake | The PDF path vendors already email works the way it should. | none, in use | Billed as input tokens |
| 67 | 1M-token context window | Anthropic | Ask-the-store; deferred pgvector | The reason the app can answer questions from the store's own data with no search database. | none, in use | No premium |
| 68 | Data retention posture, written down | Anthropic | PIPEDA; PLATFORM decision rule 2 | A written answer to where the store's information goes, and a rule that stops future features moving staff data onto systems that keep it. | done 2026-10-24 | Free |
| 69 | Resend regions, written down | Marketplace | Canadian residency claim | The residency sentence the owner has been given becomes accurate rather than nearly accurate. | hours | $0 |
| 70 | Claude Code | Anthropic | LOOP_ENGINEERING; .claude/agents | The tooling that builds and reviews this app, already in place. | none, in use | Standard API token rates |
| 71 | GitHub Actions | GitHub | LOOP_ENGINEERING, all five loops | The machine builds what the owner asks on a ticket and checks the live site every two hours. | none, in use | Free on public repos |
| 72 | Standard hosted runners | GitHub | The three gates | Builds cost nothing and finish in minutes. | none, in use | $0 on public repos |
| 73 | Actions dependency caching | GitHub | The three gates | Builds finish faster while you are waiting on an autopilot ticket. | none, in use | 10 GB free per repo |
| 74 | REST and GraphQL APIs | GitHub | Loops 1, 3, 4, 5 | Already working, with room to spare. | none, in use | Free |
| 75 | GitHub CLI | GitHub | promote.yml | Already working in the pipeline; note it is not installed in the local sandbox. | none, in use | Free |
| 76 | Git-connected deployments | Vercel | ENVIRONMENTS: develop to dev, main to live | A fix is on the store's phones minutes later, with nobody copying files to a server. | none, in use | Included |
| 77 | Preview deployments | Vercel | ENVIRONMENTS dev/prod separation | The owner can try a change on a practice copy with invented data before it touches the real ledger. | none, in use | Included |
| 78 | Cron Jobs | Vercel | Daily due-date email (shipped) | One email a day naming what is due and overdue, without anyone remembering to check. | none, in use | Included |
| 79 | Environment variables and secrets | Vercel | Invariant 7; rotate the demo password | The store's keys are never in the code, and a key can be swapped without touching the app. | none, in use | Included |
| 80 | Domains and DNS | Vercel | DOMAIN_EMAIL; the app on its own domain | Staff reach the app at the store's own address, and the store's email keeps working because nobody moved it. | none, in use | Included |
| 81 | CDN | Vercel | Platform baseline | Screens load quickly on a phone in the back room. | none, in use | Hobby 1M edge requests, 100 GB transfer |
| 82 | Platform DDoS mitigation | Vercel | Availability | The app stays up if someone floods it with traffic. | none, in use | Free and unmetered |
| 83 | Resend Free tier | Marketplace | Due and overdue alerts | Nothing to buy for one email a day. | none | $0 |

### What each one means in practice

**1. Supabase Pro plan.** Change the plan, then confirm a backup actually appears the next day rather than assuming it did. Pro also stops the dev project pausing after a week of inactivity and lifts the two-active-project cap, which is exactly the prod plus dev pair in `ENVIRONMENTS.md` with no room for a third.

**2. Daily backups.** Arrives with Pro, seven days of them. Record in `PLATFORM.md` what it does and does not cover: the physical backup is the database, not the documents bucket, so the invoice photos still need item 4.

**3. Supabase on the Marketplace.** Adopt the plan, not the migration. Do not move the existing production project under the Marketplace integration to consolidate billing; that changes the ownership of a live database for an accounting convenience. Point-in-time recovery stays declined because it replaces daily backups rather than adding to them.

**4. Amazon S3 Standard.** One versioned bucket in ca-central-1, an IAM user with PutObject and nothing else, and a weekly job in the existing GitHub Actions workflows that pushes a `pg_dump` plus any new invoice images. The app's read path does not change: `docUrls()` keeps serving Supabase signed URLs. Do not use S3 as a replacement for Supabase Storage, which would split invoice images across two providers and contradict what the owner has been told.

**5. S3-compatible Storage protocol.** This is how item 4 reads the bucket: a standard tool copies every object with no new vendor and no code in the app. One hard rule, because the server-side S3 access key bypasses RLS across all buckets: it belongs to the backup job only, never in the app, never in the repo, and it gets rotated if it is ever pasted anywhere.

**6. Push protection.** On by default for user pushes to public repos; enable it explicitly at the repository level so it also covers the autopilot, which commits unattended. Secret scanning tells you after the fact; this stops the commit landing.

**7. Secret scanning alerts.** Turn on and read what it finds in the existing history. The serious one to look for is `SUPABASE_DB_URL`, a direct Postgres connection that bypasses row-level security entirely.

**8. Actions environments.** Move `SUPABASE_DB_URL` out of repository secrets and into a `production` environment scoped to `migrate.yml`, and the dev URL into a `dev` environment. As a plain repository secret it is readable by every workflow, including the 45-minute autopilot job where a model is writing code.

**9. Repository rulesets.** A branch ruleset on `main` that requires a pull request for every change, with no required approvals, and blocks force-push and deletion. A push ruleset restricting `.github/**`, `.claude/**` and `supabase/**` is the second half of this item. Add no required status check yet: `promote.yml` opens its pull request with `GITHUB_TOKEN`, checks do not start from that event, and a required check would hold the promotion forever. Read the GitHub Apps row in the next section before adding one.

**10. Publishable and secret API keys.** The legacy anon and service_role JWTs stop working December 31, 2026, and this app runs on both. Both systems work in parallel today, so this is a calm afternoon now or an outage later. `sb_secret` keys are also rejected from browsers with a 401, which is a backstop against the service-role key ever reaching client code. Remember that `NEXT_PUBLIC_` values need a redeploy, in two Vercel projects.

**11. Vercel Functions: region and body limit.** Two fixes on one feature. Add `"regions": ["yul1"]` to `vercel.json`; today functions default to Washington DC while Postgres sits in Toronto, and `docs/owner-notes/store-app-infrastructure.html` tells the owner in writing that staff information never leaves Canada. Separately, `src/app/capture/page.tsx:114` base64-encodes the invoice photo into a JSON POST, and base64 inflates by a third against a 4.5 MB platform cap, so a photo over roughly 3.3 MB fails at the edge before the route's own error handling runs. Downscale client-side before encoding, or upload to Storage first (capture already does this at line 197) and pass the path.

**12. Included quotas and overage rates.** Not a switch, a ceiling to read and write into `PLATFORM.md`. The database is comfortable; the 1 GB file bucket on Free is not, because invoice photos are the only thing here that grows without bound. Check the storage number quarterly so it never becomes the thing that stops capture in August.

**13. Spend Cap.** The only thing that enforces the $200/month ceiling from build spec section 8. Caveat worth knowing: with the cap on, exhausting a quota stops the service rather than billing overage. Pro's headroom is far past what this store generates, so the cap should never bite, which is why it is still the right call.

**14. Anthropic spend limits and workspace split.** `.github/workflows/jira-autopilot.yml` lines 50 and 106 use the same `ANTHROPIC_API_KEY` that powers the app, so the build loop and the store's capture path share one spend and one rate-limit bucket. Split them into two workspaces with separate caps. If a cap is hit, extract returns its existing error and the capture screen's manual-entry path still lets the store receive stock that day.

**15. OpenAI spend limits.** Set a hard project cap and a soft alert on the day the key is created, before the first call. Enforcement is not instantaneous, so recorded spend can slightly exceed the cap; set it low enough that this does not matter.

**16 and 17. Dependabot alerts and security updates.** Next.js is pinned at 14.2.5 with no update path running. Note the interaction, which is a good one: `package.json` is tier C in `classify-change.mjs`, so a Dependabot pull request can never merge itself. Switching this on adds no unattended-change risk.

**18. Dependency graph.** Normally on by default for public repos, so this is a verify under Settings, Advanced Security. Nothing above works without it.

**19. Vercel WAF.** Three custom rules on Hobby is enough. Use them on `/login`, to stop credential stuffing against Supabase Auth now that the app is reachable by name, and on `/api/extract`, which calls the store's Anthropic key. `resolveMember` gates that route in enforced mode, but a rate limit is the control that holds even if enforced mode is off or a session leaks.

**20. Security and Performance Advisor.** Run it, fix what it names, and add it to the `VERIFICATION.md` release check. It lints for exactly the regression the skill calls most likely: RLS disabled, RLS enabled with no policy, security-definer risk, public bucket enumeration.

**21. gpt-transcribe.** Test before you build. Run the three archived 2026-07-10 notes through the file endpoint first; if it returns fragments the way three local Whisper models did, stop, having spent under a cent. If it holds up, build it as a sibling of `/api/feedback-triage`: best-effort, off the critical path, writing a transcript column onto the feedback row while the audio stays attached, with ISO hints for `te` and `en` and a keywords list of store vocabulary. No dollar figure from a transcript may post anywhere. Add the second processor to the sentence in the owner infrastructure note that already says AI processing happens in the United States.

**22. Amazon Transcribe, batch.** The Canadian alternative for the same shipped hole: `src/app/suggestions/page.tsx` records voice notes into the documents bucket and nothing reads them back. Transcribe runs in ca-central-1, so the audio stays in Toronto. Wire it exactly like feedback-triage: the note saves either way and a failed transcription leaves the field empty.

**23. Transcribe te-IN.** This is what makes item 22 worth doing rather than theatre. Two honest caveats: code-switching inside one utterance is not a documented capability, so run each note through te-IN and en-IN and keep the better result, and present it as a draft the owner can correct. Do not judge it on the archived WhatsApp notes, which were 20 kbps mono; in-app MediaRecorder audio is better input.

**24. Structured outputs.** `src/app/api/extract/route.ts` strips code fences with a regex, then `JSON.parse` in a bare try/catch that returns 502 with no retry. The fence-stripping is evidence this has already happened. Two schema limits to design around: no minimum or maximum, so the 0 to 1 confidence range stays a prompt rule plus a client clamp, and `additionalProperties` must be false.

**25. Adaptive thinking.** Not a feature to add, a default to stop inheriting. Sonnet 5 thinks when the field is omitted, which all four routes do, and thinking bills as output against `max_tokens`. Extract sets 2000 for a payload whose length scales with line count, so a long invoice can spend the budget thinking and truncate mid-JSON, and because the route never reads `stop_reason` a truncation looks identical to malformed output. Raise extract to about 8000 and set thinking per route on purpose.

**26. Effort parameter.** The other half of item 25. Default is high on every call. Per-invoice extraction is a routine read that wants low or medium; ask-your-store is the one path worth high. Pick one level per route and hold it, since changing effort invalidates prompt cache.

**27. Refusal stop reason.** Ten lines across four routes. Sonnet 5 can return HTTP 200 with `stop_reason: refusal` and empty content, and every route does `content.find(c => c.type === 'text')` and carries on, so extract reports "could not parse model output" and ask returns blank. Low probability for retail invoicing, but this store sells regulated pesticides under a tracked licence, which is exactly the adjacent content a classifier false-positives on. Adopt the stop-reason branch; the fallbacks parameter stays declined.

**28. Vision input.** The ordering in the routes is already right: the image block comes before the text block. The gap is upstream, in the same client-side resize as item 11. Sonnet 5 caps at 2576px on the long edge and downsamples anyway, so resizing before upload loses nothing and costs less.

**29. Resend send-email API.** Two defects in one pass. `src/app/api/alerts/route.ts` sends no User-Agent header, which Resend rejects with 403, and when the Resend call fails the route returns HTTP 200 with `sent:false`, so an alert nobody received looks like a green cron run.

**30. Resend domains.** Step 3 of `DOMAIN_EMAIL.md`, already designed: verify the domain, set `ALERT_EMAIL_FROM=alerts@robinsonsgeneralstore.ca`, redeploy. The dependency is Vianet, which has no self-serve zone editor, so SPF and DKIM are a phone call.

**31. Auth rate limits and custom SMTP.** The built-in sender does two messages an hour, which will not onboard a season's staff and means an August password reset queues behind whatever else the project sent. Point it at Resend, which is already in the stack, and tune the OTP and signup limits in the same sitting.

**32. Email, password, magic link and OTP auth.** The code is shipped and waiting on the cutover. Turn on magic link for the owner specifically: he is phone-first and non-technical, and a password he has to remember is the most likely reason he cannot get into his own store's app on a Saturday.

**33. SSL enforcement.** Turn it on, then run one migration to confirm the workflow still connects. Leave the CIDR allowlist off: GitHub runner IPs rotate and would break `migrate.yml`, and restrictions do not cover PostgREST, Storage or Auth anyway.

**34. Deployment Protection.** Turn on Vercel Authentication now, which protects previews on both projects for free. Know the limit: Standard Protection does not cover production domains, and the dev project's production branch is `develop`, so protecting the dev site's own URL needs Pro's All Deployments scope. Do not apply it to the live project; staff need to reach the app without a Vercel account.

**35. CodeQL.** Use default setup rather than security-extended, to keep it quiet. It earns its place because an AI writes into `src/app/api/**` unattended every 15 minutes and `LOOP_ENGINEERING.md`'s stated principle is that the checks must be code rather than a model grading its own homework.

**36. Private vulnerability reporting.** One checkbox. The repo is public with the live production URL in its own description, so a finder's only other route is an issue that publishes the hole before it is fixed.

**37. GITHUB_TOKEN permissions.** Four workflows already declare permissions. `ci.yml` does not, so it inherits the repository default. Add `permissions: contents: read`.

**38. Concurrency groups.** Four of five workflows already have them, correctly using `cancel-in-progress: false` so a half-applied SQL run is never cancelled. `ci.yml` has none, so pushing twice leaves two runs racing.

**39. Workflow trigger events.** Two things to act on. Scheduled workflows auto-disable after 60 days of repository inactivity, which would quietly stop the autopilot, the promote loop and the health watchdog over a slow winter and be discovered in the August rush; keep a calendar note or a monthly manual dispatch. And never use `pull_request_target` on this repo, which is public: that trigger hands secrets to code from a stranger's fork.

**40. Promotion merge.** BUILT: `promote.yml` starts CI on the exact head commit, waits for it, confirms that `main` is still at the commit recorded before CI, and merges with the head commit pinned [R `.github/workflows/promote.yml:119-168`]. A person starts the workflow (docs/LOOP_ENGINEERING.md section 3).

**41. Instant Rollback.** Write two lines into `RUNBOOK.md`: environment variables are not re-applied on rollback, and cron jobs revert to the rolled-back deployment's state. Note the Hobby limit too, which is one step back only; with a 15-minute autopilot cadence that may not reach past the bad change.

**42. Observability.** Base is free and already there; the action is to read the Functions tab when the watchdog fires, because the health check proves correctness and cannot see crashes. The gap worth naming: Hobby keeps runtime logs one hour and `post-deploy-watch` runs every two hours, so a 6am crash is unreadable before anyone is told. Observability Plus stays declined.

**43. Log Explorer.** Nothing to build. It covers Postgres, Auth, Storage and PostgREST in one place, which is where an RLS denial or a storage policy failure actually shows up. Retention is the gate: one day on Free, seven on Pro, against a feedback loop where problems are reported a day or two later by WhatsApp.

**44. Sentry.** Two hard conditions: session replay off and PII scrubbing on, because replaying screens showing invoice dollars and HR records is a PIPEDA problem, and it must no-op with no DSN so the blank-env build in invariant 7 still passes.

**45. Vercel app for Slack.** Zero code, reads deployment status only. One explicit limit: do not wire comment-to-ticket conversion into the autopilot's queue, because ticket text is untrusted input the model reads as instructions, and that path widens who can inject into the build loop.

**46. Slack Free plan.** Nothing to buy. The only limits that could bite are the 10-app cap and 90-day history, and neither matters for deploy notices.

**47. AgentMail Inboxes API.** One inbox is the whole need. `invoices@robinsonsgeneralstore.ca` forwards into it, so vendors never see the AgentMail address and it can change without touching a vendor's file.

**48. AgentMail Threads and Messages.** The webhook carries an id, not content, so `messages.get` is the read half and is not optional. Adopt the message read only; threads and batch-update serve a mail client, which this is not.

**49. AgentMail attachments.** Fetch the attachment as an addressable object rather than a base64 blob in the webhook body, which is what keeps the intake route inside Vercel's request size limits and hands `/api/extract` the same bytes the camera path gives it.

**50. AgentMail webhooks.** `message.received` is the trigger for the feature. Verify the signature on every call, and key idempotency on the message id in Postgres, because the event array is declarative and a redelivery must not create a second draft invoice.

**51. AgentMail spam and blocked events.** Gate on the distinct `message.received.spam`, `.blocked` and `.unauthenticated` events so hostile mail never reaches a vision model. The sender allowlist itself does not live here: the owner asked for a list he can edit, and he cannot edit an AgentMail pod resource, so that is a store-scoped table with RLS, edited in the app.

**52. AgentMail scoped keys and idempotency.** This is the property that made AgentMail beat an IMAP poll in `DOMAIN_EMAIL.md` section 4. A key scoped to one inbox can be rotated without touching the store's mail and cannot read `info@`, `hardware@` or `drygoods@` if it leaks. The IMAP alternative would put a Vianet mailbox password in Vercel env.

**53. AgentMail as a Marketplace integration.** Already installed as of 2026-08-12, so finish it properly. The listing's template sets `OPENAI_API_KEY` and `EXA_API_KEY`; audit the project env and delete anything unused. Invariant 7 means a stray key will not break the build, which is exactly why an unused provider key can sit there unnoticed.

**54. AgentMail Free tier.** Stay on it. The send caps do not bind because this app never sends from AgentMail. The real ceilings are 3 inboxes and 3 GB of stored attachments. Support on Free is Discord only, which is worth knowing before an outage in season.

**55. Marketplace Integrations.** The remaining blocker on email intake is the owner creating `invoices@`, not the platform. Keep using Connectable Accounts style integrations rather than Native ones for anything holding store data, so the provider relationship and the region stay visible.

**56. Google Sheets API.** Blocked only on the owner sharing the two live workbooks. The pull mechanism already ships as `importBookingsV2`, which maps by header name and is idempotent. Read and write quotas are far above an hourly delta pass. Track Google's stated plan to charge for over-quota use later in 2026, though this workload will not approach quota.

**57. Google service account.** Named in `SYNC_PLAN.md` phase 2 as `GOOGLE_SERVICE_ACCOUNT_JSON`, and the only Google auth model that works for a server route with no interactive user. Access is granted by sharing a file with the robot's email address, which the owner already knows how to do. Private key lives in Vercel env.

**58. Storage buckets with RLS.** Already correct: private, authenticated-only, read through signed URLs in `src/lib/docs.ts`. While you are there, set the bucket's allowed MIME types and its own size ceiling, which are free hardening.

**59. Smart CDN.** Switches on with Pro and needs no code. The only action it implies is setting `cacheControl` at upload time when department photos land, so a tile is not refetched on every page view.

**60 to 64. Postgres, RLS, functions and triggers, PostgREST, Supavisor.** The foundation, all in use. Two operational notes worth writing down: major version upgrades run with downtime, so book one for February and never July or August; and Supabase has said it plans to change the platform default to revoke automatic grants to `anon`, `authenticated` and `service_role`, which would take every screen dark. Watch the changelog and confirm on the dev project first.

**65 to 67. Sonnet 5, PDF input, 1M context.** Nothing to do. Leave `ANTHROPIC_MODEL` unset. Record the 1M context in `PLATFORM.md` because it is the actual justification for deferring pgvector. Two caveats to hold: recall degrades as the prompt grows, so curation still matters, and the current tokenizer produces about 30 percent more tokens for the same text than older ones, so effective capacity is lower than a character count suggests. For PDFs, note the limits against email intake, where a vendor controls the file: 32 MB request, 600 pages, standard unencrypted PDFs only.

**68. Data retention posture.** DONE 2026-10-24: `PLATFORM.md` "What leaves Canada", one row per flow with what it sends, region and retention, each cited. One correction to the original note below: without a zero data retention agreement, Messages API content IS retained, for up to 30 days under Anthropic's commercial policy (updated 2026-07-01); it is not trained on. Write a `PLATFORM.md` section, do not buy zero data retention. The actionable part is that ZDR would not cover the Files API, MCP connector, code execution or Managed Agents, which is the standing reason all four are declined below. This matters because feedback-triage sends owner screenshots that can include the HR screen, and the ask context carries vendor phone numbers.

**69. Resend regions.** A fact to record, not a capability to build. There is no Canadian region and account data sits in the US regardless of the sending region chosen, so the daily alert already carries vendor names and dollar amounts through a US system. Pick the region deliberately and write it down the way the Anthropic API is already written down.

**70 to 75. Claude Code, GitHub Actions, runners, caching, APIs, gh.** In use and load-bearing. The only change is the workspace split in item 14. One small finding for local work: `gh` is not installed in the development sandbox, so a script that assumes it locally will fail even though the same script works in CI.

**76 to 82. Vercel deployments, previews, cron, env, domains, CDN, DDoS.** In use. Two things to remember rather than re-learn: environment variable changes apply only to new deployments, which is the reason someone adds a key and wonders why the live site still returns 500; and Hobby allows one cron a day with plus or minus 59 minutes of precision, so the due-date email can land any time before 10am and email intake could not poll more often than daily. Decline nameserver delegation to Vercel firmly: those nameservers carry the MX records for five live Vianet mailboxes.

**83. Resend Free tier.** One daily digest against a 3,000 per month allowance. The 30-day retention figure is the only one worth remembering, and only if Inbound is ever adopted.

---

## Adopt when needed

Nothing here is refused. Each one is a decision already made, waiting on a condition. If the condition is not true, the answer is no.

| Capability | Platform | Trigger | What it would give the store | Effort and cost |
|---|---|---|---|---|
| Token counting API | Anthropic | Email intake ships and senders control the attachment | An oversized file is told "send the pages separately" instead of failing with a technical error | hours; free |
| Textract AnalyzeExpense | AWS | The day the invoices@ pipeline posts an invoice with nobody watching | Two readers must agree on the dollar amount before a line goes green | days; $0.01/page |
| Textract async expense | AWS | AnalyzeExpense adopted and multi-page PDFs appearing in intake | A ten-page emailed statement is read fully instead of timing out | days; $0.01/page |
| Structured Outputs | OpenAI | Unattended intake, or a logged parse-failure rate on /api/extract | An invoice arriving at 2am produces a clean record or a clear failure, never a half-parsed one | days; no surcharge |
| Image input with detail control | OpenAI | Same trigger as above, evaluated as one bake-off | Better odds on the handwritten price in the margin | days; input tokens |
| Function Max Duration | Vercel | /api/import timing out on a full-season workbook, or extract on a long PDF | A big spreadsheet import stops dying halfway through | hours; no separate charge |
| Vercel Workflows | Vercel | Email intake shipped and producing more than a few dozen messages a day | An invoice that fails to read gets retried instead of quietly not arriving | weeks; $0.02 per 1K events |
| AgentMail custom domains | Marketplace | Vianet forwarding proves unreliable or strips attachments | One fewer place an invoice can go missing between vendor and app | hours plus a Vianet call; Developer $20/mo |
| Image transformations | Supabase | Department photo tiles ship | Tiles load quickly instead of pulling a phone-sized photo every time | hours; Pro, 100 origin images/mo included |
| Resumable uploads (TUS) | Supabase | Multi-page PDFs or voice notes routinely pass 6 MB, or uploads start failing | Uploads survive a rural connection dropping mid-file | days; free |
| JWT signing keys | Supabase | The enforced-auth cutover, before real staff accounts exist | No shared secret that could mint a token for the owner; capture and ask verify locally | hours; free |
| Multi-factor auth (TOTP) | Supabase | Enforced login is on and the owner account is used off site | A second factor on the one account that can create and delete logins | days; TOTP free |
| Auth Hooks | Supabase | Public email signup is ever left enabled | Registration restricted to the store's own domain | hours; free |
| pgvector | Supabase | POS sales import lands | Ask-the-store keeps finding the right record once the data no longer fits one prompt | days; free beyond compute |
| Embeddings | OpenAI | The same pgvector day | The vectors that make that search work, stored in Toronto | days; $0.02 per 1M (small) |
| Search result content blocks | Anthropic | The knowledge base outgrows one prompt, or the owner asks to see where an answer came from | An answer carries a trail back to the exact vendor record or note | days; ordinary input tokens |
| Tool use | Anthropic | Multi-store goes live, or years of history make preloading impractical | The assistant looks things up on demand instead of being handed everything | days; input tokens |
| Full-text search | Supabase | The owner asks to find an invoice or a note by words | Searching the store's own records instead of hunting Gmail subject lines | days; free |
| Generated columns | Supabase | The next time a money select is caught missing tax_mode | The store stops being one forgotten column away from a wrong amount owed | days; free |
| CLI type generation | Supabase | The next schema change | A column added in SQL but forgotten in the app fails the build, not the screen | hours; free |
| Supabase MCP server, read-only | Supabase | In use for docs and debugging only (`.mcp.json`, checked in CI). The database group waits until it points at dev, not production | A build session pulls advisors and logs itself instead of asking for screenshots | minutes; free |
| Supabase Cron (pg_cron) | Supabase | Scheduled work outgrows the single Vercel Hobby cron entry | Post-dated reconciliation runs without anyone opening a payments screen | minutes; free |
| Supabase Vault | Supabase | Something inside the database has to call out and needs a credential | One place for a database-side token, if one ever exists | hours; free |
| Compute add-ons | Supabase | A screen gets slow and Reports says compute is the cause | Headroom, bought only when measured | minutes; Micro $10/mo, covered by the Pro credit |
| Postgres extensions | Supabase | Per feature; pgcrypto is already in use | New capability with no new vendor | minutes each; free |
| Reports | Supabase | A screen gets slow, or the watchdog trips | Knowing whether Micro compute is still enough before paying for more | none; included |
| Temporary database access tokens | Supabase | A second person needs to run SQL, or the project is handed over | Time-boxed access instead of sharing the database password | minutes; not stated |
| Skew Protection | Vercel | The Pro move | Someone entering an invoice does not get a broken screen because the app updated mid-typing | hours; Pro, no separate charge |
| Spend Management | Vercel | The Pro move | An email if the bill climbs, with auto-pause left off so the app cannot switch itself off in season | hours; free on Pro |
| Streaming Functions | Vercel | The owner says Ask feels slow | The answer starts appearing instead of the phone looking frozen. Never on /api/extract | days; included |
| AI SDK | Vercel | Only if streaming ships, scoped to /api/ask | The cheapest correct way to stream, without touching extract | days; free |
| Streaming (SSE) | Anthropic | max_tokens on any route goes above about 16k, or answers grow long | Answers appear as they are written | days; free |
| Prompt caching | Anthropic | In use on /api/ask since #59 (from the #58 left-for-later list). Pays off only when a follow-up comes within 5 minutes, about 1 in 5 asks to break even. Reorder still waits for daily staff use or a scheduled summary | Slightly faster answers and lower spend | hours; cache read 0.1x input |
| Claude Opus 5 | Anthropic | A measured extraction failure rate the amber gate is not catching | A stronger reader in reserve, switched by one setting. Raise max_tokens first | minutes to switch; $5/$25 per MTok |
| Usage and Cost Admin API | Anthropic | Monthly spend crosses about half the working budget, or intake makes volume machine-driven | Spend attributed between the store's app and the build loop | hours; free |
| Bedrock, Vertex, Foundry | Anthropic | An AI feature has to read staff personal data under a formal residency commitment | A route to keeping document reading inside Canada | days; 10% regional premium |
| Vercel MCP | Vercel | The next deploy failure that needs digging | Faster diagnosis of a failed deploy, read-only, nowhere near the store's data | hours; no charge |
| Vercel CLI and REST API | Vercel | When the runtime errors API item gets built | The watchdog catches a screen that crashes for staff, not just a database mismatch | days; free |
| Attack Challenge Mode | Vercel | An actual attack | One switch that keeps the store working while it passes | hours for the runbook line; free |
| Runtime logs and OpenTelemetry | Vercel | A bug that only appears under real use and that /api/health cannot see, more than once | A trail for a crash that only happens on a staff member's phone | hours for logs; free |
| Reusable workflows | GitHub | A third workflow needs the same gate sequence, or the two copies disagree | The robot's self-check can no longer drift weaker than the pull request check | hours; free |
| Workflow artifacts | GitHub | When the Playwright screenshot pass is built | Seeing what a screen looked like, not just that it compiled. Never upload store data | hours; free |
| Deployment protection rules | GitHub | Dev is seeded from production data, or a second person gets write access | A database change cannot reach real records without an approval click | hours; free |
| SBOM export | GitHub | An insurer, supplier or privacy questionnaire asks what software handles store data | The answer is one click | minutes; free |
| Dependabot version updates | GitHub | Next.js 14 nears the end of its security support | The app stops drifting so far behind that a needed fix becomes a big upgrade | hours; free |
| Dependency review | GitHub | Tier C is relaxed for package.json, or outside contributions start | Automatic flagging of a risky new dependency | hours; free |
| Custom secret patterns and validity checks | GitHub | The first real secret scanning alert | Knowing whether the leaked key still works | minutes; free |
| Copilot Autofix | GitHub | The first CodeQL alert that is not a false positive | The repair drafted with the finding. Tier C still stops anything touching money | none beyond CodeQL; free |
| CODEOWNERS | GitHub | A second person gets write access | Money and schema files get the right reviewer. Today it would jam your own pull requests | minutes; free |
| GitHub MCP Server, read-only | GitHub | Reading failed Actions runs becomes routine in watchdog fixes | Failing logs read in the session instead of hunted on the website | hours; no charge |
| GitHub Apps | GitHub | Before or with any required status check on main | Prevents the promotion pull request stalling forever on checks that never start | hours; free |
| Fine-grained PATs | GitHub | The same trigger, as the lighter option | One credential, one repository, mandatory expiry | hours; free |
| S3 Lifecycle configuration | AWS | The archive passes roughly 100 GB, or the S3 line becomes noticeable | Old invoice photos age into cheaper storage on their own. Never add an expiry rule | hours; no config charge |
| Glacier Instant Retrieval | AWS | The same trigger | Old invoices cost a fifth as much and still come back instantly | hours; $0.005/GB-month |
| Glacier Deep Archive | AWS | The same trigger, for years four to six | The oldest required records cost almost nothing to keep | hours; $0.0018/GB-month |
| S3 Object Lock, Governance mode | AWS | An insurer, auditor or accountant asks for tamper-evident records | The archive cannot be wiped, even by someone who steals the keys | hours; no separate charge |
| Transcribe custom vocabulary | AWS | Vendor names come back garbled often enough to notice | Transcripts spell vendor and product names the way the store spells them | hours; no separate charge |
| gpt-realtime-whisper | OpenAI | The first transcript reads smoothly but the owner says it is not what he said | Insurance against a convincing wrong transcript, which is worse than none | days; $0.017/minute |
| gpt-4o-transcribe-diarize | OpenAI | A recording with two voices in it | Speaker labels when it matters who said which part | hours; $0.006/minute |
| Resend idempotency keys | Marketplace | The app emails a vendor for the first time | A vendor never receives the same payment notice twice | hours; included |
| Resend webhooks | Marketplace | The owner reports never receiving an alert, or vendor email starts | Confirmation the daily alert actually arrived | hours; included |
| Marketplace native integrations | Marketplace | Per service, after it has passed the four PLATFORM.md questions | One bill for services that were going to be adopted anyway | hours each; provider pricing |
| Axiom | Marketplace | The first bug where Sentry shows the error but not enough surrounding context | Logs kept long enough to investigate last week rather than last hour | hours; Personal $0 |
| Slack incoming webhooks | Marketplace | The next watchdog ticket that sits unread while the site is degraded | A site-is-broken message somewhere the builder sees on a Saturday | hours; free |
| Google Drive API | Marketplace | The owner would rather drop invoice PDFs in a folder than email them | Files reach the app without anyone downloading and re-uploading them | days; $0 today |

---

## Declined, with reasons

This section exists so the question does not get reopened every time someone opens a dashboard. If a decline is wrong, the way to change it is to name the requirement first.

### Vercel

- **Build Machines (Enhanced, Turbo, Elastic)**: paying per CPU-minute to shave seconds off a build nobody is waiting on.
- **Build Concurrency and on-demand builds**: builds take minutes and tickets arrive at human pace, so queueing costs nobody anything.
- **Remote Cache and monorepo support**: not a monorepo, nothing to share artifacts with.
- **Additional function runtimes**: all nine routes declare Node deliberately; a second toolchain doubles where you look when something breaks.
- **Large Functions**: beta, and it raises a limit the bundle is nowhere near.
- **Container Images on Functions**: no container workload, and it would add a Dockerfile to a repo whose automation depends on the gates staying simple.
- **Container Registry**: follows the container decline, an empty shelf with a credential attached.
- **Routing Middleware**: access is already decided twice on purpose, in the route and in Postgres. An edge layer is a third answer to "who is this person".
- **Vercel Queues**: the primitive under Workflows; adopting both is two moving parts for one need.
- **Vercel Sandbox**: there is no untrusted code to run, and the autopilot's blast radius is controlled by the tier classifier.
- **Vercel Services**: one Next.js app, no second backend to co-locate.
- **AI Gateway**: a layer that rewrites requests and fails over between providers, sitting in front of the route that reads dollar amounts. Failover is a correctness change nobody reviewed.
- **Vercel Agent**: `.claude/agents` already holds read-only reviewers that know this codebase's recorded money bugs; a general reviewer does not.
- **eve**: a beta framework that pulls Workflows, Sandbox, AI Gateway and Connect in together, wrapped around the code that reads invoice dollars.
- **MCP Server Hosting**: exposes the store's data as tools for an outside LLM host, for nobody who has asked.
- **v0**: the design system here is locked and deliberate; generated UI has to be argued back into house style every time.
- **Vercel Connect**: a beta credential broker for three keys is more moving parts than the three keys.
- **Vercel Blob**: would split invoice images across two providers and contradict the written statement that every uploaded photo lives in Toronto.
- **Global Config**: its three uses are flags, bulk redirects and IP blocklists, all covered or absent here.
- **Marketplace Storage (databases)**: re-provisioning Supabase through the Marketplace risks landing the ledger outside Canada for a billing convenience.
- **Incremental Static Regeneration**: every screen is role-scoped and money fails closed; a cached page is a page rendered for one role and served to another.
- **Partial Prerendering / Cache Components**: same objection, plus it needs Next.js 16 against a repo on 14.2.5.
- **CDN cache headers on API routes**: recorded as a "do not", so nobody adds caching to `/api/ask` as a performance fix later.
- **Image Optimization**: Supabase signed URLs rotate, so every page load is a cache miss and a new billed transformation. Downscale at upload instead.
- **Bulk Redirects**: one domain, no legacy URLs.
- **Microfrontends**: one app, one repo, one builder.
- **Rolling Releases**: canary percentages need traffic volume to mean anything; ten percent here is one person on one screen.
- **Deployment Retention**: unlimited by default is fine, and the six-year obligation is about store records, not build artifacts.
- **WAF Managed Rulesets and Bot Protection**: Bot Protection would challenge the health watchdog and the cron, turning the alarm that says the site is broken into a permanent false one.
- **BotID**: built for public checkout and signup abuse. There is neither.
- **Advanced Deployment Protection**: $150/mo to protect one dev site that Pro's existing scope already covers.
- **Passport**: requires an identity provider the store does not have.
- **Drains**: there is no SIEM and no requirement asking for log export.
- **Query and Notebooks**: custom charts over platform traffic for about a dozen users; the store's reporting need is about money and is built.
- **Web Analytics**: an internal tool with named users, where `activity_log` and the Feed already answer who did what.
- **Speed Insights**: the real question is whether receiving works on a phone in the back room, answered by standing there with a phone.
- **Feature Flags**: the dev site plus the QA-to-Approved gate already answer "try it before it ships"; a flag puts half-finished code in the production bundle instead.
- **Vercel Toolbar**: the owner feedback channel is the in-app Suggestions space, which takes a note, a screenshot and a voice recording.
- **Comments on Deployments**: duplicates Suggestions and needs the owner to hold a Vercel account.
- **Draft Mode** and **Edit Mode / Content Link**: both need a CMS. There is none.
- **OG Image Generation**: every screen is behind login.
- **RBAC and Access Groups**: the Vercel team is one person; the access control that matters is in the app.
- **SAML SSO and SCIM**: $300/mo to federate a one-person team against an identity provider that does not exist.
- **Audit Logs**: Enterprise only, and the audit trail that matters is `activity_log` in Postgres.
- **Static IPs**: nothing needs allowlisting.
- **Secure Compute**: Enterprise VPC peering for one app talking to managed Postgres over TLS.
- **Vercel for Platforms**: multi-store in the schema is real; serving many customer domains is a business the store is not in.
- **HIPAA BAA**: $350/mo for the wrong statute. PIPEDA is what applies here. The included attestations need no adoption.
- **Claim Deployments**: there is no handoff; the project is already git-connected with a live domain.

### Supabase

- **Disk configuration (io2)**: the included 8 GB and 3,000 IOPS covers this ledger for years, and disk size only ever increases.
- **Table partitioning**: the biggest table stays small enough that Postgres does not notice.
- **Database Webhooks**: duplicates the route handlers, and hangs an outbound HTTP call off writes to the ledger.
- **Supabase Queues (pgmq)**: the only queue-shaped backlog item is email intake, sized at a few dozen messages a day.
- **Foreign Data Wrappers**: there is no wrapper for Sheets, QuickBooks or the POS, which were the only reasons to want it.
- **Dedicated pooler (PgBouncer)**: duplicates Supavisor, and transaction mode would not even serve the migration case.
- **Read Replicas**: replication lag against a flow that posts a payment and immediately re-reads the derived status.
- **Point-in-Time Recovery**: about $100/mo, and it replaces daily backups rather than adding to them. Every dollar figure here is confirmed off paper that still exists.
- **Branching**: duplicates the dev project and seed script that `ENVIRONMENTS.md` already built.
- **GraphQL API (pg_graphql)**: a second query surface to secure, for a client style this codebase does not use.
- **Social / OAuth providers**: would put access to the ledger behind personal accounts the store cannot revoke.
- **Phone / SMS auth**: pays an SMS gateway to solve a problem the Team page already solves.
- **Anonymous sign-ins**: a session that reaches the ledger without anyone identifying themselves is the opposite of invariant 3.
- **Passkeys**: beta, device-bound, and the main login surface is a shared department laptop.
- **Enterprise SSO**: no identity provider to connect.
- **Third-party auth (Clerk, Auth0, Cognito, WorkOS)**: rewrites the one piece of security that is finished.
- **Custom claims and RBAC in the JWT**: a role baked into a token is stale until refresh, so a demotion would leave someone still seeing dollars.
- **Analytics Buckets (Iceberg)**: alpha, and there is no analytical workload to move off Postgres.
- **Vector Buckets**: alpha, and none of its five regions is Canadian.
- **Realtime Broadcast, Presence, Postgres Changes, authorization, quotas**: the notification bell already refreshes on navigation, focus, open and a timer, with fewer states to get wrong.
- **Edge Functions**, and its runtime limits, background tasks, ephemeral storage, regional invocation and scheduled variants: splitting server code across two runtimes doubles where you look when something breaks. Kept on record as the contingency if Vercel Pro were ever refused.
- **Automatic embeddings**: a pattern wiring together four things that are each declined above.
- **Supabase Pipelines (ETL/CDC)**: alpha, BigQuery-only, and there is no warehouse in this stack by design.
- **Log Drains**: $60 per drain per month to ship logs to a dashboard nobody would open.
- **Custom domains and vanity subdomains**: the Supabase hostname appears once, in an env var nobody sees.
- **IPv4 address add-on**: the session pooler already solves this and stays dual-stack.
- **HIPAA add-on**: there is no health information here.
- **SOC 2 and ISO 27001 tier**: $599/mo buys the paperwork, not different controls, and there is nobody to hand a report to.
- **Management API**: minting a project-level token to automate a job that happens twice a year.

### GitHub

- **Larger runners**: Team or Enterprise only, and the longest job spends its time waiting on an API, not on CPU.
- **Self-hosted runners**: dangerous on a public repo, where a fork pull request can execute code on the machine.
- **Matrix strategy**: one target, Node 20 on Linux, which is what Vercel runs.
- **Custom deployment protection rules**: requires building and hosting a GitHub App to gate against a change-management system that does not exist.
- **OIDC federation**: nothing in this stack can exchange the token. Scoping secrets to environments is the real fix.
- **Actions concurrency and usage limits**: ceilings, not a capability. Current usage is far inside every one.
- **GitHub Packages** and **Container registry**: nothing here publishes or consumes a package or an image.
- **Dependabot custom auto-triage rules**: fourteen dependencies do not generate enough alerts to need sorting, and it needs a paid licence.
- **Delegated bypass for push protection**: one person would be approving his own requests.
- **Security campaigns**: organises remediation across teams that do not exist.
- **Security overview dashboards**: a dashboard summarising one repository is that repository's own page.
- **GitHub Code Quality**: Team and Enterprise only, and it duplicates two reviewer subagents that know this codebase's actual failures.
- **Artifact attestations**: there is no artifact to attest; Vercel builds from source.
- **Immutable releases**: this project does not cut releases.
- **Repository security advisories**: the publishing half, for libraries other projects depend on. Nobody depends on this app.
- **Branch protection rules (classic)**: superseded by rulesets; running both means confusing precedence on the branch that deploys to the store.
- **Merge queue**: needs an organisation-owned repo, and there is never more than one change waiting.
- **Issues, issue types, sub-issues, issue forms**: the Jira board is deliberately the single queue, and the owner reports from inside the app.
- **Projects (v2)**: a second board that can drift from the one the autopilot, promote and watchdog all read.
- **Discussions**: there are two people and they already talk.
- **GitHub Pages**: duplicates Vercel hosting and adds a DNS record that needs a Vianet phone call.
- **Releases**: duplicates Vercel's deployment history, which already offers rollback.
- **GitHub Copilot (plans and credits)**: a second AI vendor in the build loop, which does not load `CLAUDE.md`, the skill, the reviewers or the Stop hook.
- **Copilot code review**: a general reviewer flags style and misses the specific money bugs this app has had.
- **Copilot cloud agent**: a second unattended agent writing to this repo that does not run `classify-change.mjs`.
- **Copilot CLI**: duplicates Claude Code, without any of this repo's configuration.
- **Copilot Spaces**: a second copy of the standards, living outside git where it can drift.
- **Agent HQ**: a second control plane; the Jira board is the design.
- **GitHub Sandbox**: isolation for Copilot agents that are declined, and there is no untrusted code to run.
- **GitHub Models**: retired 30 July 2026. Nothing to adopt.
- **Classic personal access tokens**: broad scope, no mandatory expiry, superseded by fine-grained tokens.
- **Webhooks**: nothing external is waiting to be told; the Jira link is pull-based by design.
- **Codespaces**: duplicates local development and the preview deployments that are already the practice site.
- **Git LFS**: would move invoice photos out of Toronto and into a public repository.
- **Enterprise administration (SAML, SCIM, EMU, audit log API, data residency, IP allow lists)**: one person, one personal account. GitHub data residency governs source code, not the store's records.

### AWS

- **Textract DetectDocumentText**: flat OCR text is less information than the image, and this store's invoices carry handwritten margin prices.
- **Textract TABLES**: costs more than AnalyzeExpense for less normalization, and nothing records line-item detection as a problem.
- **Textract FORMS**: five times the price to automate a typing job that happens a handful of times a year.
- **Textract QUERIES**: the AWS version of the grounded prompt already shipped, on a second vendor with a second key.
- **Textract LAYOUT**: improves reading order for an LLM that only gets text; this one gets the image.
- **Textract SIGNATURES**: no requirement asks whether a delivery note was signed; delivery state is already modelled.
- **Textract AnalyzeID**: extracting licence or passport fields for seasonal hires creates a privacy obligation the store does not have today.
- **Textract Custom Queries and adapters**: an annotation and training loop to fix a problem nobody has reported.
- **SES email receiving**: MX is domain-wide, so it would move all store mail off Vianet, including addresses vendors have used for over a decade.
- **SES actions (S3, Lambda, SNS, Bounce, Stop, Add header, WorkMail)**: all downstream of SES receiving. Bouncing an unrecognised vendor is also the wrong behaviour.
- **SES outbound sending**: duplicates Resend and adds another set of DNS records behind a phone call.
- **SES Mail Manager**: an organisation-wide mail gateway for five mailboxes.
- **SES Virtual Deliverability Manager**: inbox-placement tooling for one internal email a day.
- **S3 Glacier Flexible Retrieval**: lands between the two classes already chosen, with minutes-to-hours retrieval on records someone may be asking for on the phone.
- **S3 Intelligent-Tiering**: monitoring fees on many small objects can outrun the saving, and objects under 128 KB are never tiered.
- **S3 Standard-IA and One Zone-IA**: a 30-day minimum and retrieval fee to save about a cent per GB. One Zone is the wrong durability for six-year records.
- **S3 Event Notifications**: the pipeline it would trigger is declined; the archive is a scheduled push.
- **AWS Backup**: cannot see Supabase-managed Postgres at all, and its object storage price is more than twice raw S3.
- **AWS Backup Vault Lock**, **air-gapped vault**, **cross-Region copy**, **Backup Search**: all downstream of AWS Backup. If cross-region copy is ever needed, Calgary is the only destination that keeps the Canadian answer intact.
- **Amazon SNS** and **SQS**: carry messages between pieces that are all declined, and there is no burst to buffer.
- **EventBridge**: a routing layer that can rewrite requests, in front of routes that read dollar amounts.
- **EventBridge Scheduler**: the reliability gap it names is real, and the fix is a scheduled GitHub Actions workflow that already exists in the stack.
- **AWS Lambda**: no code for it to host; its job here was gluing declined pieces together.
- **Step Functions**: orchestrates a pipeline that is not being built.
- **Bedrock with Claude models**: from ca-central-1 every Claude model is Geo or Global routing, which makes the residency answer worse, not better, than the current plain statement.
- **Bedrock in-region models**: the ca-central-1 menu is two embedding models and Rerank, none of which can serve capture, ask, reorder or triage.
- **Bedrock application inference profiles**: does not fix the reason Bedrock is declined.
- **Bedrock Data Automation**: unverified in Canada, and it collapses extraction into a black box on the one path that owns the prompt, the confidences and the amber gate.
- **Transcribe streaming**: dictating on the shop floor is not a requirement, at a higher per-minute rate than batch.
- **Transcribe content redaction**: not supported for te-IN, which is the language the notes are actually in.
- **Amazon Translate**: Claude already translates the owner's Telugu and English inside the call the app is already making.
- **Amazon Comprehend**: both useful calls duplicate something already present.
- **Rekognition in ca-central-1**: the only in-region capability is face recognition, which is biometric data under PIPEDA with no requirement behind it.
- **Rekognition labels, text and moderation**: not available in ca-central-1, so it would break the residency answer for image data.
- **QuickSight**: duplicates the dashboard, reports and export screens, and a phone-first owner will not author datasets.
- **Amazon Q in QuickSight**: competes with ask-your-store, is listed as unavailable in Canada Central, and processes outside Canada.
- **Amazon Cognito**: store scoping and money gating ride on Supabase claims reaching Postgres RLS; swapping providers is a rewrite of the fail-closed rule.
- **AWS Amplify Hosting**: aims at a real risk that Vercel Pro closes with no migration, no DNS phone call and no loss of preview deployments.
- **AWS Secrets Manager**: adds a runtime fetch in front of every AI route, so an IAM mistake becomes a reason capture stops during receiving. Push protection is the cheaper control for the failure that actually happens.
- **AWS KMS**: required only by the declined SES path, and its encryption client has Java and Ruby SDKs only.
- **Amazon RDS for PostgreSQL**: cheaper on the instance line and far more expensive everywhere else, because it means re-implementing Auth, Storage and every RLS policy.
- **Aurora Serverless v2**: the seasonality instinct is right and the scale is wrong; the floor alone is more than Supabase Pro, with the same full rewrite.
- **Amazon Polly**: nothing asks for anything to be read aloud.
- **Amazon WorkMail**: duplicates the five Vianet mailboxes and does not remove the constraint that hurts, which is that DNS changes are a phone call.

### Anthropic

- **Claude Haiku 4.5**: standard-resolution vision against dense phone photos; cheaper reading that fires the human confirm gate more often spends the owner's time to save cents.
- **Claude Fable 5**: twice the price of Opus 5 for agent work this app does not do, and it requires 30-day retention.
- **Claude Mythos 5**: cybersecurity workflows, invitation-only, same retention requirement.
- **Legacy models still served**: Sonnet 4.6 costs more than Sonnet 5, so staying back is more money for less model.
- **Models API**: one model string with an env override; a runtime lookup adds a network call on the capture path.
- **Cache pre-warming**: presupposes caching, needs a persistent process, and every warm would expire before anything read it.
- **Message Batches**: the 50 percent discount is real and the volume is not, and a 24-hour expiry is wrong for an invoice that may need paying.
- **300k extended output for batch**: raises a cap nothing here approaches, and presupposes batches.
- **Fast mode**: Opus-only, doubles the price, and nothing streams.
- **Service tiers / Priority Tier**: not purchasable for new customers and unsupported on both models in play.
- **Rate limits and usage tiers**: facts, not a feature; the useful action is the workspace split.
- **Files API**: would put a second copy of invoice images on US infrastructure, and it is not covered by zero data retention.
- **Citations**: attaches to document blocks, and the store's grounding is rows. It also returns a 400 alongside structured outputs, which is the higher-value change.
- **Strict tool use**: presupposes a model writing payments, which the payments engine exists to prevent.
- **Web search tool**: opens a path for a price scraped from a website to sit in the same answer as a real invoice amount.
- **Web fetch tool**: same grounding objection.
- **Code execution tool**: charts already exist in `src/lib/charts` and workbook export already exists as `/api/export`.
- **Programmatic tool calling**: requires code execution and tools, and there is no fan-out to collapse.
- **Tool search tool**: worth it past a few dozen tools. This app has zero.
- **MCP connector**: the backlog items that look like matches are deterministic ETL, and putting a model in that loop makes a wrong number possible where only a wrong mapping is today.
- **Memory tool**: duplicates `knowledge_note`, which has attribution, RLS, store scoping and an audit trail that a memory directory does not.
- **Bash tool** and **text editor tool**: no shell workload and no files for a model to edit.
- **Computer use**: the supplier-portal case is real and still below the line, because it means a model placing orders, which moves money.
- **Advisor tool**: consults a stronger model inside an agentic loop this app does not have, and can return content the app cannot read.
- **Fine-grained tool streaming**: set on tool definitions that do not exist.
- **Task budgets**: not supported on Sonnet 5, and the minimum is ten times the largest route cap.
- **Server-side compaction**, **context editing**: both pace long conversations; every call here is single-shot.
- **Context awareness**: automatic on Sonnet 5 and free. Recorded as no action.
- **Mid-conversation system messages** and **tool changes**: no conversations, no tools, and contested or Opus-only availability.
- **Agent Skills on the Messages API**: the xlsx case is already built better by `/api/export`, which knows the relationships between tables.
- **Claude Managed Agents**: an agent platform for an app whose AI is four single-shot handlers, not covered by zero data retention, with transcripts persisting until deleted.
- **Managed Agents extras (memory stores, vaults, scheduled deployments, self-hosted sandboxes)**: all downstream, and each duplicates something already in place.
- **Claude Agent SDK**: builder tooling, and the loop already runs on Claude Code through the existing action.
- **Anthropic CLI**: its headline use is managing declined Managed Agents resources.
- **Admin API**: member and key management for an organisation of one, and new keys cannot be created through it anyway.
- **Covered Model 30-day retention**: the eligibility gate that keeps Fable 5 and Mythos 5 declined.
- **HIPAA readiness**: the wrong statute, and enablement is permanent and would strip Claude Code from the org.
- **Data residency (inference_geo)**: there is no Canada geo, so it charges a multiplier to pin inference to a jurisdiction that is not the one that matters.
- **Workload Identity Federation**: four environment variables and a documented silent-failure trap on the path the store receives stock through, for a one-person org.
- **Compliance API and Claude Code Analytics API**: audit feeds for an organisation that grew to a team. The six-year figure there covers developer sessions, not store records.

### OpenAI

- **GPT-5.6 Sol**: duplicates the model already running all four routes, and swapping the vendor on the capture path is the riskiest change available.
- **GPT-5.6 Terra**: the honest head-to-head for extraction, but a bake-off is not an adoption, and there is no recorded extraction complaint to fix.
- **GPT-5.6 Luna**: cheap bulk classification with no bulk classification workload.
- **GPT-5.5 and 5.5 Pro**: superseded by the vendor's own positioning, and 5.6 is not being adopted either.
- **GPT-5.4 family**: a coding tier for a repo whose coding automation already runs on Claude.
- **GPT-5.3-Codex**: direct duplicate of the existing build loop, touching no store feature.
- **Legacy families (GPT-5 to 5.2, o-series, 4.1, 4o, 3.5)**: published shutdown dates between October 2026 and January 2027.
- **gpt-oss-120b / 20b**: turns an API line into a GPU host somebody has to keep alive through August. Local inference has already been tried on this project's audio and lost.
- **GPT-5.6 Cyber / Daybreak**: the store's security posture is RLS, a WAF rule and secret scanning, none of which is a model problem.
- **Deep research models**: long sourced reports are the opposite of the plain checkable answer a non-technical owner can trust.
- **Long-context surcharge**: a pricing mechanic on models not adopted.
- **Responses API**: transport for models not adopted; the one adopted route posts a file to the audio endpoint.
- **Chat Completions and Assistants APIs**: Assistants shuts down 26 August 2026; Chat Completions is no longer recommended by its own vendor.
- **Conversations API and stored state**: a second home for store data in the US, for state this app does not keep.
- **Reasoning controls**: a new per-request sampling knob on the capture path, which is the exact bug class already recorded in a code comment in extract.
- **Compaction**: solves long-running context that does not exist here.
- **Function calling, custom tools with grammars, Tool Search, Programmatic Tool Calling**: parity with tools this app does not use, and moving multi-step money logic into model-authored code makes it unreviewable.
- **Skills**: the same open standard the repo already uses; a second copy is a second place for the invariants to drift.
- **Web Search tool**: every answer is grounded in the store's own tables, and nothing asks the app to look things up online.
- **File Search, Vector Stores and Retrieval**: would copy vendor notes and invoices into US or EU storage, when pgvector in Toronto is the recorded plan.
- **Code Interpreter**: the importers and the export are deterministic and testable; a sandbox that evaporates is worse for six-year records.
- **Shell and Apply Patch tools**: a second hosted execution environment doubles where you look when a build breaks.
- **Computer Use**: the POS-import case is exactly where it should be refused; a screenshot-and-click robot reading sales figures is a silent-wrong-number machine.
- **MCP tool and Connectors**: Sheets sync needs deterministic field ownership, and email intake already has a scoped-key mechanism chosen and installed.
- **Secure MCP Tunnel**: there is no private server to reach.
- **PDF and file inputs**: parity with what already works.
- **gpt-live-transcribe**: streaming captions for audio that is recorded and uploaded after the fact.
- **whisper-1 and the gpt-4o transcribe line**: already tried on this exact audio and lost, and the line retires 20 January 2027.
- **gpt-realtime-translate**: produces translated audio live; the need is typed English from a recording that already exists.
- **Realtime API**: a voice channel reaching store data would need the fail-closed money boundary rebuilt from scratch.
- **gpt-audio-1.5 and mini**: a conversational voice model answering a question nobody asked.
- **Text-to-speech**: no ask for anything spoken; the alert channel is decided and shipped.
- **GPT Image models** and the **image generation tool**: department photo tiles are the owner's own photographs by his own decision, and an invented product image beside a real shelf price would misrepresent the store.
- **Sora 2**: shutdown listed for 24 September 2026, and there is no video requirement.
- **Batch API**: parity with the Anthropic equivalent, and there is no batch workload.
- **Flex processing**: saves nothing measurable on a two-minute audio file while adding a retry path.
- **Fast mode**: capture latency is dominated by the person reading and confirming, which is a design choice.
- **Background mode**: tied to models not adopted, and the adopted route finishes in seconds.
- **Prompt caching**: the one OpenAI call is an audio file with no prefix to cache.
- **Predicted Outputs**: supported only on models retiring in October 2026, with no discount.
- **Token counting endpoint**: parity with the Anthropic count, and there is no token budgeting problem at this spend.
- **Supervised fine-tuning, DPO, vision fine-tuning**: winding down, and the fix for a bad extraction here is a clearer prompt a reviewer can read, not weights nobody can inspect.
- **Reinforcement fine-tuning**: locked to a legacy model at $100 per training hour.
- **Evals platform**: read-only 31 October 2026 and shut 30 November 2026. The underlying gap is real and the answer is a fixture suite in the existing CI workflow.
- **Graders** and **trace grading**: scaffolding for a shutting product and for agent loops this app does not run.
- **Prompt optimizer**: dies with Evals, and a machine rewrite of the prompt that reads invoice dollars would be hard to review.
- **Agents SDK**: direct duplicate of the SDK the build loop already runs on.
- **Sandbox Agents**: beta, and there is no untrusted code to run.
- **Agent Builder**: deprecated, shutting 30 November 2026. Take it as a reason to keep store logic in typed route handlers in this repo.
- **ChatKit**: shows a non-technical owner the machinery he was deliberately kept away from; the app has its own plain-words UI.
- **Rate limits and usage tiers**: metering. The transcription route is nowhere near any limit.
- **Webhooks**: pairs with Batch and Background mode, neither adopted.
- **Admin APIs, RBAC and Terraform provider**: the roles that matter are owner, manager, lead and staff, and they live in Postgres.
- **Workload Identity Federation and IP allowlist**: the workflows never call OpenAI, and Vercel functions have no stable egress addresses to list.
- **Private Link**: Azure-only, for an app hosted elsewhere.
- **Data retention and ZDR**: nothing to adopt; the default already commits to no training. The action is one documentation line naming the second US processor.
- **Data residency including Canada**: storage-only, so inference still happens outside Canada, which is weaker than what the owner has already been shown.
- **Enterprise Key Management**: customer-managed keys for stored data, when the adopted route stores nothing.
- **Moderation API**: the premise is untrusted public text, and Suggestions is authenticated, store-scoped and written by the owner and his own staff.
- **Bedrock deployment**: adds an AWS account with lower context caps and no capability gained.
- **Supported countries**: eligibility, not a product. Canada is supported, so nothing is blocked.

### Marketplace and third parties

- **AgentMail send, reply, reply-all, forward**: duplicates Resend and puts an autonomous send path on a route whose input is untrusted vendor mail.
- **AgentMail drafts and scheduled send**: the human confirm already exists on the Capture screen; moving it into an email splits one approval across two systems.
- **AgentMail WebSockets**: a Next.js route handler cannot hold a socket open, so this is not buildable on this host.
- **AgentMail labels**: intake state belongs in Postgres with store scoping and RLS, keyed idempotently on the message id.
- **AgentMail automatic labeling and extraction**: under development, and it would move dollar extraction to a vendor that does not return the per-field confidences the amber gate depends on.
- **AgentMail search**: the job is to drain the inbox into Postgres, not to become a mail client.
- **AgentMail pods**: scoped keys already give a second store the isolation it would need; multi-store is handled by `store_id` and RLS.
- **AgentMail IMAP and SMTP**: a serverless route cannot hold an IMAP session, and IMAP polling was the least-preferred option in the design.
- **AgentMail MCP server**: builder tooling, and it would give an interactive agent live read and write on the store's real invoice mailbox.
- **AgentMail SDKs, CLI and framework integrations**: both existing integrations call their vendor with plain fetch, and intake needs three endpoints; a new dependency on the path that reads invoice money is supply-chain surface bought for convenience.
- **Resend attachments, SMTP relay and React Email**: SMTP duplicates the working REST call, attachments would push store documents through a US mail system, and templating adds dependencies to one plain-text message.
- **Resend Inbound**, **Received Emails and Attachments APIs**: duplicates AgentMail, which was already chosen and installed. Kept on record as the named fallback, since the two-hop shape is identical and a switch would be a vendor swap, not a redesign.
- **Resend Broadcasts, Audiences and Contacts**: no marketing requirement, and it would upload a vendor and staff contact list into a US marketing system.
- **Resend MCP server**: would let an interactive agent send mail as the store.
- **Vercel Marketplace categories**: a catalog, not a capability.
- **Marketplace installs that write provider agent skills**: a CLI writing into `.claude/` is a change to the automation surface, which is tier C, and it defeats the pinned skill hashes.
- **Neon**: the ledger is already in Postgres in Toronto, and moving it breaks the residency story.
- **Upstash**: the login rate-limit need is answered by a WAF rule included on the plan, and the queue case duplicates the reasoning that already declined Workflows.
- **Other Marketplace databases and storage**: the store's data lives in one Postgres in Toronto, and splitting it is the specific complexity being guarded against.
- **Checkly**: duplicates `post-deploy-watch.yml`, which is better than an uptime probe because it verifies the app and the database agree on what an invoice owes.
- **Other observability and error trackers (Datadog, New Relic, Rollbar, Highlight)**: one error tracker is the decision and Sentry is it. Rollbar and Highlight are worth remembering only as the lighter swap if Sentry proves heavy against the blank-env build.
- **PostHog**: product analytics for an internal app, plus session replay on screens showing invoice dollars and HR records.
- **Clerk**: every RLS policy and the money gating key off Supabase Auth; swapping providers touches every policy to gain nothing asked for.
- **Other auth vendors (Auth0, Descope)**: same as Clerk.
- **LaunchDarkly, Statsig, GrowthBook**: flags were already settled by the preview deploy plus the QA-to-Approved gate; a different vendor does not reopen it.
- **Sanity, Contentful, other CMS**: there is no editorial content; the copy lives in the repo where it is reviewed with the code that shows it.
- **Algolia, Meilisearch, other search**: Postgres handles search at this size, and a hosted index would put store data outside Toronto and create a second source of truth. Exa and Parallel are web search, which answers a different question. Delete the unused `EXA_API_KEY` from the project env.
- **Slack Block Kit**: interactive buttons need another public endpoint and another external-action surface; plain text carries a deploy notice.
- **Slack Workflow Builder webhook triggers**: the trigger URL is an unauthenticated secret, and it is capped at one request per second.
- **Slack Web API rate limits**: a constraint, not a capability. The design note that follows from it is never to build a per-row notification loop.
- **Google Sheets hard limits**: nothing to adopt; the only figure the sync route needs to respect is the 2 MB recommended payload, handled by batching per tab.
- **Gmail API**: the store's mailboxes are on Vianet, so this does not reach the mail that matters.
- **Google OAuth client IDs and API keys**: a consent screen and a refresh-token store are states a phone-first owner would have to be walked through, and a revoked token stops the sync silently.
- **Google domain-wide delegation**: needs a paid Workspace and grants every mailbox in a domain to one key.
- **Google Workspace plans**: no purchase is required for the adopted path, which works with an ordinary account and a service account.

---

## Sequenced plan

Ordered by value to the store divided by effort plus risk. Wave 1 is settings changes that cannot break a screen. Wave 2 is code on paths that already exist. Wave 3 is new features, and it goes last because each one waits on somebody outside the build.

### Wave 1: one sitting, mostly dashboards (minutes to hours)

Do these before writing any code, because every one of them protects something that cannot be recreated and none of them can break the app during business hours.

1. **Supabase Pro, then confirm a backup appears.** This is the largest single risk on the list: today one bad script loses six years of vendors, invoices, payments and HR records with no way back. It is a plan change and a check the next morning. It also un-pauses the dev project and lifts the two-project cap.
2. **The GitHub security page, in one sitting.** Push protection, secret scanning, dependency graph, Dependabot alerts, Dependabot security updates, CodeQL default setup, private vulnerability reporting. All free on a public repo, all minutes, and push protection is the only control here that prevents an unrecoverable mistake rather than reporting one. Read whatever secret scanning finds in the history before moving on.
3. **`"regions": ["yul1"]` in `vercel.json`.** One line. It makes true a sentence the owner has already been given in writing, and it shortens every Supabase round trip from a cross-border hop.
4. **The three spend caps.** Supabase Spend Cap, Anthropic workspace split with per-workspace limits, and the OpenAI project cap set before the first call in step 11. Ten minutes for the guarantee that a bug cannot become a bill.
5. **Supabase hardening that costs nothing.** Turn on SSL enforcement and run one migration to prove the workflow still connects. Set the documents bucket's allowed MIME types and size ceiling. Run the Security Advisor, fix what it names, and add it to the `VERIFICATION.md` release check.
6. **Three one-line workflow fixes.** Add `permissions: contents: read` and a concurrency block to `ci.yml`, and verify auto-merge is enabled in repository settings, because if it is off the owner's Approved quietly does nothing. (The auto-merge half is moot since 2026-10-30: item 40.)

Why first: every item is reversible, none touches a screen staff use, and together they close the two failure modes that cannot be undone after the fact, which are losing the database and publishing a key.

### Wave 2: the shipped paths, in the order they hurt (hours to days)

7. **Downscale the invoice photo client-side to 2576px before encoding.** One helper, and it fixes three things at once: the 4.5 MB platform body limit that silently rejects a normal phone photo, the upload time on rural connections, and the token cost of an image the model was shrinking anyway. This is the defect most likely to be standing at the receiving door in August.
8. **Harden `/api/extract` in a single pass.** Structured outputs to delete the fence-stripping and the unretried 502, `max_tokens` raised to about 8000, thinking and effort set on purpose per route, and a `stop_reason` refusal branch that says something a person can act on. Four changes, one route, one review.
9. **Fix the daily alert's two defects.** Add the User-Agent header Resend requires, and make the route fail loudly instead of returning 200 with `sent:false`. Then verify the domain and set the FROM address, which needs the Vianet phone call, so start that call early.
10. **Scope the database credential and put the limits outside the loop.** Move `SUPABASE_DB_URL` into a `production` Actions environment used only by `migrate.yml`, then add the ruleset covering `.github/**`, `.claude/**`, `supabase/**` and force-push on `main`. Do these together, because they are the same argument: the automation should not be able to reach the keys or the rules that bound it. Read the GitHub Apps note before adding any required status check.
11. **Test transcription on the three archived notes, then build the route if it passes.** Cost of the test is under a cent, and it decides between two adopted options: `gpt-transcribe` first because it is one route and one endpoint, Amazon Transcribe te-IN in ca-central-1 as the answer if the residency question is raised or the first attempt fragments. Only build after a test result, and add the second processor to the owner's infrastructure note when you do.
12. **Stand up the off-site archive.** One versioned ca-central-1 bucket, an IAM user with PutObject only, and a weekly job in the existing workflows pushing a `pg_dump` and any new invoice images. The app's read path does not change. This is the half of the backup problem that Supabase Pro does not cover.
13. **Migrate to publishable and secret Supabase keys.** It has a date on it, December 31, 2026, and doing it in February costs an afternoon while discovering it in season costs the store its receiving system.
14. **WAF rules and dev-site protection.** Two rules, `/login` and `/api/extract`, plus Vercel Authentication on the dev project. Now that the app is reachable by name, these are the two doors worth a lock.
15. **Then the auth cutover.** Custom SMTP through Resend and tuned rate limits first, so a reset email actually arrives; magic link for the owner; JWT signing keys before real staff accounts exist, because rotating costs nothing today. Enforced login last, once those are in place.

Why this order: 7 and 8 are the store's hottest path and the one a seasonal employee meets first. 9 protects the only push the owner gets about money leaving. 10 through 14 are one-time debts with either a deadline or an unrecoverable failure behind them. 15 goes last in this wave because it changes how every person reaches the app, and it should land on a system whose capture path is already fixed.

### Wave 3: new capability, each waiting on somebody (days to weeks)

16. **Email invoice intake**, the moment `invoices@` exists. Build it in the order the data flows: inbox, webhook with signature verification, message read, attachment fetch, then extraction into a draft with the same human confirm. Idempotency keyed on the message id in Postgres. The sender allowlist is a store-scoped table with RLS that the owner edits in the app, not an AgentMail resource, because he asked to edit it himself. Gate on the spam and unauthenticated events so hostile mail never reaches a vision model. This is first in the wave because it removes a recurring manual job rather than adding a screen.
17. **Google Sheets sync**, the moment the two workbooks are shared with the service account. The pull half already exists and is idempotent, so phase 2 is mostly plumbing. Field-level ownership and conflict rules stay explicit and deterministic.
18. **Sentry**, with replay off and scrubbing on, and a no-op with no DSN. It goes after 16 and 17 because it is most useful once there are unattended paths whose failures nobody is watching.
19. **The small ones that make the rest supportable**: the Slack deploys channel, the rollback lines in `RUNBOOK.md` including the environment-variable and cron caveats, the residency paragraph covering Resend and the second transcription processor, and the storage-quota check on the calendar every quarter.

Why last: every item in this wave depends on a person outside the build doing something first, the owner creating a mailbox or sharing a workbook, so starting them earlier just means waiting earlier. They are also the only items here that add new surface, and new surface is cheapest to add once the paths underneath it have been fixed.
