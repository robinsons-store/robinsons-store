# ADR-003: The database, not only the screens, keeps dollar figures from staff

| Field | Value |
|---|---|
| Status | PROPOSED, 2026-10-25 |
| Proposer | The developer |
| Deciders | Ravi Kiran, store owner (approver) |
| Technical owner | The developer |
| Supersedes | Nothing. Closes ARCH-03 in docs/ARCHITECTURE.md |

## Context

Staff never see costs, order or invoice amounts, payments, premiums or pay. Lead, manager and
owner do, and a missing or unknown role counts as staff [R `src/lib/auth.ts:38-40`]
[R `src/lib/serverMember.ts:18-21`]. Until this change only the screens and the API routes
applied that rule. At the database, every policy on the money tables fenced by store and
nothing else [R `supabase/auth_setup.sql` before this change, section 3a lines 108-126 and
section 3b]. The browser reads the database directly, so the role rule has to hold there too.

On a disposable copy carrying today's policy set, 57 of the 130 checks in
`supabase/money_by_role_test.sql` fail: the views and the role check do not exist yet, and the
money tables answer a staff session as they answer the owner [V-run, money_by_role_test.sql on supabase/postgres
17.11.0.005, 2026-10-25].

Two facts shape the fix:

- Every signed-in member uses the one `authenticated` Postgres role; every policy is written
  `to authenticated` [R `supabase/auth_setup.sql:111-133`]. A column cannot be hidden from one
  member and shown to another by privileges alone.
- The payment functions run as the caller (security invoker), not as their owner
  [V-run, `pg_proc.prosecdef` false for record_payment, void_payment, edit_payment,
  reconcile_postdated, recompute_invoice_status, payment_autoallocate, 2026-10-25]. Policies
  on the tables therefore govern them too.

Not deciding has a specific failure: ARCH-03 blocks making staff logins, and the store cannot
run remotely without them.

## Decision

1. **Nine tables close to staff.** Every table that carries a dollar figure opens only to a
   member whose role sees money, in their own store: vendor (minimum order), purchase_order,
   invoice, credit_note, insurance_policy, payment, payment_allocation, pay_rate,
   receiving_line (unit cost). One policy per table, `money_store_rw`, adds
   `app_auth.can_see_money()` to the store fence [R `supabase/auth_setup.sql:300-412`]. Staff,
   an unlinked account and anyone signed out get no rows and cannot write. A payment may only
   be allocated to an invoice in the member's own store.
2. **Capture still saves.** Any member of the store may add a receiving line, unit cost
   included, through `member_store_insert`; only a money role reads it back
   [R `supabase/auth_setup.sql:407-412`].
3. **Staff read three views with no dollar column.** `vendor_directory` (every vendor column
   but the minimum order), `invoice_due` (which invoices are open, their number, terms and due
   date) and `insurance_renewal` (policy names and renewal dates). Each view runs as the caller
   and reads through a definer function in `app_auth` that returns only the caller's store;
   both are rebuilt on every run so a column can be added later
   [R `supabase/auth_setup.sql:414-490`]. Money roles keep reading the tables. Capture and Ask
   read `vendor_directory`; the bell, Due and Compliance read the other two when the table
   gives a role nothing.
4. **One rule in three places.** `canSeeMoney` in the browser, `memberSeesMoney` in the API and
   `app_auth.can_see_money()` in the database name the same three roles.
5. **Applied without a person.** `supabase/money_by_role.sql` runs from `run-order.txt` on merge
   [R `supabase/run-order.txt:27`]. It locks a database with enforced login and only adds the
   views to a demo database, the same test `ai_call.sql` uses
   [R `supabase/money_by_role.sql:240-244`]. `auth_setup.sql` section 3e carries the identical
   block, so a later rerun keeps money locked.

## Conditions

1. A new table with a dollar figure goes into `auth_setup.sql` section 3e and
   `money_by_role.sql`, never the open 3a list. The project skill's invariant 6 says so.
2. `supabase/money_by_role_test.sql` passes on a fresh copy and an upgraded copy before any
   change to section 3e merges.
3. After the merge, two read-only checks on the live database:
   `select tablename, policyname from pg_policies where policyname in ('money_store_rw', 'member_store_insert')`
   returns 10 rows, and no money table still has a `member_store_rw` policy.
4. A staff smoke test once the first staff login exists: the bell, Capture, Ask, Due and
   Compliance work, and no dollar figure appears.

## Consequences

Accepted costs:

- Staff who open a manager screen by typing its address (Vendors, a vendor's ledger, Payments,
  Reports, Employees) now see empty lists, not lists without amounts. None of those screens is
  in the staff navigation [R `src/lib/nav.ts:70-76`]. Due and Compliance, which the bell links
  to, still list what is due without amounts.
- Edit roles at the database are unchanged by this decision.
- Three views and their functions must follow their tables. A vendor column staff should see
  means editing the view and its function, in both `auth_setup.sql` and `money_by_role.sql`.
- `item` stays outside this decision so the staff count and price-sign screens keep working;
  its follow-up is tracked privately.
- `department.target_margin` stays open: a percentage, not a dollar figure.
- Stored files are not covered by this decision. ARCH-04 tracks them.

Benefits:

- A staff login can be made without the database handing out money.
- The payment functions refuse staff with no change to the functions.
- Staff can no longer change an invoice, a payment or a pay rate through the API.

## Alternatives considered

- **Revoke the money columns from the shared role.** Rejected: one role serves every member, so
  revoking a column from staff revokes it from the owner, and the full export reads every
  column with `select("*")` [R `src/lib/exportPaging.ts:57`].
- **A second Postgres role for staff, set by a Supabase access token hook.** Rejected: it needs
  a dashboard step this repository cannot check, and with the hook off staff fall back to the
  shared role, so it fails open.
- **Views that run as their owner (security definer) with a store filter.** Rejected: Supabase's
  advisor reports every such view as an error, recommending `security_invoker=on`
  [V-src, supabase.com/docs/guides/database/database-linter lint 0010, 2026-10-25]. The
  function-backed views here run as the caller.
- **Move every money read behind the API.** Rejected: most screens read the database directly
  from the browser; that is a rewrite of every screen for the same result.
- **Leave it to the screens.** Rejected: that is ARCH-03.

## Related

docs/ARCHITECTURE.md section 7 and open items (ARCH-03 closed, ARCH-04 open),
docs/SUPABASE_SETUP.md (run order), `supabase/money_by_role_test.sql` (the proof),
docs/VERIFICATION.md (the sign-off row), ADR-001 (who owns the database).

## How this maps to the rest of the docs

The rule for screens is invariant 2 in `.claude/skills/robinsons-store/SKILL.md`; the table
rule is invariant 6 there. The live state of policies is read, not assumed: ARCHITECTURE
section 7 says when it was last read.

**Basis: 16 claims checked this session (2026-10-25), 15 confirmed, 0 killed, 4 sources.**
Confirmed by opening each cited file and line; by running `money_by_role_test.sql` against
copies built from this branch and from main before it (fresh and upgraded, enforced login and
demo) on supabase/postgres 17.11.0.005, and the app's own read and write paths through
PostgREST v14.18 with `@supabase/postgrest-js` 2.106.2 (48 of 48 paths); and by reading
Supabase lint 0010.
Sources: this repository, the local test databases, PostgREST, Supabase documentation.
