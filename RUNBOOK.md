# Go-live runbook

The app code is done and hosted-ready. A few setup steps remain, and they need your accounts and secrets, so only you can do them. Each is quick. Do not paste any secret into chat; they go straight into Supabase and Vercel.

## What each piece is
- Supabase: the database, file storage, and login. Holds vendors, orders, invoices, payments, knowledge notes, maintenance, HR, and the uploaded invoice photos. Pick a Canadian region (Toronto).
- Vercel: where the app runs, the public web address staff and the owner open. It runs the code from GitHub.
- Anthropic API key: lets the capture screen read an invoice photo into fields and powers Ask and the reorder summary.
- Resend (optional): sends the daily payment due-date alert email.

## Step 1, Anthropic key (about 2 minutes)
1. Go to console.anthropic.com, sign in.
2. API Keys, Create Key, copy it. Keep it for Step 3.
3. Note the current Sonnet model id from docs.claude.com (the `ANTHROPIC_MODEL` value).

## Step 2, Supabase (about 5 minutes)
1. supabase.com, New project. Region: Canada (Central), Toronto.
2. SQL Editor: paste the contents of `supabase/schema.sql`, Run. Then paste `supabase/seed.sql`, Run.
   - Already have a database from before the payments upgrade? Run `supabase/payments_v2.sql` once instead of re-running schema.sql. It adds the owner's method list (Cash, Cheque, CC_Visa, CC_Mastercard, CC_AMEX, CC_Debit, E-Transfer, EFT, Other), vendor-level payments with reference and notes, multi-invoice allocations, partial payments, post-dated handling, and the record_payment/void_payment RPCs. If login is enforced, rerun `supabase/auth_setup.sql` after it (the payment policy now scopes through the vendor). Rerunning payments_v2.sql is safe and also loads the owner's department-level categories (DryGoods & Lakeside, Checkouts, Property Maintenance, Others; Clothing and Gifts become sections of DryGoods & Lakeside) and the workflow-sheet fields (invoice date, freight, delivery status, property-work fields, confirmation filing).
   - To load the full vendor ledger (all ~125 vendors with their orders, invoices, terms, and due dates), generate it on your own machine from the bookings workbook: `NODE_PATH=node_modules node scripts/generate-seed-bookings.mjs <bookings.xlsx> supabase/seed_bookings.sql`, then paste that file and Run. The file is store data, so `.gitignore` keeps it out of the repository; never commit it. It is safe to run on top of `seed.sql` (insert-if-not-exists by vendor name) and safe to re-run. Or skip it and load the sheet later from the in-app Import data page. The schedule load works the same way with `scripts/generate-seed-schedule.ts`.
3. Storage: `schema.sql` already creates the `documents` bucket and its upload policy, so capture works right after step 2. (If you prefer the UI: Storage, New bucket named exactly `documents`, set Public. Either way is fine.)
4. Project Settings, API: copy the Project URL and the `anon` public key. Keep for Step 3.
5. Confirm the load with this query:
   ```sql
   select 'stores' t, count(*) from store
   union all select 'vendors', count(*) from vendor
   union all select 'invoices', count(*) from invoice
   union all select 'knowledge', count(*) from knowledge_note
   union all select 'maintenance_tasks', count(*) from maintenance_task
   union all select 'employees', count(*) from employee;
   ```
   Expect stores 2, vendors 38, invoices 31, knowledge 10, maintenance_tasks 8, employees 3.
   (The second store, its 3 vendors, and the maintenance/HR rows are clearly marked illustrative in `seed.sql`.)

## Step 3, Resend for due-date alerts (optional, about 5 minutes)
The daily payment alert emails a summary of invoices overdue or due within 7 days. Skip this and the rest of the app still works; `/api/alerts` just reports that email is off.
1. resend.com, sign up. Add and verify your sending domain (or use a verified test sender).
2. API Keys, Create API Key, copy it for Step 4 (`RESEND_API_KEY`).
3. Decide the from address (a verified sender, `ALERT_EMAIL_FROM`) and who receives alerts (`ALERT_EMAIL_TO`, comma-separate for several).
4. Make up a long random string for `CRON_SECRET`. The daily cron sends it as the `x-cron-secret` header so only the cron can trigger the email.

## Step 4, Vercel (about 5 minutes)
1. vercel.com/new, connect GitHub, import the `robinsons-store/robinsons-store` repository.
2. Production branch: `main`. (Moving the existing project to the store's own account, rather
   than importing a new one, is in docs/HANDOVER.md.)
3. Environment Variables, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
   - `NEXT_PUBLIC_REQUIRE_AUTH` = leave unset/false for demo, true only after the auth cutover
   - `SUPABASE_SERVICE_ROLE_KEY` = the service_role key (Project Settings, API). Server-side only. Powers the in-app Team page (create and remove staff logins). Optional: skip it and add staff in the Supabase dashboard instead.
   - `ANTHROPIC_API_KEY` = your Anthropic key
   - `ANTHROPIC_MODEL` = current Sonnet id
   - `AI_DAILY_CAP_PER_STORE` = optional. How many AI calls one store may make in a day before the AI helpers pause until midnight. Leave unset for 100. To change it, edit the value in Vercel Environment Variables, then redeploy
   - `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO`, `CRON_SECRET` (only if you did Step 3)
4. Deploy. After import, every push to the branch redeploys automatically.
5. The daily alert cron is in `vercel.json` (runs `/api/alerts` once a day). Vercel registers it on deploy. To test it now, open `/api/alerts` with the `x-cron-secret` header set to your `CRON_SECRET`.
   - The schedule `0 13 * * *` is in UTC (Vercel crons always are), so it fires at 9 AM EDT / 8 AM EST.

## Step 5, tell me
Send me "done" plus the Vercel URL (not the keys). I will check the feed, dashboard, vendors, overdue, knowledge, price signs, maintenance, compliance, HR, and reports, then we test one real invoice through capture.

## Turn on login (real auth and per-role security, about 5 minutes)
The login, the per-store per-role database policies, and the storage lockdown are all built and
ready. Turning them on takes about five minutes and only needs your Supabase. Until you flip the
last switch the app keeps working, so you can do this whenever you want a real demo or before any
staff use. Login can't be on by default in the code because the accounts have to exist first, and
only you can create them in your Supabase. These steps create them, then turn it on.

1. Enable Email auth. Supabase, Authentication, Providers, turn on Email. Leave sign-ups off
   (there is no public sign-up; you create every account).
2. Add one account per role, each with the SAME email as its seeded member so linking is
   automatic. Authentication, Users, Add user (turn on Auto Confirm User so no email step):
   - `owner@robinsons.demo`   -> Ravi Kiran (owner, sees everything)
   - `manager@robinsons.demo` -> Demo Manager (sees money, manages members)
   - `staff@robinsons.demo`   -> Demo Staff (no costs, no amounts)
   - `lead@robinsons.demo`    -> Outpost Lead (second store, for the multi-store test)
   Pick any password you like for each; you will type it to sign in. Use real emails instead of
   these if you prefer; just set the same email on the matching member (auth_setup section 1b).
3. Run the cutover SQL. SQL Editor, paste all of `supabase/auth_setup.sql`, Run. It adds
   `auth_id`, creates the role and store helper functions, replaces the open dev policies with
   per-store per-role policies, makes the `documents` bucket private and fences its files by
   store and role, and links every account to its member automatically by email. It is idempotent; re-run it any time you add an
   account. It does not touch `schema.sql`.
4. Test BEFORE trusting it. Set `NEXT_PUBLIC_REQUIRE_AUTH` = `true` in Vercel (Settings,
   Environment Variables) and redeploy (it is a build-time public var, so a redeploy is
   required). Sign in as `owner@robinsons.demo` and confirm full access. Sign in as
   `staff@robinsons.demo` and confirm no costs, order or invoice amounts, payments, or totals,
   and that another store's rows are not visible. The policies are only as good as their test.

That is it: `/login` is now required and the per-store, per-role policies and storage lockdown
are live.

Adding staff later, without the Supabase dashboard: open the in-app Admin area, Team page. The
owner or a manager adds a member (email, name, role, password) and it creates their login and
links it in one step, or removes a member. This needs `SUPABASE_SERVICE_ROLE_KEY` set in Vercel
(see Step 4). The first owner account is still created in the dashboard once to bootstrap; every
member after that can be managed from the Team page.

To roll back to open demo mode, set `NEXT_PUBLIC_REQUIRE_AUTH` back to unset or `false`
and redeploy, and re-run the dev storage and table policies from `schema.sql` if you also need
anonymous writes again (otherwise reads and writes keep requiring a linked session).

## Before real staff use (later hardening, not blockers)
- Signed document URLs: DONE. The app reads thumbnails through signed, expiring URLs
  (src/lib/docs.ts) and `auth_setup.sql` now makes the `documents` bucket private, so no
  permanent public link to an invoice photo exists once you run the cutover. Since ARCH-04 it
  also fences each file by store and role (docs/adr/ADR-004-stored-files-by-store-and-role.md).
- Low-confidence dollar gate: DONE. Capture blocks the save until every amber line is fixed or
  explicitly confirmed, records the acknowledgement on the event, and a database trigger
  (in `schema.sql` and `edit_delete.sql`) refuses a low-confidence dollar line without it.
- Column-level cost hiding is enforced in the UI today and by the row-level DB policies in
  `auth_setup.sql`. Revoking the cost columns from the staff Postgres role is a further step.
- Rotate the Anthropic key and remove the credit-card number from the Lawson PO Drive doc (see
  docs/DATA_INVENTORY.md) before this is more than a demo.
