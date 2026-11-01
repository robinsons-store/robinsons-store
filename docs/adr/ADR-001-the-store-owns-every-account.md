# ADR-001: The store owns every account the app runs on

| Field | Value |
|---|---|
| Status | ACCEPTED, 2026-10-24; carried out 2026-10-25 (hosting and code under the store). What is left is tracked in docs/HANDOVER.md, "Still open" |
| Proposer | The developer |
| Deciders | Ravi Kiran, store owner (approver) |
| Technical owner | Whoever holds the admin@ vault |
| Supersedes | Nothing. First decision record in this repository |

## Context

The store already owns its domain and its Vianet account, under 1000476363 ONTARIO INC.
[R `docs/DOMAIN_EMAIL.md:29`]. On 2026-10-18 it also gained a store mailbox,
`admin@robinsonsgeneralstore.ca` [D: Vianet mailbox list as shared by the developer; Ravi
Kiran to confirm]. Everything else is held by the developer:

- The database organization is on Supabase **Free** [V-run, Supabase get_organization,
  2026-10-24], which takes no backups at all [R `docs/PLATFORM.md`, risk 2], against a
  six-year Canadian record-keeping obligation on the ledger it holds.
- The hosting project sits on the developer's personal Vercel team [V-run, Vercel
  get_project `accountId`, 2026-10-24], on Hobby, which Vercel restricts to non-commercial use
  [R `docs/PLATFORM.md`, risk 1].
- The code, the deploy and migration secrets, the AI key, and the Slack app are reachable
  only through the developer's own logins [R `docs/HANDOVER.md`, register].

Not deciding has a specific failure: if the developer becomes unavailable, the store cannot
recover its hosting, its database or its code, and its data has no backup to recover from.

## Decision

1. **One identity.** Every service account the app depends on is opened with
   `admin@robinsonsgeneralstore.ca`, never with a person's own email.
2. **One owner.** Each account is owned by the store's organization or team on that service,
   billed to the store's card, with billing email admin@.
3. **Least role for people.** People, the developer included, hold the smallest role that lets
   them work: Developer on Supabase, Member on Vercel, Write on GitHub. Owner roles belong to
   the store's identity.
4. **Plans that fit a business.** Supabase moves to Pro for daily backups; Vercel moves to Pro
   because Hobby does not cover commercial use.
5. **New services start right.** Anything added after this decision is opened as the store
   from day one, and gets a row in the docs/HANDOVER.md register in the same change.

## Conditions

These are commitments that come with the decision and are tracked as delivery items in
docs/HANDOVER.md.

1. The admin@ password and every recovery code live in a vault the store owns, with the
   master password held on paper at the store and by Ravi Kiran (A-03).
2. Each Owner-level account has a **second** store-controlled owner before the developer's
   owner rights are removed, so one lost login cannot lock the store out (A-05, A-06).
3. Every secret tied to a person's account (`VERCEL_TOKEN` always; the rest if the developer
   leaves) is reissued under the store and the old one revoked (A-02).
4. Both plans in ruling 4 are on the store's card (A-01).

## Consequences

Accepted costs:

- About $45 a month more: Supabase Pro $25 and Vercel Pro $20 per seat [R `docs/PLATFORM.md`],
  plus $20 for each additional Vercel seat a person needs.
- One more inbox to watch: invites, receipts and security notices all arrive at admin@.
- A short window of broken links while the repository and the Vercel Git connection move.

Benefits:

- Daily backups of the ledger exist for the first time.
- The store's hosting is on a plan that covers its use.
- Any one person can leave, including the developer, without the store losing access to
  anything.

## Alternatives considered

- **Keep the developer's accounts and add the store as a member.** Rejected: ownership, and so
  recovery, would stay with one person; the plan risks stay unsolved.
- **Ravi Kiran's personal email as the identity.** Rejected: it ties the business to one
  person's mailbox; a role mailbox survives staff and ownership changes.
- **Vercel Claim Deployments link instead of a transfer.** Rejected: it suits a project with
  no team yet; this one already has a live domain and a Git connection
  [R `docs/CAPABILITIES.md:370`].
- **Move the Supabase project into a new organization.** Rejected: changing who owns the
  existing organization keeps every connection string valid and needs no redeploy.

## Related

docs/HANDOVER.md (the register and what is still open), docs/PLATFORM.md (the two plan risks),
docs/DOMAIN_EMAIL.md (the store's Vianet account), docs/AGENTS.md (which agents run on which
key), ONBOARDING.md (access for the next person).

**Basis: 6 claims checked this session (2026-10-24), 5 confirmed, 0 killed, 3 sources.**
Confirmed by reading the Supabase organization plan and the Vercel project's team from their
APIs, and `docs/DOMAIN_EMAIL.md:29`, `docs/PLATFORM.md` risks 1 and 2, `docs/CAPABILITIES.md:370`
from the repository. The admin@ mailbox stays `[D]` until Ravi Kiran confirms it in the
Vianet panel. Sources: Supabase API, Vercel API, this repository.

**Outcome, 2026-10-30.** The Vercel project is on the store's team `robinsons-store1` and the
repository is `robinsons-store/robinsons-store` [V-run, Vercel get_project and GitHub
list_branches, 2026-10-30]. One deviation from ruling 2: the repository is owned by admin@'s
GitHub account rather than an organization, so it cannot have a second owner yet (A-05).
Conditions 1 to 4 are open as A-01 to A-03, A-05 and A-06.
