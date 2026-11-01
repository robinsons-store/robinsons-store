# Supabase setup: every script and the order to run them

One page for the owner side of the database. All scripts live in supabase/ and every one is
idempotent: running a script twice is safe, so when in doubt, run it again.

## Fresh install (a brand-new Supabase project)

Run in the SQL editor, in this order:

1. `schema.sql` — every table, the payments engine functions, RLS enabled with the open
   demo policies.
2. `seed.sql` — the demo store, departments (including Payrolls & Taxes), demo accounts.
3. (optional) `auth_setup.sql` — ONLY when turning on enforced login
   (NEXT_PUBLIC_REQUIRE_AUTH=true): replaces the open policies with per-store, per-role
   policies and links Supabase Auth accounts to app_user rows by email.

## These run themselves now

Since 2026-07-31 a merge to main applies these scripts automatically
(`.github/workflows/migrate.yml`), so a merged migration no longer waits on somebody
opening the SQL editor. The order comes from `supabase/run-order.txt`, which is the single
list both this page and the workflow follow.

What is automated is only the APPLYING. A schema change still needs a person: `supabase/**`
never auto-merges, so a human reads the SQL and merges the pull request exactly as before.
The judgement stays human; the typing does not.

To switch it on, add the `SUPABASE_DB_URL` repository secret described in the next section.
Without it the workflow exits quietly and the list below stays a manual job.

`auth_setup.sql` is deliberately NOT automated. It swaps the open demo policies for locked
per-role ones, and running it while enforced login is off would lock everyone out of a
working store. That one stays a deliberate step, described at the end of this page.

## The live site will tell you which script is missing

If a ticket says the health check failed on something like "vendor columns present", the
failure now names the columns the database does not have and the one file that adds them,
for example "Run supabase/vendor_ordering_fields.sql". Find that file in the numbered list
below, run it and anything above it that has not been run, and the check passes on the next
deploy. Nothing is being diagnosed by hand: the deployed app compares itself against the
columns it needs and says which script closes the gap.
## The connection secret: one name, one source

Two separate things, and confusing them cost a day here, so they are stated apart:

**The NAME is `SUPABASE_DB_URL`.** Ours, not copied from anywhere. Exactly that, case
sensitive. For the dev database it is `SUPABASE_DB_URL_DEV`.

**The VALUE comes from Supabase**, never from Vercel. Vercel's Supabase integration does
hold the same connection string under `POSTGRES_URL_NON_POOLING`, but it is marked Sensitive
there, which means Vercel will not show it to you again after it is created. Going there
wastes a trip and puts the wrong name in your head.

Getting the value:

1. Supabase dashboard, your project, **Connect**, then **Direct, Connection string**.
2. Take the **Shared / session pooler** URI, port **5432**. It looks like:

       postgresql://postgres.<project-ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres

3. Replace `<password>` with the database password. If you never set one, Project Settings,
   Database, Reset database password. Nothing in the app reads that password, so resetting it
   cannot break the site.

Not the direct connection on `db.<ref>.supabase.co`: it resolves only over IPv6, and GitHub
runners have no IPv6 route, so it fails with a bare "network is unreachable" that reads like
an outage. Not the transaction pooler on 6543: it does not run every DDL statement reliably.
**Session pooler, port 5432. That is the only one that works.**

Where it goes:

    the repository on GitHub, Settings, Secrets and variables, Actions

It must be a **Repository secret on the Actions tab**. That page also has Codespaces and
Dependabot tabs and an Environment secrets section, and a secret in any of those is invisible
to the workflow. The symptom is not an error: the migration step reports `skipped` and the run
goes green, which looks exactly like nothing needing to be done.

The gate step prints the value's LENGTH, never the value. A length of 0 means the workflow
cannot see it under that name, whatever the settings page appears to show.

## Existing database: bring it current (2026-07 round)

Run in this order; skip nothing (each is safe to re-run):

1. `payments_v2.sql` — payments engine (allocations, statuses, record/void/EDIT payment,
   post-dated reconcile, PDC backfill), the method list, the confirmation-filing values
   including "both", and the payout categories including the new Payrolls & Taxes.
2. `credit_notes.sql` — the credit_note table (vendor credits for damage/returns).
3. `feedback.sql` — the Suggestions table (owner notes, screenshots, voice recordings).
4. `payout_fields.sql` — the SCRUM-9 field gaps: invoice.service_category and
   invoice.po_number, credit_note.credit_type.
5. `order_invoice_fields.sql` — the order and invoice fields the owner asked for on
   2026-07-27: invoice.tax_mode (how the invoice states its tax), invoice.delivered_date,
   invoice.delivery_comments, "partially delivered" as a delivery status,
   purchase_order.order_filing, and "in progress" / "approved" as order statuses. It also
   re-creates the status engine so a tax-included invoice is not charged its tax twice, and
   backfills tax_mode on every existing invoice from the HST figure already on file.
6. `filing_locations.sql` — where each confirmation is filed and, when it is digital, the
   link or path: invoice.invoice_filing, invoice.digital_file_location,
   purchase_order.digital_file_location, payment.digital_file_location. Asked for on
   2026-07-31 so "digital" stops meaning a file nobody can find again.
7. `vendor_ordering_fields.sql` — the vendor's ordering profile, asked for on 2026-07-31 and
   2026-08-05: vendor.minimum_order_amount with vendor.no_minimum_order (mutually exclusive,
   enforced by a check constraint rather than trusted to the form),
   vendor.summer_order_timeline, vendor.order_location plus order_location_other, and
   vendor.reorder_status with vendor.reorder_comments. Every column is optional, so the 130
   vendors already on file stay valid and blank until somebody edits them.
   **The vendor forms will not save until this has run**, because they write these columns.

8. `vendor_specializes_in.sql` — one column on vendor, `specializes_in`, for the trade a
   maintenance contractor does. The owner ticked this on 2026-08-13 when he marked up the
   vendor questions table; it is the only genuinely new question on that list. Until now the
   trade lived on each invoice and never against the person, so there was no way to answer
   "who is our electrician", which is what you ask when a freezer fails on a Saturday. Adds a
   column and nothing else, leaves every existing row null, and is safe to run twice.

8. `edit_delete.sql` — soft-delete columns and the inventory line notes (older databases
   only; harmless if already applied).
9. `ai_call.sql`: the AI call log behind the daily per-store cap. One row per AI call
   (store, screen, model, token counts, how it ended), never the question or the answer, and
   the two functions that reserve and finish each call. The cap and the log work as soon as
   this runs. Only the owner can read the rows once login is on; with enforced login, rerun
   `auth_setup.sql` after it to give the owner that read.
10. `money_by_role.sql`: staff never see a dollar figure, enforced by the database (ARCH-03,
   docs/adr/ADR-003-money-by-role-at-the-database.md). With enforced login it closes the nine
   tables that carry an amount to everyone but lead, manager and owner, and adds three views
   with no dollar column that the staff screens read (vendor_directory, invoice_due,
   insurance_renewal). On a demo database it only adds the views. It is the same block as
   `auth_setup.sql` section 3e, so either order ends the same. `money_by_role_test.sql` is
   its proof, for a disposable database only; it is never in the run order.
11. `documents_by_role.sql`: stored files fenced by store and role (ARCH-04,
   docs/adr/ADR-004-stored-files-by-store-and-role.md). With enforced login, a member opens
   only their own store's files: invoice photos only as lead, manager or owner, screenshots
   and voice notes also when they attached them, the workbook archive only as owner or
   manager. Files saved before the store folders are recorded once with their store, so none
   moves; it prints how many. On a demo database it changes nothing. It must run after
   `money_by_role.sql`, and it is the same block as `auth_setup.sql` sections 3d and 3f.
   `documents_by_role_test.sql` is its proof, for a disposable database with Supabase's
   storage schema only; it is never in the run order.
12. `feedback_summary.sql`: the AI's description of a suggestion screenshot gets its own table,
   `feedback_summary` (docs/adr/ADR-005-screenshot-descriptions-follow-the-screenshot.md).
   Descriptions already on `feedback.ai_summary` move into it, then that column is dropped.
   With enforced login a description opens to the members who may open the file it was read
   from (lead, manager and owner, and the member who attached the screenshot), and the
   database dates every save; on a demo database the table is open like the others. It must run
   after `documents_by_role.sql`, and it is the same block as `auth_setup.sql` section 3g.
   `feedback_summary_test.sql` is its proof, for a disposable database with Supabase's storage
   schema only; it is never in the run order.
13. `department_field.sql`: the table behind the Department fields screen. One row per box
   somebody changed: this department, this form (vendor or invoice), this question, asked or
   not. An empty table means every form asks its usual questions, so running it changes no
   screen. With enforced login it applies its own policies (every member reads, only the owner
   writes, nobody deletes), so the screen works without rerunning
   `auth_setup.sql`.
14. `auth_setup.sql`: ONLY if enforced login is on. Always re-run it LAST after any script
   above, because it (re)applies the per-store policies to every table including new ones.

## What each remaining file is

- `auth_setup.sql` — the enforced-auth policy set (per-store, per-role; app_auth helpers).
- The `documents` bucket: made by `schema.sql` (open, for the demo) and locked by
  `auth_setup.sql` sections 3d and 3f. Files sit under `<store_id>/invoices/`,
  `<store_id>/feedback/` and `<store_id>/imports/`; older ones keep their earlier names.

## After running scripts

- Vercel env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ANTHROPIC_API_KEY
  (AI features), ANTHROPIC_MODEL (optional; defaults to claude-sonnet-5),
  NEXT_PUBLIC_REQUIRE_AUTH ("true" for enforced login), SUPABASE_SERVICE_ROLE_KEY (imports
  in demo mode), plus Resend/CRON values if the daily email is wanted.
- Optional: AI_DAILY_CAP_PER_STORE, how many AI calls one store may make in a day (Ontario
  time) before the AI helpers pause until midnight. Unset means 100.
- Redeploy after env changes; NEXT_PUBLIC_ values are baked at build time.
