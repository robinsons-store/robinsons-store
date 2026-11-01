# Robinson's General Store: working context

Next.js (App Router, TypeScript) on Vercel ("robinsons-store", robinsons-store.vercel.app)
with Supabase Postgres/Auth/Storage (Toronto region) and the Anthropic API for extraction,
ask, reorder, and feedback triage. Non-technical owner; treat plain words in the UI as a
feature.

Product direction, delivery states and configuration gaps: docs/REQUIREMENTS.md, "Product direction".
Skill precedence: follow the repo-owned rule in root AGENTS.md, "Skill precedence".

Read before building:
- .claude/skills/robinsons-store/SKILL.md - the invariants; follow them on every change.
- .claude/skills/robinsons-store/references/standards.md - how every doc, decision record and review is
  written: status line, evidence tags, BUILT/PARTIAL/SCAFFOLDED/TARGET, basis footer.
- docs/AGENTS.md - every AI agent, in the app and in the build loop, and whose key it uses.
- docs/adr/ - decision records. ONBOARDING.md - forms and first week for a new member.
- docs/README.md - the index to every doc and the order to learn the components in.
- docs/REQUIREMENTS.md - the living requirements ledger (asks, states, open items).
- docs/PLATFORM.md - every service and plan in use, what is adopted and what is declined
  and why. Carries two open risks: the Vercel plan does not license commercial use, and
  Supabase Free takes no backups. Check it before adding any service.
- docs/HANDOVER.md - what the store owns on each service, the register of every secret and
  variable, and what is still open. Add any new secret or service there.
- docs/ENVIRONMENTS.md - production (`main`, live database) and dev (`develop`, its own
  database of invented data). Every preview reads dev; only the live site reads production.
- docs/STATUS.md and docs/VERIFICATION.md - build state and sign-off; update both in the
  same PR as the work.
- docs/OWNER_NOTES.md - the owner's feedback verbatim (Telugu translated), round by round.
- docs/SUPABASE_SETUP.md - every SQL script and its run order.
- docs/LOOP_ENGINEERING.md - how the automation builds and ships this repo, and why each
  limit exists. Read before changing anything under .github/ or .claude/.

Hard rules:
- Payments only through the engine RPCs (record_payment / void_payment / edit_payment /
  reconcile_postdated). Post-dated is a future-dated cheque, never a method.
- Store scoping + RLS on everything new (schema.sql AND auth_setup.sql 3a AND feedback-style
  migration for live databases). Money fails closed (canSeeMoney), in the database too: a table
  with a dollar figure goes in auth_setup.sql 3e and money_by_role.sql, not 3a. Stored files go
  under documentPath() (auth_setup.sql 3f and documents_by_role.sql). Soft voids only.
- Builds must pass with blank env. Gates: npx tsc --noEmit, npm run build, npm run lint.
- AI routes: grounded prompts, plain-text output (src/lib/aiText.ts strip), no temperature
  override (current models reject non-default sampling), default model claude-sonnet-5
  (ANTHROPIC_MODEL overrides).
- No em dashes in user-facing copy. Calm canvas; color = status only.
- BLUF in everything written to people (chat, PRs, Slack, docs): answer in the first
  sentence, then only facts that change the reader's next action. No recaps, no process
  narration. Status updates five lines or fewer.
- Anything the developer shares as personal reference (whose accounts are whose, employers,
  private services) is context only. Never write it into the repo, docs, commit messages,
  or pull requests. The store communicates only through its own automation, never through
  any account attached to a Claude session.

Agent tooling in this repo (Claude Code reads .claude/, Codex and other agents read
AGENTS.md and .agents/):
- Skills: robinsons-store (the invariants, always), supabase and
  supabase-postgres-best-practices (schema, RLS, queries), vercel-react-best-practices
  (React and Next.js performance, for new screens and data fetching). Vendored skills are
  pinned in skills-lock.json; update them with the skills CLI, never by hand.
- Reviewers: .claude/agents/invariant-auditor (any table, query, screen or route) and
  .claude/agents/money-reviewer (anything that changes a dollar figure). Both read only.
- MCP: .mcp.json points at the store's Supabase project, read-only. Writes to the live
  database go through supabase/ scripts and the migrate workflow, not MCP.
- The Stop hook (.claude/hooks/gate-typecheck.sh) blocks ending a turn on a type error.
