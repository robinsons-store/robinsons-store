# Checking the invoice reader's value checks and the capture line rules

`src/lib/extractValidate.ts` checks the values the invoice reader returns. The schema fixes
the shape; this fixes the values: confidence in 0 to 1, non-negative finite amounts, real
calendar dates. Anything it has to coerce gets confidence 0 so it goes through the amber
acknowledgement instead of being saved quietly.

The same file adds up the lines (qty x unit cost) and compares them with the subtotal, HST and
total printed on the invoice (`checkTotals`). The lines match the printed subtotal, or the
printed total less the printed tax, within 5 cents. HST at the rate is assumed only when no
tax is printed (0.00 on zero-rated goods is a printed tax), and a total that equals the lines
counts only when the paper prints no subtotal and no tax, so an HST row read as a purchase is
not let through. A printed figure that is not a usable number sets `printed_unreadable`, and
then only the printed subtotal itself can vouch for the lines. A mismatch sets
`totals_mismatch`. An invoice number with a dollar sign or an amount in it, over 40
characters or over four words, is left blank, since it goes into the notes staff read. The check also runs every eval
sample in `scripts/aievals-check/samples/extract.json` through `normalizeExtraction` and
requires each sample's verdict to be the one this code computes.

`src/lib/vendorMatch.ts` matches the vendor the reader returned to one on file in the
department: case, accents, punctuation and a trailing company suffix ignored, "&" read as
"and", an exact name preferred, and a tie between two vendors matching neither.

`src/lib/captureLines.ts` holds the capture screen's line rules. Only a retyped unit cost
that is a real number clears an amber line; fixing a description or qty, emptying the cost
box, or typing something that is not a number does not. When the role cannot see money,
an amber line is saved with no unit cost, so staff never post a cost they could not check.
`costEntry` reads the cost an owner or manager types later on the feed's "Needs a cost" list:
a number above 0 and up to $100,000, with an optional dollar sign and thousands commas, saved
with confidence 1. "12,50" and "0,500" are refused rather than read as 1250 or 500. Zero is
refused because the invoice reader writes 0 for a cost it could not read.
`notesWithInvoiceNumber` puts the invoice number at the front of the notes unless it is
already there, since the capture form has no box for it.

## Running it

```sh
npx tsc -p scripts/extractvalidate-check/tsconfig.json
cp scripts/extractvalidate-check/check.js scripts/extractvalidate-check/out/
node scripts/extractvalidate-check/out/check.js
```

Runs in CI after the build. None of the three modules has a runtime import (captureLines
imports a type only, which compiles away), so no path rewriting is needed.
