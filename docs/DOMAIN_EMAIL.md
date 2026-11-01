# The store's domain and email: inventory, integration plan, runbook

Recorded 2026-07-27 from the owner's screenshots of the domain control panel (messages of
2026-07-21). This resolves the July 10 voice notes: they were about the store's own domain
and its email costs.

## Where this stands (DNS lines re-checked 2026-08-11; the rest is the 2026-07-31 snapshot)

| Thing | State |
|---|---|
| Domain robinsonsgeneralstore.ca | Owned. Auto-renew CONFIRMED ON by the owner. Was due 2026-10-16; **renewal not yet seen** as of 2026-10-18, see below |
| app.robinsonsgeneralstore.ca | RESOLVED 2026-08-11. Live, valid certificate, serving the app |
| That DNS record | DONE. The CNAME to cname.vercel-dns.com exists and resolves |
| robinsons-store.vercel.app | Live and working. Keeps working alongside the custom domain |
| Mailboxes | 6 of 10 used, none full (1000MB each), plan decided below. admin@ created 2026-10-18 as the store's login for every service (docs/HANDOVER.md) |
| stories@ alias | STILL forwarding store mail to the previous owners' personal Hotmail |
| invoices@ | Not created yet. This is what blocks the email-intake feature |
| Slack | Workspace being set up as robinsonsgeneralstore.slack.com, Vercel integration to a #deploys channel |

**Vianet login: https://myaccount.vianet.ca/**
**Vianet hosting support: 1-800-788-0363 ext 5214, Mon-Fri 8:30am to 5:00pm**

## Who hosts what

The domain, the mailboxes, and the store's internet are all **Vianet**
(myaccount.vianet.ca). "DOMAIN.CA" is the name of the registration plan, not the company;
an earlier version of this page had that wrong.

Account: **1000476363 ONTARIO INC.**, customer ID 616900, balance $0.00.
Service address: **1061 Main St, Dorset, ON P0A 1E0.** (This also settles an old open
question in the project skill, which carried 1062 Main St from the pesticide licence and a
note querying Atikokan. It is 1061.)

Two internet lines at the same address:
- `robinson2` STORE, business fibre to the node up to 16Mbps, active since 2004-06-24
- `via192055` 1061 MAIN ST 2ND FLOOR, residential DSL 15, active since 2021-04-23

Two ISP mailboxes separate from the domain ones: robinson2@vianet.ca (22.32MB of 250MB) and
via192055@vianet.ca (0.02MB of 1000MB).

## The domain

- **robinsonsgeneralstore.ca**, registered **2002-10-16**, plan DOMAIN.CA active since
  2006-10-17.
- **Expires 2026-10-16.**
- Email plan HST-EMAIL-1, max 10 mailboxes, about $10 per month, active since 2024-09-17.

## The one urgent thing: the domain expires 2026-10-16

That is roughly eleven weeks away. If it lapses, all of this goes at once: the website, the
five mailboxes, and app.robinsonsgeneralstore.ca once the app is on it. Renewing a .ca after
expiry is possible but there is a redemption window and a fee, and the mail stops in the
meantime.

Confirm auto-renew is on, or renew it manually. This is the single highest-value
five-minute job on the whole list.

**2026-10-18:** the date has passed. Auto-renew was confirmed on, so it most likely renewed,
but nobody has seen the renewal. `PRODUCTION_URL` has been set to
https://app.robinsonsgeneralstore.ca since 2026-10-25, so the watchdog now fails if the domain
lapses. Check the Vianet panel and write the new expiry date here (docs/HANDOVER.md, A-04).

## Mailboxes: 6 of 10 used (admin@ added 2026-10-18)

Read from the Vianet panel on 2026-07-31. **The quota is 1000MB per box, not 250MB.**

| Address | Named as | Used |
|---|---|---|
| drygoods@ | Drygoods Giftshop | 249.99MB / 1000MB (25%) |
| hardware@ | Hardware Department | 250.33MB / 1000MB (25%) |
| info@ | ROBINSON'S GENERAL STORE | 258.46MB / 1000MB (26%) |
| joanne@ | JOANNE ROBINSON (previous owner) | 0.05MB / 1000MB |
| redonion@ | Red Onion at Robinson's General Store | 78.85MB / 1000MB (8%) |

Alias: **stories@** forwards to robinsonsstories@hotmail.com.

### Correction: the mailboxes are not full

An earlier version of this page recorded three boxes as at quota and bouncing vendor mail,
and that was reported to the owner as urgent, twice, including on the Jira ticket. It was
wrong. The quota is 1000MB and the fullest box is at 26 percent. Nothing is bouncing and
nothing needs clearing.

What remains true is the **stories@** alias, which sends store mail to the previous owners'
personal Hotmail. Repoint it at info@ or delete it, unless that is deliberate.

## Integration plan (in order)

### 1. The app on the store's own domain (DONE, confirmed 2026-08-11)
**app.robinsonsgeneralstore.ca** is live and serving the Vercel app.

Verified 2026-08-11 from outside the network:

```
getent hosts app.robinsonsgeneralstore.ca
  76.76.21.98   cname.vercel-dns.com app.robinsonsgeneralstore.ca
  66.33.60.67   cname.vercel-dns.com app.robinsonsgeneralstore.ca

curl -sSI https://app.robinsonsgeneralstore.ca
  200, certificate verifies, <title>Robinsons General Store</title>
```

The CNAME `app` -> `cname.vercel-dns.com` exists, Vercel has issued the certificate, and
robinsons-store.vercel.app keeps working alongside it.

**History, kept because it explains the gap.** From 2026-07-31 to some point before
2026-08-11 this sat at "Invalid Configuration" waiting on that one record, and this page
recorded it as blocked on Vianet, whose self-serve panel has no zone editor (hosting:
1-800-788-0363 ext 5214). Somebody added the record in that window without it being noted
here, and a document written from this page on 2026-08-11 repeated the stale "waiting"
state to the owner, who corrected it. Two lessons: DNS state belongs to the network, not to
a file, so re-check it rather than reading it; and a dated snapshot needs its date read as
hard as its content.

Not done, and only worth doing if the store wants a public website on the apex later:
`robinsonsgeneralstore.ca` itself still serves the old Vianet site, and its HTTPS
certificate does not cover that name, so the apex over https shows a browser warning. It is
untouched by anything here and is a separate decision.

robinsons-store.vercel.app keeps working either way. No code change is needed for any of it.

### 2. Mailbox plan for the 10 slots
Decided 2026-07-31 with the owner's admin access confirmed. Five in use, five free, and one
more freed if joanne@ is retired.

**Keep all four working boxes.** They are not junk: vendors have had drygoods@, hardware@,
info@ and redonion@ for over a decade, those addresses are on old invoices and in vendor
address books, and deleting one silently loses mail from anyone who still uses it. Storage
is not a reason to remove any of them at 25 percent of quota.

| Address | Decision |
|---|---|
| info@ | KEEP. The front door. |
| drygoods@ | KEEP. Vendors know it. |
| hardware@ | KEEP. Vendors know it. |
| redonion@ | KEEP. The boutique still trades. |
| joanne@ | RETIRE, after archiving. Previous owner, 0.05MB, effectively empty. |
| stories@ (alias) | REPOINT at info@, or delete. It currently sends store mail to the previous owners' personal Hotmail. |

**Add, in priority order:**

1. **invoices@** Every vendor invoice goes here. This is the feed the email-intake feature
   reads, and it is the only new address that unlocks a build. Create this one first.
2. **owner@** Ravi. Better than a personal Gmail on anything the business sends.
3. **grocery@** Completes the department set alongside drygoods@ and hardware@.
4. **payments@** Remittance confirmations, so they are not scattered through info@.
5. **maintenance@** Contractors (Muskoka Wiring, Bacher and the like).

That fills the plan exactly at ten, with joanne@ retired giving one spare. If more are ever
needed the plan would have to move up a tier.

### 3. App email FROM the domain (daily alerts)
The daily due-date email (/api/alerts, Resend) can send as the store instead of a generic
address:
- In Resend: add domain robinsonsgeneralstore.ca; it issues SPF and DKIM DNS records.
- At the domain host: add those records.
- In Vercel env: ALERT_EMAIL_FROM=alerts@robinsonsgeneralstore.ca (display name
  "Robinson's General Store"). Redeploy.

### 4. Email invoice intake (the queued feature, now concrete)
Design (build when the owner says go):
- Vendors send invoices to invoices@robinsonsgeneralstore.ca. That is the address on the
  vendor's file and it never changes, whatever the app reads behind it.
- The mailbox forwards a copy to the app's inbound address. Three ways to provide that
  address, decided 2026-08-12:
  - **AgentMail (preferred).** A programmatic inbox reached with a scoped API key.
  - Resend Inbound. One fewer vendor, since Resend already sends the daily alert.
  - An IMAP poll from a Vercel cron. **Least preferred:** it needs the Vianet mailbox
    password in Vercel env, and that credential is worth more than this feature, since
    the same panel holds the store's other mailboxes.
  The API-key options win on that one point: a key scoped to one inbox can be rotated
  without touching the store's mail, and it cannot read info@ or drygoods@ if it leaks.
  Credentials live in env, never in the repo, whichever is chosen.
- Each attachment runs through the existing Capture extraction with a "from email"
  badge and the usual human confirm; the sender address must match a configurable
  allowlist (the "configure which emails" ask from the first feedback round).
This turns invoice chasing into a workflow: the invoice inbox is drained into the app
instead of sitting unread. (An earlier version of this line said "rotting at 250MB". That
was the same quota error corrected above: the quota is 1000MB and no box is close to it.
Storage was never the reason to build this; lost invoices are.)

### 5. Member logins on the domain (later, optional)
When enforced-auth accounts are re-issued, use real addresses (owner@, manager@) instead
of the demo ones; auth_setup links by email, so creating the Supabase Auth users with the
new addresses and updating app_user.email is the whole change.

## Who does what

- Owner or Raviteja in the DOMAIN PANEL: repoint or delete stories@; archive joanne@;
  create invoices@ (and any of the suggested boxes); and, when doing step 3, add the
  Resend SPF/DKIM records. (Two items were removed from this line on 2026-08-12: "clear
  the three full mailboxes", which was the corrected quota error and was never real work,
  and the Vercel CNAME, which is done and live.)
- Raviteja in VERCEL: add the custom domain; set ALERT_EMAIL_FROM after Resend verifies.
- The app (Claude, next build rounds): the email-intake pipeline of step 4 once invoices@
  exists and forwarding is chosen; nothing else needs code.

## Costs on record

About $10 per month covers the domain email plan (up to 10 boxes). The July 10 voice notes
discussed this cost; the number the owner quoted in chat is the plan price, and no new
spend is needed for any step above except optional Resend (free tier covers a daily email).
