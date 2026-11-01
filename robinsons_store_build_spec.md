# Robinsons General Store, Consolidated Build Spec (v2.1)

> **Kept for history.** This is the original plan. Where it disagrees with docs/STATUS.md,
> docs/ARCHITECTURE.md or the skill, those win. The index to the current docs is docs/README.md.

Single source of truth for the build. Merges three inputs: the research report (Drive read, technology evaluation, pricing, UX citations, Canada tax), the v1 product requirements doc (capture-first design, modules, first slice), and the color and interface guide (color system). Read this to build and to run the call.

## What changed from v2 to v2.1
Restored content that the first v2 over-condensed: the full Drive evidence inventory, the NN/g form and interaction standards, the document-AI pricing table, the dual-season reorder method, the alternatives-rejected table, the province tax table, the opportunities section, and the caveats. Kept all of v2's additions (capture-first philosophy, color system, the why-not-enterprise framing, the Supabase decision, the licence table, the location flag).

---

## 1. Thesis
Turn the store's paper, Excel, and the knowledge in Ravi's head into a structured, attributed, searchable system simple enough for untrained seasonal staff, so Ravi can hire a manager and run the store remotely with full visibility.

---

## 2. Evidence from the Drive folder
Read of the StoreApplication folder and its subfolders. Live links, private to the owner's Google account: StoreApplication https://drive.google.com/drive/folders/1liGWxXw_dgQygF9NhNGiuBFObdrhmBz8 , Bookings https://drive.google.com/drive/folders/19aGReT42XHVaQhGAf1p9CFOwodshyQcJ , Orgill https://drive.google.com/drive/folders/1uadEQ_vzfr_a4oTZSpOnh-RyTbYqOa1X . See docs/DATA_SOURCES.md for how to load them into Claude Code.

- **LakeSide&DryGoods/** holds the crown jewel: 2026 bookings L_S & Dry goods.xlsx. A multi-tab vendor and order ledger with these columns: Vendor Company, Rep Name, Contact No, Email, Products We Carry, Order Status for 2026, Comments, Order-Confirmation Filing Method, Amount, Ship Date, Delivery Status, Delivery Comments, Final-Invoice Filing Method, Invoiced Amount, Terms, Due Date, Payment Status, Payment Date, Payment-Confirmation Filing. It covers Dry Goods and Gifts (about $158,412.20 ordered, $122,219.15 invoiced), a Faith in the Forest clothing section (about $63,363.79 ordered, $38,444.24 invoiced), and a Grocery vendor section. Roughly 120 vendors total. This spreadsheet is the v1 schema and the test data.
- **InvoiceFiles&PaymentConfirmations/** holds two reference docs that list the email subject lines they search to find invoices and payment confirmations (for example BAT Invoice from Imperial Tobacco that does not filter accurately, Remittance Advice 0056138871, a DGS Distribution ice cream receipt). The current system is Gmail search by subject line.
- **Referencess/** holds AtikokanCastle and Shalving (shelving) photo folders, including phone photos of hardware shelf tags and price labels (trailer hitch kits, dryer vent kits, drywall joint tape with SKUs and prices).
- **Vendors/** holds one folder per hardware vendor: Orgill, Big Rock Sports, Hutchings Marine, Lawson, Lumberjack Pellets, Link Products, HH_HD_CT_DT. Orgill is the richest, with subfolders for Invoices, Statements, SKUs, Returns, CreditRequest, FutureOrders, OldStockInventory, Planogram, Bookings, SmartStart, Sobeys, plus an Ontario Pesticide Vendor Licence PDF and product return-authorization docs (Stanley Black and Decker Canada return process).
- **PriceSigns/ (GardenCenter)** holds about 25 individual .docx price-sign files (Charcoal, Firewood, Propane tank exchange $36.99 and new $79.99, Shovels $24.99, Safe-T-Salt 10kg $4.99, Vivere hammock $249.99, umbrella $99.99, grass seed $24.99). A print-on-demand price-tag library.
- **GardenCenter/** holds OSC Seeds, Plants, Soil.

Facts extracted:
- The store is Robinsons General Store, the general store Ravikiran acquired. It operates as 1000476363 Ontario Inc., 1062 Main Street, Dorset, ON, P0A 1E0, per the pesticide licence where Ravikiran Maddipati signed as Manager. Lakeside Dry Goods and L_S and Dry goods are a section inside the store, the Dry Goods and Gifts side of the bookings, not the store name. Confirm only the operating address, see section 16.
- The store sells regulated pesticides under an Ontario Vendor Licence with a tracked expiry, so the app must track licences and certifications and their expiry dates.
- The bookings sheet is full of operational knowledge in free text: "Bankrupt and sold, order similar from Ganz or CLS, discontinue", "Didn't sell well, skip for 2026, mostly skip 2027", "Rep will call and deliver after payment", "Get more info on payment terms", "Where is the invoice?", "Is the cheque issued? NO". These are the rules and exceptions that become structured fields plus an SOP store.

---

## 3. The problem today, from the evidence
1. Double and triple entry. Orders typed into Excel, prices scribbled on invoices, payment confirmations found by Gmail subject-line search.
2. No source of truth for money. Order amount and invoiced amount often differ. Example from the sheet: ABBOT ordered $3,089.04, invoiced $2,898.65, with a note about extra items, unordered items, and one missing product that was charged in the invoice. Many rows read "Where is the invoice?" and "Is the cheque issued? NO".
3. Manual delivery and payment tracking, split across Net 30, 60, 90, rep-will-call, post-dated cheques, and split payments.
4. Heavy summer seasonality (Ontario cottage country). Orders cluster April to June.
5. Tribal-knowledge risk. Ravi is the only deep expert in Hardware. Grocery, Bakery, Clothing, Gifts, Produce, Meat, and the chip stand live in his head and in comment cells.

The cost is not just typing. It is lost margin (pricing logic vanishes when the invoice is filed), no accountability (no record of who did what), and a business that cannot be delegated because the operating knowledge is not written down.

---

## 4. Who uses it, and on what
| User | Device | What they do |
|---|---|---|
| Seasonal floor staff | Department laptop | Capture receiving, counts, price signs. Confirm AI-extracted data. Minimal typing. |
| Department lead | Department laptop | Same as staff, plus review the day's feed, place and track orders. |
| Manager (future hire) | Laptop, anywhere | Watch all departments, approve, chase late vendors, read the knowledge base to run departments they are not expert in. |
| Owner (Ravi) | Laptop or phone, anywhere | Remote oversight, plus the decisions only he makes. Sees every department, every action, every photo. |

One laptop per department. Not a phone-first build, but the capture flow uses the laptop webcam and drag-and-drop, so the capture-first model still holds.

---

## 5. Design philosophy: capture first
The store already works photo-first. Ravi scribbles prices on invoices and files them. The app matches that instinct instead of fighting it. Six principles, each tied to the hard-to-train constraint.

1. Capture is the home screen. The primary button everywhere is + Capture. Receiving, counting, and pricing all start there.
2. The photo is the record. Every event begins from an image: a vendor invoice, a receipt with notes, a shelf, a price sign. The image is stored as the source of truth. Fields are pulled from it, not typed.
3. Near-zero typing. The vision model pre-fills vendor, date, line items, costs, and the retail-price notes. Staff confirm or fix one field. A first-day hire finishes in under a minute.
4. A feed per department. Reverse-chronological, photo plus author plus time. It reads like a familiar feed and is actually the audit trail.
5. Every entry has an author. Accountability is a byproduct of normal use, not a separate system.
6. One layout, two taps deep. Same card, same gestures everywhere. Muscle memory transfers, which is what makes it trainable in minutes.

Manager and owner get one extra view: a Today strip, a stories-style glance of what each department did today, so remote oversight takes thirty seconds.

---

## 6. Design and UX standards

### 6.1 The one Instagram idea that transfers
Instagram keeps its working surface near monochrome so user photos carry all the color. Here the captured photos and the data carry the color, and the interface stays quiet. The rest of Instagram's playbook (saturation, motion, reward loops) is built to drive engagement and works against a tool used all shift. Stay calm and predictable.

### 6.2 Color system
A floor tool used for hours. Color carries meaning and lowers fatigue, it does not decorate. Roughly 90 percent of the screen stays neutral. One hue means exactly one thing across the whole app.

Adaptation note: the source guide was written for a warehouse with barcode guns, gloves, and haptics. This store is department laptops with a webcam and drag-and-drop, so keep the palette, the one-meaning-per-hue discipline, and the never-color-alone rule, and drop the handheld-scanner haptics specifics.

Surfaces and text
| Token | Hex | Usage |
|---|---|---|
| App background | #F7F8FA | Canvas, low glare |
| Panel / card | #FFFFFF | Forms, feed rows, modals |
| Border / divider | #E2E6EB | Field outlines, separators |
| Primary text | #1F2933 | Labels and values, softer than pure black |
| Secondary text | #5B6570 | Helper text, metadata |
| Disabled | #9AA3AD | Inactive controls |

Primary action and focus
| Token | Hex | Usage |
|---|---|---|
| Primary action | #2F5FA8 | Buttons, active field border, focus ring |
| Primary hover | #244B86 | Hover and pressed |
| Focus halo | #B8CCE8 | Soft ring on the focused control |

Status, one meaning each
| State | Base | Tint | Meaning |
|---|---|---|---|
| Success | #1E8E5A | #E6F4EC | Good, validated, fully received, paid |
| In progress | #2F5FA8 | #EAF1FB | Parsed, partial received, scanning |
| Warning | #B7791F | #FBF1E1 | Short, over, damaged, disputed. A person decides |
| Error | #C0362C | #FBEAE8 | Validation error, wrong item, missing field |
| Neutral | #6B7480 | n/a | Awaiting, not started, closed, cancelled |

Receiving workflow status to color
| Status | Color | Action |
|---|---|---|
| PENDING_DOCUMENT | Neutral | Received, not parsed. No action |
| PARSED | In progress | Lines extracted, in validation |
| VALIDATION_ERROR | Error | Unknown SKU or bad quantity. Fix before receiving |
| AWAITING_ARRIVAL | Neutral | Validated, waiting on goods |
| PARTIAL_RECEIVED | In progress | Some lines in. Keep going |
| FULLY_RECEIVED | Success | All in. Ready to complete |
| DISPUTED | Warning | Discrepancy under review |
| CLOSED | Neutral | Terminal, muted, with a green check |
| CANCELLED | Neutral | Terminal, muted |

### 6.3 Form and interaction standards (NN/g)
- One thing per screen, with progressive disclosure. Fewer, better-sequenced fields raise first-attempt completion and cut cognitive load.
- Always-visible top-aligned labels. Never use placeholder text as the label. Placeholders disappear on focus, hurt recall and error-checking, and fail users with visual or cognitive impairments. Top-aligned labels give the fastest completion and fewest errors.
- Inline validation as the user leaves a field, not on final submit. This reduces re-submission.
- Error prevention first, then plain-language recovery. Avoid hostile, aggressively styled, premature errors.
- Input masks for phone, currency (CAD), and dates. Prevents format errors and aids verification.
- Big targets, forgiving defaults, autosave, and scan-do-not-type. Camera or drag an invoice in, the AI fills the form, staff confirm. This turns data entry into confirmation.
- Onboarding: a first-run guided tour, seeded sample data, and an in-app three-step "how to receive an order" card for new seasonal hires.

### 6.4 Accessibility
Never let color be the only signal. Every status also carries a label and an icon. Hold text to WCAG 2.2 AA (4.5:1), AAA (7:1) for small labels on dense forms. Targets 24px or larger. A visible 2px focus ring is not optional, since power users tab through fields without the mouse. Keyboard navigation and labels tied to inputs throughout.

### 6.5 Dashboard charts (manager and owner, later phase)
Charts are the content, so chrome stays neutral and only the data carries saturation. Use the Okabe-Ito colorblind-safe set in order and stop before about seven categories: #0072B2, #E69F00, #009E73, #CC79A7, #56B4E9, #D55E00, #F0E442, with #999999 for Other. Sequential ramp for magnitude runs light #EAF1FB to dark #143A73. Diverging blue to orange for variance to target: #0072B2 low, #F2F2F2 center, #D55E00 high. One color per entity across every chart. Keep status red, amber, green on KPI tiles only, not on every bar.

---

## 7. Stack (reconciled)
| Layer | Choice | Why |
|---|---|---|
| Web app (UI + API) | Next.js on Vercel | One framework for frontend and serverless API. React. Deploys in minutes |
| Database, auth, storage, vectors | Supabase (Postgres) | Bundles Postgres, Auth, Storage, and pgvector in one plane. Lowest ops for a solo builder. Pick a Canadian region at project creation |
| Document AI | Vision LLM via API, Claude Sonnet default, GPT-4o fallback | Reads messy invoices and handwriting into JSON. Pennies per document |
| High-volume clean invoices (optional) | AWS Textract AnalyzeExpense, ca-central-1 | Cheap, deterministic, in-region for residency |
| Notifications | Email (Resend) now, SMS (Twilio) if needed | Due-date and follow-up alerts |

Alternatives considered and rejected
| Option | Why not the platform |
|---|---|
| Retool | Per-user pricing and a constrained UX ceiling. Strong fallback for speed if builder time drops below about one day per week |
| Neon Postgres | Excellent pure Postgres with scale-to-zero and branching, but you bolt on Auth.js and S3 yourself. More moving parts than Supabase for one builder. Stays the alternative DB |
| Budibase or Appsmith | Cheap, but weaker UX and AI-agent story than code |
| Microsoft Power Apps | Per-user cost and licensing complexity, weaker consumer-grade UX, and not an M365 shop |
| Glide, Softr, Airtable | Fastest to a usable form and fine for a throwaway prototype, but row caps, weak relational integrity, and AI limits rule them out as the platform |
| Streamlit | Great for the later analytics dashboard, not for forgiving multi-user data entry |

Monthly cost, realistic: Vercel free to $20, Supabase free to $25, vision LLM $5 to $40 by volume, domain $1 to $2, notifications $0 to $20. Typical total $50 to $100, under the $200 ceiling. Threshold to revisit: document volume past about 10,000 a month, or Vercel bandwidth past its included 1 TB.

---

## 8. Why not the enterprise stack yet
Ravi's sketches (Cortex, Snowflake, ICE buy tables, Fabric, zero-copy, Redpanda streaming, Atlas, MuleSoft, API gateway, MCP governance, API policy) are the right tools for a different problem: many stores, high event volume, multiple teams, and third-party API consumers. This is one store with seven laptops producing on the order of thousands of rows a month.

- Snowflake is priced for analytics at scale. Postgres on a $25 plan handles this volume at lower cost and far less overhead.
- Kafka or Redpanda, Atlas, MuleSoft, API gateway, and MCP governance exist to integrate many systems and govern many agents in production. One store has neither the throughput nor the integration surface to need them.

Upgrade path, earned only if the business grows:
- Postgres stays the operational database. With many stores, stream changes (CDC) into Snowflake or BigQuery for cross-store analytics.
- Add a queue (SQS or Redpanda) when event volume needs async pipelines.
- Add the API gateway and MCP governance when you expose APIs to third parties or run many agents in production.

Honest framing for the call: build the lean version that serves the store now, keep the data model clean, and the door stays open.

---

## 9. Data model
v1 core, app-shaped, with audit on every row:
store, department (self-referencing for sub-departments like Garden Center), app_user (staff, lead, manager, owner), vendor (per department), item, receiving_event (vendor, date, source file, status, author), receiving_line (item, description, qty, unit_cost, retail_price_note, confidence), invoice (amount, due_date, status), payment (method, date, confirmation file, author), retail_price (item, price, effective_date, source file), inventory_count and inventory_count_line, purchase_order (vendor, items, ship_date, delivery_commit, status), knowledge_note (department, topic, body, tags, author), activity_log (actor, action, entity, timestamp).

Evidence-driven additions:
- licence (name, authority, number, holder, expiry_date, reminder, source file). The Drive folder holds an Ontario pesticide vendor licence the store must keep current and may show at point of sale. Missing from v1 and important for compliance.
- For Phase 2 and beyond, the fuller schema adds maintenance assets and tasks (filters, refrigeration, snow removal), insurance policies, and HR (employees, schedules, shifts, effective-dated pay rates, timesheets), plus a tax_rules table keyed by province for portability.

Conventions: store money as integer cents. Put a confidence value on every extracted line. Flag low values for human confirmation and never auto-post them. Effective-dated pay rates. activity_log on every write. The shipped DDL is in the code project (supabase/schema.sql).

---

## 10. AI layer

### 10.1 Document extraction (ship first)
A serverless function sends the image or PDF to a vision LLM with a strict JSON-only instruction (vendor, date, line items, notes, confidence per field). Validate the JSON, write a draft event, flag low-confidence fields. A vision LLM beats fixed OCR here because the hardest inputs are handwritten notes and scribbles on invoices, where traditional OCR fails. Route clean, high-volume typed invoices to Textract in ca-central-1 if volume grows. Cross-check dollar totals against the order amount to auto-flag the over-ship and missing-item discrepancies the bookings sheet already documents.

Pricing and accuracy, validated for about 1,000 to 3,000 documents per month
| Option | Price | Strengths | Weaknesses |
|---|---|---|---|
| AWS Textract AnalyzeExpense | $0.01 per page, about $10 to $30 per month | Deterministic, fast, strong tables and key-value, ca-central-1 for residency | Weaker on messy handwriting, AWS lock-in |
| Azure AI Document Intelligence, prebuilt Invoice | about $10 per 1,000 pages | Best structured output and bounding boxes, about 1.8 percent character error on handwriting, Canada Central and East | Needs Azure management. Confirm rate on the live calculator |
| Google Document AI Invoice Parser | $0.10 per document of 10 pages or fewer, about $100 to $300 per month | Decent header fields | Per-document rounding makes it about 10 times pricier for single-page receipts, weakest line items |
| GPT-4o vision | $2.50 and $10 per 1M input and output tokens, about $0.01 to $0.05 per page | Single call image to JSON, best on messy handwriting, no separate OCR step | Per-token variance, non-deterministic, US-hosted |
| Claude Sonnet vision | $3 and $15 per 1M input and output tokens, about $0.01 to $0.06 per page, 50 percent off via batch, up to 90 percent off via prompt caching | Lowest hallucination, safest for dollar fields, no training on data by default | OCR-then-extract pattern, US-hosted |

Recommendation: default to Claude Sonnet vision for the dollar fields, GPT-4o as a fallback or cross-check on low-confidence docs, Textract in ca-central-1 for clean high-volume invoices. Avoid Google Invoice Parser on cost. Always return structured JSON, attach a confidence score, and route anything below threshold to a human review screen. Never auto-post low-confidence dollar amounts.

### 10.2 Reorder suggestions (ship second)
The store has heavy seasonality, so use dual-season reorder points: separate peak and off-peak average demand plus safety stock, rather than a single year-round number. Method: pull historical order and receiving data by item and season, compute moving-average or exponential-smoothing demand, lead-time demand, safety stock, and reorder point per SKU, then suggest reorder quantities and surface last year versus this year. Start formula-based in SQL, add ML only after one or two clean seasons. The human decides.

### 10.3 Ask-your-store (ship third)
Embed knowledge notes, vendor rules, the bookings ledger, and maintenance records into pgvector. The owner or manager asks questions like which gift vendors to skip in 2026 and why, what is overdue for payment, or who to call to reorder moccasins (Laurentian Chief, Robert, 1-800-363-7749). The model answers with citations back to the source note or record. This is the remote-oversight tool and what lets a manager run a department Ravi is not expert in.

Hosting note: vision LLM APIs are US-hosted, which is fine for non-personal vendor invoices. For any personal data, prefer the Canadian-region OCR services.

---

## 11. First slice for the call
One loop, built real, in Hardware, because Ravi can validate it:
1. Staff drops a Hardware vendor invoice in, or snaps it with the webcam.
2. The vision model extracts vendor, invoice date, line items, unit costs, and the retail-price notes.
3. Staff confirms in one screen.
4. It posts to the Hardware feed, stamped with who and when.
5. Ravi sees it remotely, original photo attached.

That single loop proves the whole thesis: zero-training capture, structured data out, accountability, and remote visibility. Run a real vendor from the Drive sheet (Orgill or ABBOT) end to end.

---

## 12. Build sequence
- Phase 0, kickoff: confirm stack and open questions, set up the project and one department. Seed vendors from the bookings sheet.
- Phase 1, capture and receiving: the Hardware loop above, with feed and attribution. Demoable.
- Phase 2, pricing and inventory: retail-price history and counts, old versus new. Margin knowledge stops leaking.
- Phase 3, orders, vendors, payments: full vendor ledger replacing the spreadsheet, order versus invoiced reconciliation, due-date notifications.
- Phase 4, manager dashboard: the Today view and follow-ups, rolled out to all departments.
- Phase 5, tribal knowledge and reorder AI.
- Phase 6, ask-your-store.
- Later: property maintenance, HR, licence expiry reminders, price-sign printing, a sales feed.

---

## 13. Canada specifics
- Tax: both candidate locations are in Ontario, so 13 percent HST is the working default regardless of the location flag below. Model tax in a tax_rules table for portability. Show HST as a separate line. Keep records six years.

Province reference for seeding tax_rules
| Region | Rate | Note |
|---|---|---|
| Ontario | 13 percent HST | Working default |
| New Brunswick, Newfoundland and Labrador, Prince Edward Island | 15 percent HST |  |
| Nova Scotia | 14 percent HST | Decreased effective April 1, 2025 |
| British Columbia | 5 percent GST + 7 percent PST |  |
| Saskatchewan | 5 percent GST + 6 percent PST |  |
| Manitoba | 5 percent GST + 7 percent RST | RST expanded to digital services January 1, 2026 |
| Quebec | 5 percent GST + 9.975 percent QST | QST on the pre-tax base |
| Alberta and the territories | 5 percent GST only |  |

- Currency: CAD throughout, currency input masks, amounts as integer cents.
- Residency: choose a Canadian Supabase region, and if used, Textract in ca-central-1. Vision LLM APIs are US-hosted, acceptable for non-personal invoices.
- Privacy: PIPEDA governs the HR and employee data, with consent, access, and security obligations. Quebec Law 25 only triggers if Quebec-resident personal data is processed, which is unlikely for an Ontario store. Treat it as a precaution and a reason to favor Canadian regions if Quebec data ever enters scope.

---

## 14. Opportunities and quick wins
- Quick win 1, the receiving form (Phase 1). Eliminates double entry, captures discrepancies instantly.
- Quick win 2, a payment and due-date dashboard. The sheet shows missing invoices and unclear cheque status. An outstanding-and-overdue view recovers cash-flow control immediately.
- Quick win 3, a price-sign generator. Turn the GardenCenter .docx library into one-click price signs tied to the item retail price.
- Quick win 4, a vendor contact and rules directory. Searchable, replacing Gmail subject-line archaeology.
- Unlocked once data is digital: trend-based forecasting, margin analysis (cost versus retail per item and department), vendor scorecards (on-time percentage, discrepancy rate, flagging vendors that repeatedly over or under-ship), seasonal staffing models, and a true remote-management cockpit so Ravi can hire a manager. Capturing tribal knowledge digitally is the asset that makes the business less owner-dependent and sellable.

---

## 15. Open questions for Ravi
1. How do invoices arrive: paper only, email PDFs, or both. Sets webcam scan versus file upload versus email ingest.
2. Payments: full accounts payable, or paid versus not paid with a confirmation photo and due-date alerts.
3. One manager over all departments, or a lead per department. Sets the roles model.
4. Should floor staff see costs and margins, or only lead, manager, and owner.
5. Any existing data to seed: QuickBooks, a POS, the Excel files. The 2026 bookings sheet is ready to import as vendors and terms today.

---

## 16. Flags and caveats
- Store name is confirmed as Robinsons General Store, acquired by Ravikiran. Lakeside Dry Goods and L_S and Dry goods are a section inside it, not the store name. Still confirm the operating address for records, the licence shows 1062 Main Street, Dorset, Ontario, and an earlier note mentioned Atikokan. Tax is unaffected, since both Dorset and Atikokan are in Ontario at 13 percent HST.
- Human-in-the-loop on dollar fields is non-negotiable. OCR and vision on messy handwriting is good but not perfect. Never auto-post low-confidence amounts.
- Pricing is current as of May 2026 and changes often. LLM per-page cost is variable. Confirm Azure's prebuilt-invoice rate on the live calculator. Use spend caps and scale-to-zero.
- Verify sales-tax logic against current CRA place-of-supply rules at build time. Rates move (Nova Scotia changed April 1, 2025, Manitoba expanded RST January 1, 2026).
- The bookings sheet has inconsistent date formats and mixed terms, so expect a cleaning pass on import. That mess is itself the argument for the app.
- Decision rule: if builder time drops below about one day per week, fall back to Retool to ship CRUD faster and accept the UX ceiling.
