# Checking the invoice reader's value checks and the capture line rules

`src/lib/extractValidate.ts` checks the values the invoice reader returns. The schema fixes
the shape; this fixes the values: confidence in 0 to 1, non-negative finite amounts, real
calendar dates. Anything it has to coerce gets confidence 0 so it goes through the amber
acknowledgement instead of being saved quietly.

Two confident-looking reads also go amber: a line costed at exactly $0 (the
prompt's word for "no cost printed"), and lines whose qty x unit cost sum is more than 5 cents
from the goods subtotal printed on the invoice. The second sets every line to 0 and returns a
reason the capture screen shows to money roles. `extractReply` is everything the extract route
does after the model call: refusal and max_tokens to their 422 sentences, capped to 429, other
failures and unreadable text to 502, success through the value checks.

`src/lib/captureLines.ts` holds the capture screen's line rules. Only a retyped unit cost
that is a real number above 0 clears an amber line; fixing a description or qty, emptying the cost
box, or typing something that is not a number does not. When the role cannot see money,
an amber line is saved with no unit cost, so staff never post a cost they could not check.
`costEntry` reads the cost an owner or manager types later on the feed's "Needs a cost" list:
a number above 0 and up to $100,000, with an optional dollar sign and thousands commas, saved
with confidence 1. "12,50" and "0,500" are refused rather than read as 1250 or 500. Zero is
refused because the invoice reader writes 0 for a cost it could not read.

## Running it

```sh
npx tsc -p scripts/extractvalidate-check/tsconfig.json
cp scripts/extractvalidate-check/check.js scripts/extractvalidate-check/out/
node scripts/extractvalidate-check/out/check.js
```

Runs in CI after the build. extractValidate imports `./anthropic` (for the failure words), which
imports `./aiUsage`; both compile into `out/` beside it, with `dom` in lib for fetch and
Response types. captureLines imports a type only, which compiles away, so no path rewriting is
needed.
