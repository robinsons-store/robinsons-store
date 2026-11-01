// The rules for moving changes between develop and main, kept pure so they can be tested
// without a repository, a token or a network. The workflows gather the facts; this decides.
//
//   node .github/scripts/branch-flow.mjs promote    reads AHEAD, CI, DEV_HEALTHY
//   node .github/scripts/branch-flow.mjs sync       reads MAIN_AHEAD, TREES_DIFFER
//   node .github/scripts/branch-flow.mjs database   reads CHANGED_FILES, one path per line
//
// Each writes its answer to GITHUB_OUTPUT as action=..., and the reason to the log.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Should develop be promoted to main now?
//
// ahead       commits on develop that main lacks
// ci          conclusion of CI on develop's last commit: "success", "failure", ...,
//             "pending" while it runs, or null when it never ran
// devHealthy  the dev site's own health check: true, false, or null when nothing was asked
//             because DEV_URL is not set
//
// Every unknown refuses or waits. Promotion is the one step that reaches the store's ledger.
export function promotionDecision({ ahead, ci, devHealthy }) {
  if (!ahead) return { action: "nothing", reason: "develop and main already agree." };
  if (ci === null || ci === undefined || ci === "pending") {
    return { action: "wait", reason: "CI has not finished on develop's last commit." };
  }
  if (ci !== "success") {
    return { action: "refuse", reason: `CI on develop's last commit ended ${ci}, not success.` };
  }
  if (devHealthy === null || devHealthy === undefined) {
    return {
      action: "refuse",
      reason: "The dev site was not checked because the DEV_URL variable is not set. Nothing was tried there, so nothing is promoted."
    };
  }
  if (!devHealthy) return { action: "refuse", reason: "The dev site failed its health check." };
  return { action: "merge", reason: `${ahead} commit(s) passed CI and the dev site is healthy.` };
}

// Does develop need main's changes carried back?
//
// A promotion leaves main one merge commit ahead with exactly develop's files, so the commit
// count alone would open a pointless pull request after every promotion. Only a difference
// in files that main has and develop lacks is worth carrying.
export function syncDecision({ mainAhead, treesDiffer }) {
  return mainAhead > 0 && treesDiffer ? "open" : "nothing";
}

// Did a change touch the database scripts, so migrate has to run for it?
export function touchesDatabase(files) {
  return (files || []).some((f) => String(f).trim().startsWith("supabase/"));
}

function out(key, value) {
  const f = process.env.GITHUB_OUTPUT;
  if (f) appendFileSync(f, `${key}=${value}\n`);
}

function parseHealthy(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function main(mode) {
  const env = process.env;
  if (mode === "promote") {
    const d = promotionDecision({
      ahead: Number(env.AHEAD || 0),
      ci: env.CI_CONCLUSION || null,
      devHealthy: parseHealthy(env.DEV_HEALTHY)
    });
    console.log(`${d.action}: ${d.reason}`);
    out("action", d.action);
    return 0;
  }
  if (mode === "sync") {
    const a = syncDecision({ mainAhead: Number(env.MAIN_AHEAD || 0), treesDiffer: env.TREES_DIFFER === "true" });
    console.log(a === "open" ? "main has changes develop lacks." : "develop already has everything main has.");
    out("action", a);
    return 0;
  }
  if (mode === "database") {
    const touched = touchesDatabase((env.CHANGED_FILES || "").split("\n").filter(Boolean));
    console.log(touched ? "The change touches supabase/, so migrate runs." : "No database scripts changed.");
    out("touched", touched ? "true" : "false");
    return 0;
  }
  console.error(`Unknown mode "${mode}". Use promote, sync or database.`);
  return 2;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exit(main(process.argv[2]));
