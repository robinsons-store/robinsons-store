---
inclusion: fileMatch
fileMatchPattern: "**/*.{ts,tsx}"
---

# TypeScript Coding Conventions

When working on TypeScript or React files in this project, follow these conventions strictly.

#[[file:.claude/skills/robinsons-store/SKILL.md]]

## General TypeScript Rules

- Strict mode is on (tsconfig strict: true)
- Target ES2020, module esnext with bundler resolution
- Path alias: `@/*` maps to `./src/*`
- Prefer typed Supabase rows over `any` casts in new code
- ESLint extends `next/core-web-vitals`
- Database identifiers are snake_case; application code follows existing TypeScript style

## Store Scoping (every screen)

- Every store-scoped screen reads through `useActiveStore()` and filters by the active `store_id`
- Every insert stamps `store_id`
- Child tables scope through their parent (no direct store_id needed if parent has it)
- Cancel stale queries on store switch

## Money Handling

- Hide cost and margin from the `staff` role with `canSeeMoney(role)` from `src/lib/auth.ts`
- This applies to: unit cost, order amounts, invoice amounts, payments, premiums, pay
- Retail (customer-facing) prices are NOT hidden
- Format all money with `formatCAD()` from `src/lib/format.ts`
- Compare dates with `todayISO()`, `daysOverdue()`, `dueBand()` from `src/lib/format.ts` (UTC-anchored, no DST drift)
- The notification bell, /api/ask, and reorder AI summary must NOT expose dollar amounts to staff

## Actor and Audit Integrity

- Use `useEffectiveActor()` for `created_by` and `activity_log.actor_id`
- Never use a raw dropdown id directly
- Hide the "Acting as" dropdown with `{!REQUIRE_AUTH && ...}` (it only shows in demo mode)
- Screens with no dropdown use `currentActorId(member)` from `src/lib/auth.ts`
- Never inline the localStorage/REQUIRE_AUTH switch logic
- Guard audit inserts: `if (actor)` so null-actor log rows never happen
- Feed deletes must be attributed to the signed-in member (or Acting-as pick), not null

## Auth Patterns

- `useAuthUser()`: the Supabase Auth user, subscribed to auth state
- `useMember()`: the app_user row whose auth_id matches the signed-in user. Degrades to null (no throw) when env is blank
- `useEffectiveActor(users, actorId)`: returns actor id and role. In enforced mode always the signed-in member
- `useCurrentRole()`: the role for screens with no dropdown. Defaults to owner in demo
- `REQUIRE_AUTH` is read once from `src/lib/auth.ts`
- AuthGate (src/components/AuthGate.tsx) sends anyone without a session to /login

## Edit and Delete

- Gate with `canEdit(role)` from `src/lib/edit.ts` (owner and manager only)
- Confirm every delete in the UI
- Use `voidRow()` for soft deletes (ledger and master data)
- Use `deleteRow()` only for shifts
- Filter every read with `.is("voided_at", null)` on voidable tables
- Voided rows must not count in: charts, dashboard KPIs, alert emails, weekly estimated pay, reorder inputs, capture vendor/order matching

## Document Handling

- Upload to the `documents` bucket via `supabase.storage`, at a path from `documentPath(storeId, kind, ...)` in `src/lib/documentPath.ts`; other paths are refused under enforced login
- Store the path on `source_file_path` or `confirmation_file_path`
- Read thumbnails through `docUrls()` from `src/lib/docs.ts` (signed URLs; no URL for a file the member may not open)
- Never use `getPublicUrl` directly as the primary read path

## Component Patterns

- Client components fetch with `useEffect`; route handlers under `src/app/api` do AI calls
- The app shell (AppShell.tsx) owns ALL chrome: sidebar, topbar, phone tab bar, More sheet
- Screens never draw their own navigation
- Page scaffolding: every screen opens with `page-head` pattern (page-title, page-sub, page-actions)
- Tables use `tbl-wrap` and `tbl` classes

## API Route Patterns

- All routes resolve the caller through `src/lib/serverMember.ts`
- In enforced mode: require a signed-in member; queries run as the caller so RLS applies
- /api/alerts uses the service role (cron has no session), requires CRON_SECRET once auth is on
- Model failures return a non-2xx status with the plain sentence from `failureMessage()` in `src/lib/anthropic.ts`, never the provider's raw error
- The `/api/extract` route uses a strict JSON-only contract with Claude vision
- Guard against duplicate payments on retry

## Navigation Model

- Managers/owners: grouped sidebar (Today, Money, Store, People, Property, Admin) from `src/lib/nav.ts`
- Staff/leads: four-item experience
- Phones: bottom tab bar with Capture in thumb reach + More sheet

## Build Safety

- Code MUST build with blank env vars (SUPABASE_URL and ANON_KEY empty)
- Auth and data helpers degrade to null rather than throwing
- Never require Supabase env or auth.users to exist at build time
- SUPABASE_CONFIGURED is false when env is blank; screens show a "Connection" card

## Recurring Tasks Pattern

- Use `completeTask()` from `src/lib/tasks.ts` for task completion
- It stamps `completed_at` and rolls `due_date` one cadence forward (month-end safe)
- Use `dueToday()` and `completedToday()` from the same module for dashboard KPIs

## Import Patterns

- Bookings import: idempotent by vendor name (src/lib/importBookings.ts)
- Schedule import: deduped by employee name and shifts (src/lib/importSchedule.ts)
- Inventory import: upserted by SKU then name, idempotent by file name (src/lib/importInventory.ts)
- /api/import auto-detects which workbook type was uploaded

## Privilege Escalation Prevention

- A manager can NOT create or remove an owner from the Team page
- /api/admin/users enforces this server-side
