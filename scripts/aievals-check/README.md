# Golden cases for the invoice reader and Ask

Status: PROPOSED, 2026-10-24. Owner: the developer. Approver: Ravi Kiran.

**25 fixed cases for the two AI routes, scored by rules rather than judgement: 12 invoices for
`/api/extract` and 13 questions for `/api/ask`.** The scorer tests run with no model; the live
run (`npm run eval:ai`) spends the API key and has not been run yet. Everything in `cases/` and
`samples/` is made up. Never paste a real invoice, vendor or store record into them.

## Running the live evals (spends the API key)

```sh
npm run eval:ai
```

This calls the real route handlers, so the prompts, the output schema, the value checks in
`src/lib/extractValidate.ts` and the Ask context are exactly what is deployed, and every model
call goes through `src/lib/anthropic.ts`. It reads `ANTHROPIC_API_KEY` (and `ANTHROPIC_MODEL`,
if set) from the shell or `.env.local`, the same file `npm run dev` uses. By default each case
runs 3 times: 75 model calls. It prints a pass rate per case and the checks that failed, and
saves every answer under `out/live/` with the invoices it sent.

Options go after `--`, with a space before each value:

| Option | Effect |
|---|---|
| `--runs N` | Runs per case (default 3). `--runs 1` is 25 calls. |
| `--only TEXT` | Only cases whose id contains TEXT, for example `--only ask-staff`. |
| `--offline` | No key, no network, no cost: the routes answer from the hand-written samples. Checks that the routes still load and the prompts still build. |

Any other argument, including `--runs=1` or a misspelled `--offline`, stops the run before
anything is sent [V-run, `--offlne`, `--runs=1`, `--runs x` each exit 1, 2026-10-24].

Safeguards, each checked by running it:
- It exits at once when `CI` is set [R `scripts/aievals-check/live.ts:55`], and without a key unless `--offline`.
- Every Supabase setting is dropped before app code loads [R `scripts/aievals-check/live.ts:63`], and any request
  to anything but the Anthropic API is refused [R `scripts/aievals-check/live.ts:89`].
- The signed-in member and the database are stood in for. The stand-in applies the route's
  own `store_id` and `voided_at` filters, so store scoping and voided rows stay the route's
  job. A query method it does not implement throws and names itself rather than being
  skipped, and every database write, RPCs included, is recorded and must be expected by the
  case (the AI usage log's own `ai_call_begin` and `ai_call_finish` are not counted).

## What is checked

Extract (`scoreExtract`): vendor (company suffixes and `&` vs `and` ignored), invoice date
exactly, each expected line found by its key words, quantity exactly, unit cost and
handwritten retail price within one cent, the exact line count, no Subtotal, HST or Total row
read as a purchase, and for a returned item that the line lands in the capture screen's amber
band (confidence below 0.7, pinned to `src/app/capture/page.tsx`). Also the invoice number
(letters and digits only, a leading "Invoice no." ignored), the subtotal, HST and total as
printed within one cent (null where the paper prints none), and the verdict of the totals
check in `src/lib/extractValidate.ts`. The CI check confirms each expected printed figure is
what the rendered invoice prints; `scripts/extractvalidate-check` confirms each sample's
verdict is what that code computes from the sample's own lines.

Ask (`scoreAsk`): facts that must appear (dollar amounts compared as numbers, so `$1,186.50`
and `1186.50` both count), facts and patterns that must not, no em dash, no markdown, and no
database writes unless the case expects them. For the money and store-scoping cases the
prompt the route built is checked too (`scorePrompt`), before any model reads it: a staff
prompt must contain no `$` at all, and another store's vendor must not be in it. A wording
miss can be the model's fault; a prompt miss is always the route's.

The must-not-say cases: invented vendor, a vendor that only exists in another store, a voided
invoice, dollar figures and minimum orders for staff, a weather question, a planted
instruction in a knowledge note, a planted instruction printed on an invoice, a receipt with
no vendor name, a return line that must not read as a confident purchase, and overdue
invoices named alongside ones that are not due or already paid.

## Known gaps

A case marked `knownGap` was written for a defect that is not fixed yet. It is expected to
fail every run and is reported apart (`GAP`) without failing the run; once it passes, the run
fails (`FIXED?`) until the `knownGap` line is deleted, so a fix is never left unrecorded.

| Case | Defect | State |
|---|---|---|
| `ask-owed-partial-payment` | Ask lists a partly paid invoice at its full total as what is owed: the route reads no payments | TARGET (fix not built); the prompt check fails today [V-run, `--offline --only partial`, 2026-10-24] |

## The CI check

```sh
npx tsc -p scripts/aievals-check/tsconfig.json
cp scripts/aievals-check/check.js scripts/aievals-check/out/
node scripts/aievals-check/out/check.js
```

No model and no key. It runs the scorers against the samples in `samples/`, written by hand in
each route's response shape (not recorded from the model), each one expected to pass or to
fail on a named check. It also checks the golden data itself: every expected line names
exactly one printed row and agrees with its quantity, price and handwritten note; every
invoice renders as a valid PDF; every `@PHRASE` list resolves. A step in
`.github/workflows/ci.yml`.

One tripwire, for phone numbers only: any phone number in the five case and sample files
must be in 555-0100 to 555-0199, the range reserved for fiction [R `scripts/aievals-check/check.js:33`]. It cannot
tell a real invoice from a made-up one; only the person adding a case can.

## Adding a case

Add it to `cases/extract.json` or `cases/ask.json` with a `covers` line saying what it
protects, add at least one passing sample to `samples/`, and run the CI check. Invoice tables
state quantities and unit prices only; the renderer works out amounts and totals so a case
cannot carry an arithmetic slip. After a live run, an answer in `out/live/results-*.json` can
be pasted into `samples/` as a new sample.

## How this maps to the rest of the docs

The routes these cases exercise: docs/AGENTS.md (Invoice reader, Ask the store). Where the
build stands: docs/STATUS.md; the sign-off row: docs/VERIFICATION.md. The rules the cases
encode (money hidden from staff, store scoping, plain text, no em dashes):
`.claude/skills/robinsons-store/SKILL.md`.

**Basis: 8 claims checked this session (2026-10-24), 8 confirmed, 0 killed, 1 source.** The
four `[R]` lines were opened at the named lines; the argument, CI, no-key, offline and
known-gap behaviour was run. Source: this repository.

Updated 2026-10-30 on branch capture-invoice-checks: 3 claims checked, 3 confirmed. The
case count (25, 12 invoices) and call counts follow from cases/; the CI check passes 124 of
124 and the offline run 24 of 24 [V-run, both, 2026-10-30]; the four `[R]` lines above re-read.
