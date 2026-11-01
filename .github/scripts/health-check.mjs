// Asks a site's /api/health what it thinks of itself, and turns the answer into a pass or
// fail the workflow can act on.
//
// Retries a few times before calling it a failure: a deploy that is still swapping over, or
// a cold start, is not a broken release, and a watchdog that cries wolf gets muted.
//
// The dev site sits behind Vercel's login wall like every preview. VERCEL_AUTOMATION_BYPASS_SECRET,
// when set, is sent as Vercel's bypass header so a workflow can ask it too. Without it the
// dev site answers with a login page, which reads as "not JSON" below, never as healthy.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ATTEMPTS = 4;
const GAP_MS = 20000;

// Pure, so the headers can be tested without a site.
export function requestHeaders({ cronSecret, bypass } = {}) {
  const headers = { Accept: "application/json" };
  if (cronSecret && cronSecret.trim()) headers["x-cron-secret"] = cronSecret;
  if (bypass && bypass.trim()) headers["x-vercel-protection-bypass"] = bypass;
  return headers;
}

function out(key, value) {
  const f = process.env.GITHUB_OUTPUT;
  console.log(`${key}: ${value}`);
  if (f) appendFileSync(f, `${key}=${String(value).replace(/\n/g, " ")}\n`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const SITE = (process.env.SITE || "").replace(/\/+$/, "");
  const headers = requestHeaders({
    cronSecret: process.env.CRON_SECRET || "",
    bypass: process.env.VERCEL_AUTOMATION_BYPASS_SECRET || ""
  });

  if (!SITE) {
    out("checked", "false");
    out("healthy", "true");
    out("summary", "No site configured, nothing checked.");
    return;
  }
  out("checked", "true");

  let last = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const r = await fetch(`${SITE}/api/health`, { headers });
      const text = await r.text();

      if (!r.ok) {
        last = `The site answered ${r.status} on /api/health.`;
      } else {
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          // A login wall or an HTML error page: not a health verdict either way.
          last = "The health endpoint did not return JSON. It may be behind deployment protection.";
          body = null;
        }
        if (body) {
          if (body.configured === false) {
            out("healthy", "true");
            out("summary", "No database configured on this deployment, so there was nothing to check.");
            return;
          }
          if (body.ok) {
            const n = (body.checks || []).length;
            out("healthy", "true");
            out("summary", `All ${n} checks passed.`);
            return;
          }
          const failed = (body.checks || []).filter((c) => !c.ok);
          last = failed.map((c) => `${c.name}${c.detail ? `: ${c.detail}` : ""}`).join("; ") || "Reported not ok with no detail.";
          // A real failing check will still be failing in twenty seconds. Retrying costs
          // little and rules out a half-finished deploy.
        }
      }
    } catch (e) {
      last = `Could not reach the site: ${e.message}`;
    }

    if (attempt < ATTEMPTS) {
      console.log(`Attempt ${attempt}: ${last}. Trying again.`);
      await sleep(GAP_MS);
    }
  }

  out("healthy", "false");
  out("summary", last);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
