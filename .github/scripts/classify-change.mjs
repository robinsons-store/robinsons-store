// Decides how far a change is allowed to travel on its own.
//
// The model writes the code. THIS decides whether it merges. That split is the whole point:
// a judgement the model makes about its own work is a judgement it can talk itself into, so
// the gate is a script reading the actual diff, and nothing in a Slack message, a Jira
// ticket or a prompt can move it.
//
// A  the change only touches words. Merges itself once the checks are green, and deploys.
// B  the change touches the app. Draft pull request, a person merges. This is the default.
// C  the change touches money, access, the database, or the automation itself.
//    Nothing merges. It is reported and left for a person.
//
// Called by the Slack autopilot after it opens a pull request (ADR-002), and by the parked
// Jira autopilot. The Slack autopilot runs it in a job of its own, from a clean checkout of
// the workflow's own commit, so nothing the model left on its runner can change this file.
//
// Usage: node classify-change.mjs <base-ref> [head-ref]
//   writes tier and reason to GITHUB_OUTPUT. head-ref defaults to HEAD; the Slack loop passes
//   the pull request's head commit so the tier is decided on exactly what CI will check.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Money, access, the database, and the automation's own guard rails. The last group matters
// most: a loop that can edit its own limits does not have limits, and a loop that can edit
// its own reviewer has no reviewer.
//
// Agent instructions are here because they are instructions, not words, and they are matched
// by NAME AT ANY DEPTH because that is how the tools find them: Claude Code reads a CLAUDE.md
// in any folder it works in, and the AGENTS.md convention applies one to the folder it sits
// in. That includes docs/AGENTS.md: it is this project's register of agents, but its name
// makes it instructions to any tool that follows the convention, so it is treated as one.
// The autopilot reads CLAUDE.md first on every run, and .agents/skills is symlinked into
// .claude/skills, so a "documentation" change to any of these rewrites the next run's rules.
// Matched without regard to case, so a file whose name differs only in case is caught too.
//
// LOOP_ENGINEERING.md and the decision records describe the limits, so changing them is a
// decision a person makes too. So is any database script or configuration file, wherever it
// sits: a .sql file outside supabase/ can still be pasted into the database, and a manifest
// or config file changes how something runs (the Slack app's scopes, the lint and type
// gates, the servers an agent may call).
export const BLOCKED = [
  /^supabase\//i,
  /^src\/lib\/payments\.ts$/i,
  /^src\/lib\/auth\.ts$/i,
  /^src\/lib\/edit\.ts$/i,
  /^src\/lib\/serverMember\.ts$/i,
  /^src\/lib\/supabaseClient\.ts$/i,
  /^src\/app\/api\//i,
  /^\.github\//i,
  /(^|\/)\.(claude|agents|kiro|cursor|windsurf|clinerules)\//i,
  /(^|\/)(CLAUDE|CLAUDE\.local|AGENTS?|GEMINI|SKILL|copilot-instructions)\.md$/i,
  /(^|\/)\.(cursorrules|windsurfrules|clinerules|mcp\.json)$/i,
  /^skills-lock\.json$/i,
  /^docs\/LOOP_ENGINEERING\.md$/i,
  /^docs\/adr\//i,
  // The rest of what CLAUDE.md tells every agent to read before building. STATUS.md and
  // VERIFICATION.md stay words: CLAUDE.md has every pull request update both.
  /^ONBOARDING\.md$/i,
  /^docs\/(README|REQUIREMENTS|PLATFORM|HANDOVER|OWNER_NOTES|SUPABASE_SETUP|ENVIRONMENTS)\.md$/i,
  /^vercel\.json$/i,
  /^package\.json$/i,
  /^package-lock\.json$/i,
  /\.sql$/i,
  /\.(ya?ml|json|jsonc|toml|ini|cfg|conf)$/i,
  /(^|\/)\.(env[^/]*|npmrc)$/i
];

// Words only: prose formats, and nothing else. No logic lives in any of these. Anything else
// under docs/ is not words whatever folder it sits in: a script there (owner-notes/render.mjs)
// is code, an HTML page can carry script, and an image is a binary whose size the line limit
// below cannot see. The in-app guide (src/lib/appGuide.ts) used to be here and is not any
// more: it is TypeScript, so a diff to it can carry code, and a tier that merges unattended
// must not be able to.
export const WORDS_ONLY = [
  /^docs\/.+\.(md|txt)$/i,
  /^[^/]+\.md$/i
];

// A words-only change should be small. A thousand-line "documentation" change is something
// else wearing a hat.
export const MAX_AUTO_LINES = 300;

// Control characters (C0, DEL and C1), and the Unicode line and paragraph separators.
const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u;

/**
 * The decision itself, pure, so the rules can be tested without a git repository.
 * notPlainText lists files git reports as binary, or whose new mode is not a plain file (a
 * link, a submodule, an executable bit). Those are never words, whatever their name.
 */
export function classify(files, changedLines, notPlainText = []) {
  if (!files.length) return { tier: "none", reason: "Nothing changed." };

  // A file name with a line break or other control character is never words, and it is not
  // repeated in the reason: the reason is written to GITHUB_OUTPUT, one value per line.
  if (files.some((f) => CONTROL.test(f))) {
    return { tier: "C", reason: "A file name contains a control character, so a person must review it." };
  }

  const blocked = files.filter((f) => BLOCKED.some((r) => r.test(f)));
  if (blocked.length) {
    return { tier: "C", reason: `Touches files a person must review: ${blocked.slice(0, 5).join(", ")}` };
  }

  const notWords = files.filter((f) => notPlainText.includes(f) || !WORDS_ONLY.some((r) => r.test(f)));
  if (!notWords.length && changedLines <= MAX_AUTO_LINES) {
    return { tier: "A", reason: `Words only (${files.length} files, ${changedLines} lines).` };
  }

  return {
    tier: "B",
    reason: notWords.length
      ? `Not words only, so a person merges: ${notWords.slice(0, 5).join(", ")}`
      : `Words only but large (${changedLines} lines), so a person looks first.`
  };
}

/**
 * Reads `git diff -z --numstat` and `git diff -z --raw` output. Pure, so it is tested too.
 * -z keeps every file name exactly as written; without it git quotes unusual names, and a
 * quoted name matches none of the rules above.
 */
export function parseDiff(numstat, raw) {
  const files = [];
  const notPlainText = [];
  let lines = 0;
  // "added<TAB>deleted<TAB>path". Git writes "-" for both counts on a binary file, which would
  // otherwise count as zero lines and slip under the line limit at any size.
  for (const entry of numstat.split("\0").filter(Boolean)) {
    const [added, deleted, ...name] = entry.split("\t");
    const path = name.join("\t");
    files.push(path);
    if (added === "-" || deleted === "-") notPlainText.push(path);
    else lines += Number(added) + Number(deleted);
  }
  // ":oldmode newmode oldsha newsha status", then the path. 100644 is a plain file and 000000
  // a deletion; anything else is a link, a submodule or an executable.
  const fields = raw.split("\0");
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const newMode = fields[i].split(" ")[1];
    if (newMode !== "100644" && newMode !== "000000" && !notPlainText.includes(fields[i + 1])) {
      notPlainText.push(fields[i + 1]);
    }
  }
  return { files, lines, notPlainText };
}

/** One GITHUB_OUTPUT line. Anything that could end the line early becomes a space. */
export function outputLine(key, value) {
  return `${key}=${String(value).replace(new RegExp(CONTROL.source, "gu"), " ")}\n`;
}

function out(key, value) {
  const f = process.env.GITHUB_OUTPUT;
  console.log(outputLine(key, value).trimEnd());
  if (f) appendFileSync(f, outputLine(key, value));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const base = process.argv[2] || "origin/main";
  const head = process.argv[3] || "HEAD";
  let result;
  try {
    // --no-renames so a file moved OUT of a blocked path still lists its old name.
    const diff = (format) => execFileSync(
      "git", ["diff", "-z", "--no-renames", format, `${base}...${head}`],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
    const { files, lines, notPlainText } = parseDiff(diff("--numstat"), diff("--raw"));
    result = classify(files, lines, notPlainText);
  } catch (e) {
    result = { tier: "C", reason: `Could not read the diff, so nothing is merged: ${e.message}` };
  }
  // Tier last: when a key appears twice the later line wins, so nothing in the reason can
  // stand in for it.
  out("reason", result.reason);
  out("tier", result.tier);
}
