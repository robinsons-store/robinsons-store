// The app, explained in plain words, for the Ask-the-store assistant. This ships with the
// code, so it is always true for the deployed version; update it in the same PR as any
// screen change it describes. No dollar figures live here, so it is safe for every role.

export const APP_GUIDE = `
WHAT THIS APP IS: the operations system for Robinson's General Store. It tracks vendors,
orders, invoices, payments, credits, inventory counts, price signs, maintenance, HR,
compliance, and the store's own knowledge, and it is the single place money owed to
vendors is recorded and settled.

SCREENS AND WHAT THEY ARE FOR:
- Today: the day at a glance. Six tiles (captures, tasks, outstanding, overdue, late
  deliveries, to reorder); every tile opens the screen where that number is acted on.
- Capture: photograph or upload a vendor invoice or delivery slip; the AI reads the lines;
  a person confirms anything uncertain and any order-vs-invoiced difference, then saves.
  There is a manual entry path for phone orders.
- Feed: recent deliveries and activity, newest first.
- Due and overdue: every unpaid, partially paid, or post-dated invoice by due date.
  Editors can record a payment right on the row. Vendor names open the vendor page.
- Vendor payouts (Payments): the one place to record any money going out to a vendor.
  Pick a category chip, pick the vendor, tick the open invoices the payout covers (one
  cheque can settle several invoices), or mark it a deposit when no invoice exists yet.
  For an installment toward everything owed, type the amount and use "Spread it oldest
  first". Post-dated cheques are payments with a future date; they flip to paid on their
  own when the date arrives. Recent payments can be Edited (date, method, reference,
  notes, filing) or Voided; the amount is fixed, so void and re-record a wrong amount.
- Vendors: opens on the department list, each card showing how many vendors it holds. Pick
  a department to see just its vendors, with a search box across names, products, and reps;
  All vendors shows everyone at once, and Add vendor inside a department files the new
  vendor there automatically. A vendor page holds contact info, orders, invoices, payments,
  credits, and a Statement view (charges and payments in date order with a running balance,
  printable, for checking a vendor's mailed statement line by line). Each vendor also
  carries an ordering profile: the minimum order (an amount, or "No minimum order"), the
  summer order timeline in plain words, where orders get placed (gift show, email, in
  person, rep show, phone, vendor website, other), and whether anything was reordered this
  year with a note saying when and how much.
- Reports: spend by department, ordered vs invoiced, outstanding aging, payment status
  mix, HST by department for a financial year, a vendor scorecard, a Department drill-down
  (invoiced, paid, owed per department, opening into vendors), deliveries arriving in the
  next 7 days, and late deliveries.
- Reorder: who likely needs an order this season, from the ledger and reorder notes,
  with an optional AI summary. A person always makes the final call.
- Inventory: dated counts per department; counts load from category sheets on Import.
- Price signs: printable signs; the margin calculator is for managers and the owner.
- Knowledge: the store's tribal knowledge, tagged and searchable.
- Suggestions: the owner's inbox to the developer. A note, an optional screenshot (the
  app reads it into text automatically), an optional voice recording, statuses, and a
  "Copy developer digest" button.
- Import data (Admin): drop the bookings workbook (original or updated layout), the
  weekly schedule, or category inventory sheets. Re-uploading applies only what changed;
  every recognized upload is archived under Previous uploads with download links.
  "Export everything" builds one Excel workbook of every table with relationships.
- Maintenance: property assets and recurring tasks with a daily checklist.
- Compliance: licences and insurance and their expiry dates.
- Employees and Schedule: staff, pay rates (money roles only), weekly shifts.

HOW COMMON THINGS ARE DONE:
- Fix a wrong payment date: open the vendor, Payments section, Edit on the payment row,
  change the date, Save. Invoice statuses recompute on their own.
- Partially pay an invoice: record a payment for less than what is owed; the invoice
  shows partially paid with the remainder, and flips to paid when a later payment covers
  the rest. Nobody sets statuses by hand.
- Mark an invoice that arrived already paid: Add invoice, set Payment status to "Paid
  already", and the payment records with it in one step.
- Record an invoice whose price already includes the tax: on Add invoice set Tax to "Tax
  included in the invoice amount". The HST still gets recorded for the tax report, but it
  is not added on top, so what the app says is owed is what the vendor billed.
- Note a short shipment: set Delivery status to "Partially delivered", put the arrival day
  in Delivered date, and describe what was missing or damaged in Delivery comments. A
  credit note on the vendor page is what actually reduces the money owed.
- Comments are required on invoices, orders and payments. If there is genuinely nothing to
  say, type N/A: a blank box and a deliberate "nothing to note" look the same later, and
  N/A says somebody checked.
- When something required is missing, the message appears under that field in red, not in
  a card at the top of the page. Fix the box the message is sitting under.
- Record what a vendor will not go below: edit the vendor and fill in Minimum order amount,
  or tick "No minimum order". One or the other, never both. It then shows on the vendor
  page, on the Add order form, and on the Reorder list, so it is in front of you while you
  are deciding what to order.
- Note that something sold well: edit the vendor, set Reorder status to Reordered, and say
  in Reorder comments when it was reordered and how much. Reordered vendors are flagged on
  the Reorder screen next season. Changing the status later never wipes the note on its
  own; there is a "Clear it" button when you actually mean to.
- Say where a confirmation is filed: Physical, Digital, or Physical/Digital. Choosing
  Digital or Physical/Digital asks for the Digital file location, the link or folder path
  where the file actually lives, so it can be found again months later.
- Understand the HST that fills itself in: the line under the box shows the working. With
  tax entered separately it is 13 percent added on top; with tax included in the amount it
  is the tax already inside what the vendor billed, so 1,500.00 holds 172.57 of tax on
  1,327.43 of goods.
- See what a vendor still owes or is owed: the vendor page header (Outstanding, deposits
  on account, ordered-but-not-invoiced), or the Statement view for the full running
  balance.
- Give feedback or report a problem: the Suggestions screen; or tell Ask "log this
  issue: ..." and it lands in Suggestions when signed in.

WHO SEES WHAT: staff see no dollar figures anywhere; leads, managers, and the owner see
money. Editing needs manager or owner. Only the owner edits Department fields; managers can
read the choices. Deleting anything only hides it (soft void); the
history stays for taxes.
`;
