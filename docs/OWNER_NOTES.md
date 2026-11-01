# Owner notes and feature requests

A living document. Every feature idea, note, or document the owner shares gets recorded here,
refined into something buildable, and checked against what the app already does, so nothing is
lost and nothing is built twice. Edit freely; append new notes at the bottom with a date.

Last updated: 2026-07-31.

## Sources on file

1. The owner's notes relayed 2026-07-07 (preserved verbatim in the last section).
2. "Dorset Store Ops Hub, Project Execution Document" (PDF, AI-generated blueprint the owner
   received from prompting an AI; 5 pages).
3. Two AI-generated diagrams: an architecture diagram and a monthly budget infographic
   ($200 CAD cap, roughly $45 peak-season target).

## The uploaded blueprint vs the app that exists

The PDF describes the product this repo already is. It was generated without knowledge of this
codebase, so it proposes building from zero on Replit with OpenAI. Item by item:

| Blueprint item | Status here |
|---|---|
| PostgreSQL database (departments, employees, vendors, tasks) | Built, and richer: the schema also covers orders, invoices, payments, receiving, counts, pay rates, shifts, licences, insurance (`supabase/schema.sql`) |
| Supabase for database and identity | Built, Canadian region, with per-store per-role row security (`auth_setup.sql`) |
| Vercel hosting, free tier | Built and deployed |
| Mobile-first staff screen, zero training | Built: the staff Today home with big action tiles and a phone bottom tab bar |
| Remote owner dashboard | Built: the Today command dashboard with KPIs and what needs attention |
| Natural-language AI search over store data | Built: /ask, answering from the store's own notes, vendors, and invoices with sources |
| Notifications engine, email | Built: daily due-date email (Resend) plus the in-app bell |
| Notifications engine, SMS (Twilio) | Not built, stays deferred; email and the bell cover today's need at zero cost |
| Budget: $200 cap, ~$45 target | Matches: the app's realistic run rate is $50 to $100 a month |
| Task checklist per department with Mark as Complete | Partial: recurring department tasks exist (`maintenance_task`, daily/weekly/monthly cadence) but there is no staff tap-to-complete daily checklist yet. Queued below |
| Owner ops overview: tasks done vs remaining today, by department | Not built. Queued with the checklist |
| Tenant tracker: rent owed, last payment, paid-this-month indicator | Not built. The property tenants are not in the app at all. Queued below |
| Smart margin calculator: cost in, department margin rule, retail out | Not built. Queued below |
| Replit as the build environment | Not adopted. This repo builds on GitHub plus Vercel with versioned code review, which is safer for a production store. Locked decision |
| OpenAI gpt-4o-mini as the AI engine | Not adopted. The app uses Claude via the Anthropic API for extraction, ask, and reorder. Locked decision; one AI vendor, already integrated and budgeted |

Verdict: do not execute the PDF. Everything foundational in it exists and is further along here.
Its four genuinely new ideas (checklist, ops overview, tenant tracker, margin calculator) are
captured in the queue below.

## The owner's notes, refined

Each note appears with its plain reading, whether the app covers it today, and what is queued.

### 1. Futures: invoice intake from email
Raw: "get and organise the invoice from Email and we need ability to configure which emails
need to add that job."

Refined: a store email address that invoices get forwarded to. The extraction agent reads each
message, drafts the receiving and invoice records, and a person confirms on screen, exactly like
camera capture today. An owner-editable allowlist controls which sender addresses are trusted to
create these draft jobs; anything else is ignored.

Coverage: not built. Already first in the expansion plan (docs/STATUS.md, Wave 1, "email intake
agent"). The allowlist requirement from this note is now part of that item's definition.

### 2. Grocery: price check as a daily activity with a notification
Raw: "Price check in a day activity list & notification."

Refined: a recurring daily task, "Price check", in the Grocery department, that shows on a daily
activity list and reminds whoever is on it.

Coverage: partial. A daily recurring Grocery task can be created today (Maintenance screen;
daily cadence shipped in PR #8) and overdue tasks already surface in the notification bell. What
is missing is the staff-facing daily checklist with a big Mark as Complete and a per-day
completion record. Queued below as the department task checklist.

### 3. Maintenance, building: back door control
Raw: "Back Door Door control."

Refined: the back door (its closer, lock, or access control) tracked as a building asset with a
recurring check.

Coverage: covered by entering data, no code needed. Add a maintenance asset "Back door" and a
recurring task for its check on the Maintenance screen.

### 4. Hardware, daily operations: restocking frequency
Raw: "restocking frequency."

Refined: how often each Hardware section gets restocked, visible as a cadence so staff know what
to walk and refill each day.

Coverage: partial. Reorder suggestions exist from the order ledger and counts, and recurring
tasks can model "walk and restock aisle X" per section today. A true per-item restock cadence
belongs with the sales-data work (POS import) already queued in the expansion plan, because
real restock frequency comes from sales velocity.

### 5. Hardware: "taken care locations"
Raw: "Hardware taken care care locations."

Two possible readings, needs the owner's one-line answer:
(a) the physical store zones each hardware person is responsible for, or
(b) the locations where hardware stock is kept and maintained.

Interim: either reading can be captured today as knowledge notes tagged Hardware, one per
location, with the responsible person named. If (a) becomes a real roster, it belongs on the
schedule (shifts already carry a department; a zone field would be the extension).

### 6. Other vendors: DT across departments
Raw: "DT :- hardware, grocery 2nd aisle, dry goods."

Decoded from the Drive (2026-07-07): DT is Dollar Tree. The Hardware/Vendors folder
HH_HD_CT_DT holds a cross-retailer reorder sheet keyed by source: Home Hardware, Home Depot,
Canadian Tire, Dollar Tree. So this note means: products the store buys from Dollar Tree are
stocked in three places, Hardware, the second grocery aisle, and Dry Goods.

Coverage: gap. A vendor currently belongs to exactly one department in the schema. Until
multi-department vendors are built (queued below), the working convention is: create the vendor
once under its main department and record the other placements in the vendor's notes, so orders
still reconcile. The HH_HD_CT_DT InventorySheet.xlsx is the ready-made source when this builds.

### 7. Link and LP departments
Raw: "Link:- need to list done what all the department involved in LP."

Decoded from the Drive (2026-07-07): LP almost certainly means Link Products, the existing
Hardware vendor (folder "Link Products-Hardware", with Batteries and Sign Boards inventory
sheets). The note asks to list which departments carry Link Products items. One-word
confirmation from the owner closes this; the earlier liquid-propane reading is set aside.

Interim: a knowledge note titled "Link Products departments" holding the list as the owner
dictates it, and the same multi-department vendor build (item 4 below) covers it properly.

## Queued enhancements from these notes (proposed order)

Recorded here and mirrored in docs/STATUS.md. Nothing below is built yet; the owner picks when.

1. Department task checklist: recurring tasks surface as a daily list per department with a big
   Mark as Complete; each completion is logged (who, when). The owner's Today dashboard gains
   "done vs remaining today, by department". Covers notes 2 and 4 and two blueprint items.
   Small build, high value, uses the existing maintenance_task table plus one completion table.
2. Smart margin calculator: cost price in, department margin rule applied, recommended retail
   out; margin rules editable per department. Pairs naturally with the price-signs screen.
3. Tenant tracker: tenants, monthly rent, payments, paid-this-month indicator on the owner
   dashboard. New module; needs the real tenant list from the owner.
4. Multi-department vendors: let one vendor serve several departments (covers DT, note 6).
5. Email invoice intake with a sender allowlist (note 1; already Wave 1 in the expansion plan).

## Open questions for the owner

1. Note 5: does "hardware taken care locations" mean staff zone responsibilities or stock
   locations?
2. Note 7: confirm LP = Link Products (decoded from the Drive folder), then list the departments
   that carry Link items.
3. Tenant tracker: how many tenants, and what are the rents? (Needed before building item 3.)

## Drive re-verification, 2026-07-07

The owner shared the StoreApplication folder link (same folder id as the 2026-05-30 crawl in
docs/DATA_INVENTORY.md). Verified live: the tree matches the inventory exactly, and no
store-related file was added or modified since the crawl. Futures.docx is still empty. The
Lawson PO Details.docx with the plain-text credit card is STILL PRESENT and still needs
deleting. Root documents re-read in full:

- Vendorlist&InvoiceFilling.docx, how each vendor's invoice arrives. This is the seed for the
  email-intake allowlist (Wave 1). Email-channel vendors: Star Marketing, Kawartha Milk (also
  physical), Wildly Delicious, Gourmet Trading Co, ShaSha, Orgill (also physical), Northland,
  The Butcher Shop (also physical), RBH Tobacco, Muskoka Roastery (also physical), Emes Family
  Maple Syrup, DGS Distribution (also physical), Forklift, Now Prepay, Bell, Orkin Canada,
  Moor Propane, Howell Data Systems, Generator Solution, The Highlander (ad), Baxter Bakery
  (statement by email). Physical-only: Arla Cheese, Maple Dale Cheese. Channel not yet noted:
  Muskoka Spring, Nestle Ice Cream, Imperial Tobacco, Fraktals, Muskoka Brewery, water sample
  test, L&D produce.
- Utilities.docx: Hydro One, Bell, Vnet.
- The two Gmail subject-line documents are one-entry starters (Imperial Tobacco remittance,
  DGS receipt); the full subject-line library the owner uses lives in his Gmail habits, not
  in Drive.

## Owner feedback round 2, received 2026-07-20 (WhatsApp, partly Telugu)

Translated and actioned:
1. "Payment methods we actually use, like CC_Visa, Amex" and "a comments box when paying":
   already shipped in payments v2 (the screenshots predate the deploy). Verified present on
   the Payments screen, the vendor page, and the overdue quick form.
2. Confirmation filing needs a third option, "Digital and Physical": ADDED (value "both") to
   the method list and the database rule; offered on every record-payment form.
3. The overdue quick form now always shows the Notes box and the Confirmation filed picker.
4. "Ship date" is now labeled "Expected ship date" and a NEW order cannot take a date before
   today (editing an old order keeps its historical date).
5. Three voice recordings (12:15, 12:18, 12:27) that the owner calls the most important in
   the product: NOT YET HEARD. The builder or the owner must relay their content; nothing can
   be actioned from audio not shared as text. OPEN.
6. "Refer to Dub wear for partial payment and post-dated cheque" confirms those flows match
   the owner's expectation.
7. A store photo for a background pattern was mentioned but no photo arrived. In the meantime
   the app canvas carries a 4 percent-opacity evergreen motif (globals.css) that keeps the
   calm-canvas rule; send the actual photo and the login can carry a proper branded treatment.

## The owner's updated bookings workbook, received 2026-07-20

The annotated 2026 bookings file has a RICHER layout than the one the importer reads. The
current importer safely rejects it (clear message, no misparse). Adapting the importer to
this layout is the next build. Header map recorded verbatim so the file itself is not needed:

- Dry goods sheet: ReOrder Vendors, Vendor Company, Rep Name, contact no, E mail, Products we
  carry, Order status for 2026, Comments, OrderConirmationFiling Method, Amount, Ship date,
  DeliveryStatus, DeliveryComments, FinalInvoiceFiling Method, Invoiced Amount, Terms,
  DueDate, PaymentStatus, PaymentAmount, PaymentDate, PaymentMethod,
  PaymentConfirmationFiling, Credit back for damaged items, PriyaComments, StoreApplication.
- Lake side sheet: same idea, but PaymentConfirmationFiling comes BEFORE PaymentMethod, and
  the season column is "Order status for S25". Column order differs per sheet, so the new
  importer must map by header name, not position.
- Grocery Vendors sheet: (vendor), Rep Name, contact no, Products we carry, Order status for
  S25, Delivery, Delivery status, Amount, Invoiced Amount, Due Date, Terms, Payment Month,
  Comments, Status.
- AskingInventory sheet: a wish list (Water Skipping balls, Colour by numbering) that maps to
  knowledge or reorder notes.
- New columns map to features that now exist: PaymentMethod and PaymentConfirmationFiling to
  payment fields, PaymentAmount and PaymentDate to real payment rows, "Credit back for
  damaged items" to credit_note, the two filing-method columns to confirmation filing, and
  DeliveryComments like "we got extra items, unordered items and 1 missing product charged in
  invoice" are credit-note material.

## Raw notes as received, 2026-07-07 (verbatim, unedited)

> Futures:
> 1. get & organise the invoice from Email and we need ability to configure which emails need to add that job.
> 2.
>
> Notifications:
> Grocery
> 1. Price check in a day activity list & notification
> 2.
>
> Maintenance
> Building
> 1. Back Door Door control
>
> Hardware
> Daily operations
> 1. restocking frequency
> 2. Hardware taken care locations
>
> Other vendors
> 1. DT :- hardware, grocery 2nd aisle, dry goods
> 2. Link:- need to list done what all the department involved in LP

## Owner feedback round 3, received 2026-07-26 (WhatsApp texts, videos, voice notes)

What arrived: three WhatsApp text messages (Telugu written in English), three screen-recording
videos of the owner using the live app at the store, three voice notes, two app screenshots,
and three photos of the actual storefront (Robinson's General Store, Dorset, in winter).

Translated asks and what happened to each:

1. "Payments record chasatapudu Payrolls & Taxes ani kuda oka department or category kavali.
   Payroll Taxes and Incorporation taxes track chayadaniki" = when recording payments we also
   need a Payrolls & Taxes department/category, to track payroll taxes and incorporation
   taxes. BUILT: "Payrolls & Taxes" is now a seeded payout category (payments_v2.sql section
   8 adds it to a live database; seed.sql for fresh installs). Vendors under it (for example
   "CRA - Payroll remittance") record payouts like any other vendor; their invoice forms drop
   delivery and freight noise (isFinanceDept in src/lib/payments.ts).
2. "Once we record the payment its not allowing to edit... I entered a wrong date and it's
   not allowing me to edit the date once it post." BUILT: Edit on every payment row (vendor
   page and the payments screen) fixes date, method, reference, notes, and filing through the
   new edit_payment RPC, which re-derives every touched invoice's status in the same
   transaction (a date moved across today flips post-dated correctly). The amount stays
   locked: void and re-record, because allocations hang off it. The payment "Delete" label is
   now "Void" to match what it always did.
3. "Ara LakeSide&DryGoodsDepartment Payment record field below location nundi thesuko...
   OneDrive\All\StoreApplication\Departments&WorkFlow.xlsx, sheet
   Lakeside&DryGoodsPaymentRecordF. This is the only department I deal with 100+ Vendors."
   PARTIAL: that file lives in the owner's OneDrive, which is not shared; the payment-record
   fields visible in his workbook and videos (method, date, amount, confirmation filing,
   notes, credit back) all exist in the app already. OPEN: upload Departments&WorkFlow.xlsx
   (or share the OneDrive folder) to confirm nothing on that sheet is missing.
4. His dropdown wish list (CC_Visa, CC_AMEX, E-Transfer, EFT, Cash, Other with note box) was
   already live before the message; the screenshot showing only cheque predates the
   payments-v2 deploy.
5. A forwarded replit.com/join link (gopalmadala) arrived with no explanation. Recorded here;
   no action taken.

The videos (decoded with a local speech model; frames read):
- 10:01 AM (2:24): live demo of Capture at the store. He picks a department, drops "Bella
  Flor Sales Invoice No. PSI161772.pdf", the AI reads it (Wishing/... PRINTR lines, freight,
  $545.25 total), the order-vs-invoiced discrepancy warning appears with the acknowledgement
  box, and Save to feed works: "So, save to feed working. Okay, all good... if you go to the
  vendors, you can see the updates here and there." The capture flow works for him end to end.
- 12:57 PM (1:07 and 0:38): the Bella Flor vendor page with invoices marked paid and the
  payments listed, next to his bookings Google Sheet. The 38-second video says it plainly:
  "here when you see the payment, update the first paid and then save invoice. This invoice,
  payment information is not reflected. So what you can do is, go again, edit, unpaid, save,
  record payment is updated." = marking an invoice paid through Edit records NO payment, and
  his workaround was flip-back-and-Record-payment. FIXED: saving an invoice edit as "paid"
  with nothing recorded against it now opens the Record payment form on the spot, prefilled
  with what is owed, with a plain-words explanation.

The voice notes (12:15, 12:18, 12:27 on 2026-07-10): heavily Telugu-English code-switched at
20 kbps mono; three local Whisper models (small, medium, boosted audio, forced Telugu and
English passes) recovered only fragments: 12:18 "The main thing is that we have to pay the
deposit on the device"; 12:27 "I was trying to get a domain email... got the storage and
space. It costed almost 1.50 dollars. It's expensive." They appear to concern service or
device costs (domain email, possibly the POS/terminal deposit). STILL OPEN: the owner calls
these the most important notes; ask him to type them (or re-record inside the app's new
Suggestions page, which keeps recordings attached to a note).

Also in this round, from the user's own screenshots:
- The Outstanding KPI ($138,666.09) overflowed its tile: fixed (long figures step down in
  size; tiles clip instead of spilling).
- The notification bell count froze at 3 for the whole session: fixed (the count now
  refreshes on navigation, focus, panel open, and a slow timer).
- The Reorder AI summary showed raw ** markdown: fixed (plain-text prompts plus a
  server-side markdown strip on every AI text route).
- The storefront photos arrived at last: the login now carries the sign as a CSS plaque
  (dark boards, gold lettering, "Dorset, Ontario") and the sidebar mark matches. No photo
  file ships in the app; it is all CSS, so nothing heavy loads before sign-in.

## The annotated workbook, re-received 2026-07-26, and the header-driven importer

The updated "2026  bookings L_S & Dry goods.xlsx" was re-uploaded and this time the importer
was BUILT against the real file (src/lib/importBookingsV2.ts, wired into /api/import ahead
of the original parser; detection keys on the evolved layout's own headers such as Vendor
Company / PaymentMethod). Real-file test: 125 vendors, 98 orders, 86 invoices, 33 payments,
2 credit notes, 54 notes; per-sheet order and invoice sums match the sheet.

Layout facts the parser handles (all present in the real file): column order differs per
sheet, so mapping is by header name; dates arrive as Excel serials AND as text ("May 12th",
"Jun 8, and July 10", "April1,May1, june1" split shipments); PaymentMethod spellings like
"Check", "CC_Visa (Email Link)", "VISA_CC", "AMEX (Link in Email to Pay)"; PaymentStatus like
"PAID (545025)", "2 Partial Payments"; filing cells like "Digital/Physical" (maps to both)
and free text like "CC Statment" (preserved in payment notes); "Credit back for damaged
items" amounts become pending credit notes tied to the invoice; the AskingInventory wish
list becomes reorder-tagged knowledge notes. Idempotency is unchanged: vendors already in
the store are skipped with all their children, so importing over the live database never
double-loads or double-pays.

## The 2026_Payments Google Sheet and the statement workflow, seen 2026-07-27

A screenshot of the owner's live "2026_Payments" Google Sheet showed these tabs: Bakery,
Meet, Utility, Notes, Renewals & Training, MaintanancePayments, Grocery, Loans&Payments.
The MaintanancePayments tab carries: vendor email, estimate # (e.g. 41426007), estimate
amount, type (Upgrade / Repair / Maintanance), invoice # (83365, 83364, 17450), date,
amount, a long work description ("replace the Carrier RTU that controls the clothing
area...", "located a leak at the middle low temp compressor..."), PAID, paid date. This
maps one to one onto the app's property invoices (estimate_number, work_type,
service_category, work_description, amounts, derived status, payment date). Utility,
Renewals & Training, and Loans&Payments tabs are future payout-category candidates
alongside Payrolls & Taxes.

The workflow fact that came with it: once an account runs past due, vendors stop sending
job invoices and send STATEMENTS of the remaining amount from that point on. Built the
same day: a Statement view on every vendor page (charges and payments in date order with a
running balance and a printable layout), so the vendor's mailed statement can be checked
line by line, and the installment auto-spread pays it down oldest-first.

## Sync vision and linking round, 2026-07-27 (the developer)

Decisions from this discussion, all shipped the same day unless marked:
- Vendor "what they supply" info: keep the existing products_we_carry free text as the
  storage (volatile by nature, already searchable), capture it optionally right in the
  payments quick-add along with notes, and render it as small neutral chips on the vendor
  page and the payout vendor picker. No new grain, no schema change.
- The live Google Sheets are the current system of record; the agreed direction is two-way
  sync (pull deltas from the sheets, push app data back) until full migration or a
  permanent hybrid. Design and phases: docs/SYNC_PLAN.md. Phase 1 (importer refresh of
  existing vendors' info fields from the sheet) shipped; Phase 2 needs the two live sheets
  shared with the developer's Google account and a service account.
- Cross-linking: vendor names on Due and overdue and on both payout lists now open the
  vendor ledger; Today's KPI tiles open the screen where each number is acted on; the
  vendor header shows the latest order and latest cleared payment at the top right.
- Jira tasks for the sync phases: queued for when the Atlassian connector is back online.

## Both live workbooks received as files, 2026-07-27 (late)

2026_Payments.xlsx, full tab census (fields differ BY DEPARTMENT, the owner's core point):
- Vendors: Vendor, DeliveryDate, Amount, DueDate, Paid, Comments (running totals in row 1).
- StoreSupplies&Maintenance / Bakery / Meet: Vendor, DeliveryDate/ServiceDate, Amount,
  DueDate, Comments (the light form).
- LocalVendors: + Invoice#, Terms, PaymentStatus/Date/Method/ConfirmationFilling/Comments.
- Grocery: Vendor, TypeOfGoods, DeliveryStatus, Invoice#, Invoice$, HST$, FrightCharges,
  DeliveryDate, Payment$, PaymentStatus/Date/Method/Filling, Comments (full merchandise).
- Hardware: the Grocery shape + PO# (validates the po_number field shipped in PR #15).
- ChipStand: merchandise shape; owner DOES track it (SCRUM-9 said "not needed"; sheet wins).
- MaintanancePayments: Company(TBD_Vendor), SpecilizedOn, TechName, Phone, Email,
  Estimate#, Estimated$, TypeOfWork, Invoice#, InvoiceDate, InvoiceAmount, Description,
  PaymentStatus/Date/Method/Filling, Comments. Maps to property invoices; SpecilizedOn is
  service_category, TechName is the rep. GAP QUEUED: estimate AMOUNT (Estimated$).
- Pays,CRA&CashPayments: payroll (Rana) and CRA PAD rows; the Payrolls & Taxes category.
- Utility: Provider + EmailSubjectLine (Vianet monthly statements; email-driven, ties to
  the email-invoice-intake future).
- Loans&Payments: LendingSource, Loan#, Total# of payments, PaymentFrequency,
  PaymentAmount, PaymentDate, PaymentMethod (autopay). NEW CONCEPT QUEUED: recurring
  obligations (loans, utilities) with frequency, distinct from vendor invoices.
- Renewals & Trainings: certification expiries (JHSC) with email dates: Compliance module
  material. Notes: freeform.
- New method spellings seen: ACH, "Auto debit from Bank Account", "Autopay from Scotia"
  (map to eft/other with the raw words kept in notes).

Updated bookings workbook (same upload): headers renamed (Order Filing, Delivery Status,
Invoice Filing Method, Payment$, Payment Filing Method, PaymentComments), trailing Runout
and Reorder Vendors columns, a NEW Local Vendors tab, and AskingInventory rows now carry
remark cells ("Dont order more"). The header-driven importer was updated the same night
and re-verified against the real file: 130 vendors across 4 tabs, richer methods
(cc_visa, cc_amex, etransfer, eft), the remark preserved on the wish-list note, all
structural assertions passing. Recognized uploads are now also archived under imports/ in
the documents bucket and listed on the Import screen as downloadable versions.

## Late-night walkthrough round, 2026-07-27 (live demo with the owner)

Shipped during and right after the call: reference boxes explain themselves per method
(the Card confirmation question, asked twice); the payout vendor picker lists whole
categories with counts (the silent 30-row cap was hiding vendor #31+ in the big
departments); a vendor's zero Outstanding explains deposits on account and
ordered-but-not-invoiced amounts (the ABBOT confusion: orders are commitments, invoices
are debts); the vendors directory is grouped by department with count chips and clickable
category chips; and Ask the store learned the application itself (an APP GUIDE ships with
the code) plus deterministic issue logging: saying "log this issue: ..." files the exact
words into Suggestions when signed in. Department walkthrough photos (one per department,
from the owner's phone) are queued for visual navigation tiles and knowledge-note
attachments; website photos were ruled out (blocked network, third-party rights,
pre-sale vintage).

## Jira round, 2026-07-30 and 31 (five more SCRUM-9 comments from Ravi Kiran)

These arrived on a ticket that had already been closed, which is how we found that the
automation only ever looked at open tickets. Fixed in the same round.

1. A question, not a bug (30 July, 23:24): "When we select the Tax entered separatly drop
   down option for the Tax field in Vendors and Record Invoice, its poped up with the number
   195 in the HST field... however when we choose the option 'Tax included in the imvoice'
   the HST field populated with number 172.57. Where its come from and how to caluculated to
   popup 172.57."
   BOTH FIGURES WERE CORRECT. On a 1,500 subtotal: 195 is 13 percent added on top; 172.57 is
   the tax already inside 1,500, because 1,327.43 of goods plus 13 percent comes to exactly
   1,500. The failure was that nothing on screen said so. The HST box now prints its own
   working underneath, in both invoice forms. Worth remembering as a pattern: he was not
   wrong about the number, he was right that the app never explained itself.

2. Invoice recording (30 July, 23:28): make Delivery Comments mandatory, with "N/A" when
   there is nothing to say; add a "Final Invoice Filing" dropdown (Physical, Digital,
   Physical/Digital) and, when either digital option is chosen, a required "Digital File
   Location" for the URL or path.

3. Purchase orders (31 July, 00:04): the same digital file location rule on the order
   confirmation, and Order Comments mandatory with the same N/A convention.

4. Vendor page section order (31 July, 00:12): Vendor, Purchase orders, Invoices, Statement,
   Payments, Credits. Only Purchase orders and Invoices were out of order.

5. Record payment (31 July, 00:20): rename Method to PaymentMethod, Confirmation field to
   Payment Confirmation field, Notes to Payment Comments; add the digital file location on
   the same rule; make Payment Comments mandatory with N/A.

All five shipped. The N/A convention is the interesting one: he is not asking for a required
field for its own sake, he is asking that "nobody wrote anything" and "somebody checked and
there was nothing" stop looking identical in a report months later.

## Jira round, 2026-07-27 evening (SCRUM-9 comments from Ravi Kiran)

Four comments on SCRUM-9 between 21:17 and 22:21, each with a screenshot of the live app.
This is the first feedback that arrived as Jira comments rather than WhatsApp, which is the
channel we wanted. All four are shipped; the deviations are noted against each.

1. Vendors navigation (21:17): "When a user opens the Vendors tab, display the department
   list first. After selecting a department, show only the vendors assigned to that
   department. The user must also be able to add a vendor from within the department, with
   the selected department automatically assigned. Include vendor counts, department-level
   search, an All Vendors option, and a way to return to the department list." With the
   department sequence: DryGoods&Lakeside, Hardware, Grocery, Property Maintenance, Bakery,
   Meat, Produce, Payroll&Taxes, Others, and "We need the departments in the same sequence
   in the dropdown."
   SHIPPED as asked. The sequence is now one shared rule (src/lib/departments.ts) applied to
   every department list and dropdown in the app, not just this screen. Departments outside
   his nine (Chip Stand, Checkouts, and the Clothing / Gifts / Garden Center sections) still
   work and sort after them: nothing disappears from a list because it was not on the list.

2. Add-vendor form (21:43): rename Name to CompanyNameOrVendorName, drop the Department
   field ("we dont need a Department(Optional) field. Since we are already specifying the
   department in the first step itself"), rename Rep to RepName and Default Terms to
   PaymentTerms, keep Phone / Email / Status / Products we carry / Notes, keep the sequence.
   SHIPPED. The labels read as plain words rather than run-together field names, per the
   house rule: "Company or vendor name", "Rep name", "Payment terms". The Department field
   is gone inside a department and kept only in the All vendors view, where there is no
   department to inherit.

3. Purchase order (22:04): required fields and sequence: OrderStatus (In Progress,
   Approved), OrderAmount, OrderConfirmationFillingMethod ("Open for short name
   suggusions. Perpose of this field is to know where we saved the order confirmation
   doc"), ShipDate, OrderComments.
   SHIPPED in that order. The confirmation field is called "Order confirmation filed" and
   offers Digital / Physical / Both, matching the payment confirmation field the owner
   already uses. Season year is no longer a field: it follows the ship date, so the seasonal
   reports keep working without anyone typing a year.

4. Invoice recording (22:21): required fields and sequence: DeliveryStatus (Delivered,
   Partially Delivered), Delivered Date, Invoice#, InvoiceSubTotal, Tax (Tax Entered
   Separately, Tax Included in Invoice Amount, No Tax), HST, FreightCharge, Due Date,
   PaymentStatus (Paid, Unpaid), DeliveryComments "(For any short-shipped or damaged
   products)".
   SHIPPED in that order, with three notes. "Tax included in the invoice amount" is new and
   changes money: the HST is still recorded for the tax report but is no longer added on
   top, so the app now stores HOW an invoice states its tax instead of guessing it from the
   figure. A fourth option, "Refer to the actual invoice", stays because the imported
   ledger has 130 invoices whose tax is unknown. Payment status stays Paid / Unpaid only on
   entry: after that the status follows the payments, because a status typed by hand is how
   an invoice ends up marked paid with no payment behind it.

## Domain and email round, 2026-07-27 (control-panel screenshots)

Three screenshots of the store's domain control panel arrived, carrying Ravi's WhatsApp
messages of 2026-07-21: "We have a sctive domain and they charge 10 doller per month up to
10 emails" and "Those are the five email which are configured by previous owners, but we
are not using them yet. We can configure 5 more if we need. Up to 10 email its 10 dollars
per month."

What the panel shows (recorded in full, with the integration plan, in docs/DOMAIN_EMAIL.md):
- robinsonsgeneralstore.ca, DOMAIN.CA registration, active since 2006-10-17. Email plan
  HST-EMAIL-1 (max 10 mailboxes, about $10 per month), active since 2024-09-17.
- Five mailboxes, all configured by the previous owners and unused by the current
  ownership: drygoods@ (249.99MB of 250MB, FULL), hardware@ (250MB of 250MB, FULL),
  info@ (250MB of 250MB, FULL), joanne@ (the previous owner's personal box, 0.05MB),
  redonion@ (The Red Onion boutique, 78.76MB).
- One alias: stories@ forwarding to robinsonsstories@hotmail.com.

This CLOSES the 12:27 voice-note mystery from round 3: "I was trying to get a domain
email... got the storage and space. It costed almost 1.50 dollars. It's expensive" was
about this domain email plan and its cost. The 12:18 fragment ("deposit on the device")
is now the only voice note still un-decoded.

Two urgent findings relayed to the owner the same day:
1. drygoods@, hardware@, and info@ are AT QUOTA and rejecting incoming mail. Any vendor
   emailing an invoice or order confirmation to those addresses gets a bounce today.
2. The stories@ alias sends store mail to the previous owners' personal hotmail; unless
   deliberate, it should be repointed or deleted, and joanne@ archived then retired.

The integration plan (the app on app.robinsonsgeneralstore.ca, the 10-slot mailbox
mapping with invoices@ as the future intake feed, Resend sending the daily alert as the
store, and the concrete email-invoice-intake design) lives in docs/DOMAIN_EMAIL.md.
