// The rules that move a change from develop to main, and main's changes back to develop.
//
// Two ways this goes wrong, and they are not equally bad:
//
//   promoting what should not go      -> a broken change reaches the store's live site
//   refusing what could have gone     -> somebody reads the log and runs it again
//
// So every unknown refuses. A missing dev address, a check that never ran, or a dev site
// that would not answer is a no, not a maybe.
//
// Run: node .github/scripts/branch-flow.test.mjs

import { promotionDecision, syncDecision, touchesDatabase } from "./branch-flow.mjs";
import { requestHeaders } from "./health-check.mjs";

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const ready = { ahead: 3, ci: "success", devHealthy: true };

console.log("promoting develop to main:");
check("nothing on develop that main lacks", promotionDecision({ ...ready, ahead: 0 }).action, "nothing");
check("everything green", promotionDecision(ready).action, "merge");
check("CI still running", promotionDecision({ ...ready, ci: "pending" }).action, "wait");
check("CI never ran on develop's last commit", promotionDecision({ ...ready, ci: null }).action, "wait");
check("CI failed", promotionDecision({ ...ready, ci: "failure" }).action, "refuse");
check("CI cancelled is not a pass", promotionDecision({ ...ready, ci: "cancelled" }).action, "refuse");
check("dev site unhealthy", promotionDecision({ ...ready, devHealthy: false }).action, "refuse");
check("dev site never checked (no DEV_URL)", promotionDecision({ ...ready, devHealthy: null }).action, "refuse");
check("a refusal says why", promotionDecision({ ...ready, devHealthy: null }).reason.includes("DEV_URL"), true);
check("failed CI outranks an unhealthy dev site", promotionDecision({ ci: "failure", ahead: 1, devHealthy: false }).reason.includes("CI"), true);

console.log("\nbringing develop level with main:");
check("level already", syncDecision({ mainAhead: 0, treesDiffer: false }), "nothing");
check("a promotion merge commit only: same files, nothing to carry", syncDecision({ mainAhead: 1, treesDiffer: false }), "nothing");
check("a fix merged straight to main", syncDecision({ mainAhead: 2, treesDiffer: true }), "open");
check("develop ahead with new work, main has nothing new", syncDecision({ mainAhead: 0, treesDiffer: true }), "nothing");

console.log("\ndoes a change touch the database scripts:");
check("a migration", touchesDatabase(["supabase/feedback.sql", "src/app/page.tsx"]), true);
check("the run order alone", touchesDatabase(["supabase/run-order.txt"]), true);
check("app code only", touchesDatabase(["src/lib/payments.ts", "docs/STATUS.md"]), false);
check("a doc that mentions supabase in its name", touchesDatabase(["docs/SUPABASE_SETUP.md"]), false);
check("nothing changed", touchesDatabase([]), false);

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
