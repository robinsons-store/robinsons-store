// The rules that carry main's changes back to develop, and the headers the health check
// sends.
//
// Promotion refuses unless develop contains everything on main (promote.yml). So keeping
// develop level is not tidiness: without it, promotion stops.
//
// Run: node .github/scripts/branch-flow.test.mjs

import { promotionGate, syncDecision, touchesDatabase } from "./branch-flow.mjs";
import { requestHeaders } from "./health-check.mjs";

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

console.log("bringing develop level with main:");
check("level already", syncDecision({ mainAhead: 0 }), "nothing");
check(
  "a promotion's merge commit only: same files, but promotion needs main inside develop",
  syncDecision({ mainAhead: 1 }),
  "open"
);
check("a fix merged straight to main", syncDecision({ mainAhead: 2 }), "open");
check("an unreadable count is not a reason to open", syncDecision({ mainAhead: NaN }), "nothing");

console.log("\ndoes a change need the database scripts run:");
check("a migration", touchesDatabase(["supabase/feedback.sql", "src/app/page.tsx"]), true);
check("the run order alone", touchesDatabase(["supabase/run-order.txt"]), true);
check("migrate.yml itself, as its push trigger counts it", touchesDatabase([".github/workflows/migrate.yml"]), true);
check("app code only", touchesDatabase(["src/lib/payments.ts", "docs/STATUS.md"]), false);
check("a doc with supabase in its name", touchesDatabase(["docs/SUPABASE_SETUP.md"]), false);
check("nothing changed", touchesDatabase([]), false);

console.log("\nmay promotion go, as far as the dev site is concerned:");
check("dev site healthy", promotionGate({ checked: true, healthy: true }).ok, true);
check("dev site unhealthy", promotionGate({ checked: true, healthy: false }).ok, false);
check("DEV_URL unset, so nothing was tried there", promotionGate({ checked: false, healthy: true }).ok, false);
check("a refusal names the variable", promotionGate({ checked: false, healthy: true }).reason.includes("DEV_URL"), true);

console.log("\nheaders for the health check:");
check("no secrets", requestHeaders({}), { Accept: "application/json" });
check("cron secret only", requestHeaders({ cronSecret: "c" }), { Accept: "application/json", "x-cron-secret": "c" });
check(
  "past Vercel's login wall on the dev site",
  requestHeaders({ bypass: "b" }),
  { Accept: "application/json", "x-vercel-protection-bypass": "b" }
);
check("blank values add nothing", requestHeaders({ cronSecret: " ", bypass: "" }), { Accept: "application/json" });

if (failed) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
