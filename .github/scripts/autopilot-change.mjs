// What the Slack autopilot's build produced, read as data on a runner the builder never had.
//
// The build job cannot push. It hands its work over as a git bundle (an artifact of the
// run), and the review and ship jobs each read it with this script, from a fresh checkout of
// the workflow's own commit. Fetching from a bundle only stores objects and moves one ref:
// nothing in the change runs, no hook in it fires, and a bundle whose base this repository
// does not have is refused by git, which fails the step.
//
// THE GUARD. A change that touches .github/ or .claude/ is never pushed. The automation
// cannot edit the automation (docs/LOOP_ENGINEERING.md), and keeping workflow files off
// these branches is also what makes it safe for ship to start CI on them.
//
// Two ways a diff can hide a path, both closed here:
//   - A rename lists only its new name, so a file moved out of .github/ would read as a docs
//     change. --no-renames lists both sides, as the classifier does.
//   - A three-dot diff starts at the merge base. A commit built on an OLDER base would carry
//     that older .github/ in its tree while its diff looks clean. So the commit must sit on
//     top of the base commit the find job read before the build started, and that commit
//     must still be in the base branch's history.
//
// Usage: node autopilot-change.mjs <bundle> <base-branch> <base-commit>
//   Run inside the checkout. Fetches origin/<base-branch>, stores the bundle's HEAD at
//   refs/autopilot/change and writes sha, files, changed and guard to GITHUB_OUTPUT. guard
//   is written last and only after everything else worked, so a failure anywhere leaves it
//   empty, and an empty guard pushes nothing.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REF = "refs/autopilot/change";
export const AUTOMATION = /^\.(github|claude)\//i;

/** ok, or automation when any changed path is the automation's own. */
export function guardFor(files) {
  return files.some((f) => AUTOMATION.test(f)) ? "automation" : "ok";
}

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/**
 * Fetch the base and the bundle, and say what changed. Throws if either cannot be read, or
 * if the change does not sit on top of `from`, the base commit the run started from.
 */
export function readChange(bundle, base, from, cwd = process.cwd()) {
  if (!/^[\w./-]+$/.test(base) || base.startsWith("-")) throw new Error(`Not a branch name: ${base}`);
  if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(from || "")) throw new Error(`Not a commit: ${from}`);
  git(["fetch", "--no-tags", "--quiet", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`], cwd);
  git(["-c", "fetch.fsckObjects=true", "fetch", "--no-tags", "--quiet", bundle, `+HEAD:${REF}`], cwd);
  const sha = git(["rev-parse", "--verify", `${REF}^{commit}`], cwd).trim();
  // Each exits non-zero, and so throws, when the first commit is not an ancestor of the second.
  git(["merge-base", "--is-ancestor", from, `origin/${base}`], cwd);
  git(["merge-base", "--is-ancestor", from, sha], cwd);
  const files = git(["diff", "--no-renames", "--no-ext-diff", "--name-only", "-z", `origin/${base}...${sha}`], cwd)
    .split("\0")
    .filter(Boolean);
  return { sha, files, changed: files.length > 0, guard: guardFor(files) };
}

function out(key, value) {
  console.log(`${key}: ${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const [bundle, base, from] = process.argv.slice(2);
  if (!bundle || !base || !from) {
    console.log("Usage: node autopilot-change.mjs <bundle> <base-branch> <base-commit>");
    process.exit(1);
  }
  const change = readChange(bundle, base, from);
  out("sha", change.sha);
  out("files", change.files.length);
  out("changed", change.changed);
  if (change.changed && change.guard !== "ok") {
    console.log("::warning::The build edited the automation's own files. Nothing will be pushed.");
  }
  out("guard", change.changed ? change.guard : "");
}
