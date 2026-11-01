# Checking the invoice field registry

`src/lib/invoiceFields.ts` decides which invoice questions each department's forms ask. It
replaced three hand-coded booleans whose call sites had already drifted: the edit form was
nulling a saved PO number and service category on any invoice whose vendor was not the
matching department, while preserving the estimate number beside them.

This runs the real module in node and pins the old behaviour exactly, department by
department, because these are live money screens and the registry's acceptance criterion
was zero behaviour change on the asking side. The one deliberate change is on the SAVING
side: the edit path now writes a hidden question's seeded answer back instead of nulling
it, so correcting an amount can no longer erase a fact.

## Running it

CI runs this through `run.sh`, in the "Module checks" step, so a red result blocks the
merge. Run it from the repo root:

```sh
bash scripts/invoicefields-check/run.sh
```

`run.sh` compiles the module with this folder's tsconfig into `out/`, rewrites the
`@/lib/...` requires that tsc leaves in the output to `./...` with sed, copies `check.js`
into `out/` and runs it with node.

Run it whenever `invoiceFields.ts`, `departments.ts` or `fieldChoices.ts` changes. The
department matrix at the top of check.js is the contract, and with no rows from the
Department fields screen it must still hold exactly. The assertions added on 2026-10-25 pin
what that screen may change (delivery, PO number, property work, terms) and what it may not
(number, date, amount, tax, freight, filing, due date, status), and that a section takes its
department's invoice shape. It tests the matrix only: the edit form's save path is not
covered here.
