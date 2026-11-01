// Rules for keeping develop level with main and for the dev site's part in promotion, kept
// pure so they can be tested without a repository, a token or a network. The workflows
// gather the facts; this decides.
//
//   node .github/scripts/branch-flow.mjs sync       reads MAIN_AHEAD
//   node .github/scripts/branch-flow.mjs database   reads CHANGED_FILES, one path per line
//   node .github/scripts/branch-flow.mjs devgate    reads DEV_CHECKED, DEV_HEALTHY
//
// Each writes its answer to GITHUB_OUTPUT and the reason to the log.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Does develop need main's commits carried back?
//
// Any commit, even a promotion's merge commit that changes no file: promote.yml merges only
// when main is an ancestor of develop, so one missing merge commit stops the next promotion.
export function syncDecision({ mainAhead }) {
  return Number.isFinite(mainAhead) && mainAhead > 0 ? "open" : "nothing";
}

// Does a change need the database scripts run? The same paths migrate.yml's push trigger
// watches: supabase/** and the workflow itself.
export function touchesDatabase(files) {
  return (files || []).some((f) => {
    const p = String(f).trim();
    return p.startsWith("supabase/") || p === ".github/workflows/migrate.yml";
  });
}

// May promotion go, as far as the dev site is concerned? Promotion means "it was tried on
// the dev site", so the dev site must be up. No DEV_URL means nobody could have tried it.
export function promotionGate({ checked, healthy }) {
  if (!checked) {
    return { ok: false, reason: "The dev site was not checked because the DEV_URL variable is not set." };
  }
  if (!healthy) return { ok: false, reason: "The dev site failed its health check." };
  return { ok: true, reason: "The dev site is healthy." };
}

function out(key, value) {
  const f = process.env.GITHUB_OUTPUT;
  if (f) appendFileSync(f, `${key}=${value}\n`);
}

function main(mode) {
  const env = process.env;
  if (mode === "sync") {
    const a = syncDecision({ mainAhead: Number(env.MAIN_AHEAD) });
    console.log(a === "open" ? "main has commits develop lacks." : "develop already has everything on main.");
    out("action", a);
    return 0;
  }
  if (mode === "database") {
    const touched = touchesDatabase((env.CHANGED_FILES || "").split("\n").filter(Boolean));
    console.log(touched ? "Database scripts changed, so migrate runs." : "No database scripts changed.");
    out("touched", touched ? "true" : "false");
    return 0;
  }
  if (mode === "devgate") {
    const g = promotionGate({ checked: env.DEV_CHECKED === "true", healthy: env.DEV_HEALTHY === "true" });
    if (!g.ok) {
      console.log(`::error::Not promoted. ${g.reason} Production has not changed.`);
      return 1;
    }
    console.log(g.reason);
    return 0;
  }
  console.error(`Unknown mode "${mode}". Use sync, database or devgate.`);
  return 2;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exit(main(process.argv[2]));
