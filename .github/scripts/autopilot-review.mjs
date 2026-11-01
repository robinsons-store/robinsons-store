// The review between "the builder committed something" and "anyone is told it is ready".
//
// The Slack autopilot runs in four jobs (.github/workflows/slack-autopilot.yml):
//
//   find       reads the channel and posts the first card. No model.
//   build      the model builds and commits. It cannot push; the commit leaves as a bundle.
//   review     a FRESH runner that checks out the workflow's own commit, lays the bundle's
//              files out as data in a subfolder, and has money-reviewer and
//              invariant-auditor read them. Read, Grep and Glob only; nothing from the
//              change is executed. `weigh` below turns their answers into verdicts.
//   ship       reads the bundle again, applies the guard and the tier, pushes the branch,
//              opens the pull request, merges tier A only if both reviewers passed the
//              commit it is merging, and updates the Slack card. `say` below decides the card.
//
// WHY A FRESH RUNNER. The builder had a shell on the build runner. Anything it left there (a
// line in $GITHUB_ENV, a program earlier on the PATH, a background process, a git hook)
// would run with every later step on that runner, reviewers included. ADR-002 moved the
// classifier off that runner for the same reason.
//
// WHY THE REPORTS GO TO SLACK AND NOT THE PULL REQUEST. The repository is public. A report
// that says "staff can see invoice totals on this screen" describes a weakness, and a public
// pull request is the wrong place for it. The Slack workspace is the store's own. The pull
// request gets the verdicts and a pointer to the thread.
//
// WHY A MODEL REVIEWING A MODEL IS NOT THE GATE. A model asked "is this right?" usually says
// yes, which is why docs/LOOP_ENGINEERING.md keeps decisions in scripts. The reviewers are a
// second look that names lines for the person who merges. A person still merges tier B and
// C, and the classifier, not the reviewers, decides the tier.
//
// FAILING CLOSED. A reviewer that errors, runs out of turns, or ends without a verdict line
// counts as "did not finish", which blocks a tier A merge and turns the card red exactly
// like a finding. Silence is never a pass.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

export const PASS_LINE = "VERDICT: PASS";
export const FINDINGS_LINE = "VERDICT: FINDINGS";

export const REVIEWERS = [
  { key: "money", name: "Money reviewer" },
  { key: "invariant", name: "Invariant auditor" }
];

/**
 * The final answer from a claude-code-action execution file, or null.
 *
 * The file is the action's message log. The last message of type "result" holds the final
 * text and whether the run errored. Accepts a JSON array or one JSON object per line, since
 * which one the action writes is its business, not ours.
 */
export function finalResult(raw) {
  if (!raw || typeof raw !== "string") return null;
  let messages = [];
  try {
    const parsed = JSON.parse(raw);
    messages = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    for (const line of raw.split("\n")) {
      try {
        messages.push(JSON.parse(line));
      } catch {
        // A line that is not JSON is not a message.
      }
    }
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.type === "result") {
      return { text: typeof m.result === "string" ? m.result : "", isError: !!m.is_error };
    }
  }
  return null;
}

/**
 * pass, findings, unclear (answered without a verdict line) or missing (never answered).
 *
 * Only the LAST non-empty line counts, and only if it is exactly the verdict. A report that
 * mentions "VERDICT: PASS" halfway through, or quotes it from code it read, has not passed.
 */
export function verdict(result) {
  if (!result || result.isError || !result.text.trim()) return "missing";
  const lines = result.text.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = (lines[lines.length - 1] || "").replace(/[*_`]/g, "").trim();
  if (last === PASS_LINE) return "pass";
  if (last === FINDINGS_LINE) return "findings";
  return "unclear";
}

const READS = { pass: "No findings", findings: "Flagged something", unclear: "Did not finish", missing: "Did not finish" };
const reads = (v) => READS[v] || READS.missing;

function oneLine(text, max) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

/** The thread message for the person who merges: each reviewer's report. */
export function reportsMessage(reviews = []) {
  return reviews
    .map((r) => {
      const body = r.verdict === "missing" ? "It returned nothing. Read the change yourself." : (r.text || "").trim();
      return `*${r.name}: ${reads(r.verdict)}*\n${body.length > 1800 ? body.slice(0, 1799) + "…" : body}`;
    })
    .join("\n\n");
}

/** The public pull request comment: verdicts only, never report text. */
export function prComment(verdicts = {}) {
  const lines = REVIEWERS.map((r) => `- ${r.name}: ${reads(verdicts[r.key])}`);
  return ["Read-only review before anyone is asked to look:", ...lines, "", "The reports are in the Slack thread under the request."].join("\n");
}

/**
 * The status card once ship is done. Pure, so what the person in Slack reads is tested.
 *
 * `packed` is whether the build handed over a bundle at all; `changed` and `guard` are what
 * ship read from it; `opened` is whether ship pushed the branch and opened the pull request.
 * `reviewed` is whether the review job laid the change out; `money` and `invariant` are
 * verdicts. `says` is the builder's own closing paragraph, which its prompt promises goes
 * back to Slack.
 */
export function cardFor({ built, packed, changed, guard, opened, tier, automerge, reviewed, money, invariant, says }) {
  const said = oneLine(says, 600);
  if (automerge === "merged") {
    return {
      stage: "merged",
      note: "Only wording changed, both reviewers passed it, and it merged itself once the checks passed. It goes out to the store's site in a few minutes."
    };
  }
  if (automerge === "checks_failed") {
    return {
      stage: "checks_failed",
      note: "Only wording changed, but the automatic checks did not pass, so it is waiting for a person."
    };
  }
  if (!built) {
    return { stage: "stopped", note: "I could not finish this one, so nothing has changed. It needs a person to look." };
  }
  if (!packed || changed === "false") {
    // The build finished and committed nothing: the builder stopped on purpose.
    return { stage: "stopped", note: said || "I stopped without changing anything. The reason is in the run log." };
  }
  if (guard === "automation") {
    return {
      stage: "stopped",
      note: "This would change the automation's own files, so I did not open a pull request. A person has to make that change."
    };
  }
  if (!opened || !tier) {
    // Something was built, but ship could not read it, push it or open the pull request.
    // Not the builder's paragraph: that would say the work is done when nobody can see it.
    return {
      stage: "stopped",
      note: "The change was built, but the pull request could not be opened. It needs a person to look."
    };
  }

  const problems = [];
  if (!reviewed) problems.push("the reviewers could not read the change");
  else {
    for (const r of REVIEWERS) {
      const v = r.key === "money" ? money : invariant;
      if (v === "findings") problems.push(`the ${r.name.toLowerCase()} flagged something`);
      else if (v !== "pass") problems.push(`the ${r.name.toLowerCase()} did not finish`);
    }
  }
  const parts = [said || "Finished building."];
  if (problems.length) {
    parts.push(`Before anyone merges it: ${problems.join("; ")}. The reviewers' reports are in this thread.`);
  } else {
    parts.push("Both reviewers found nothing wrong.");
  }
  parts.push(
    tier === "C"
      ? "This touches money, logins, the database or the automation itself, so a person has to look before anything changes."
      : "It is waiting for a person to look and merge."
  );
  return { stage: problems.length ? "checks_failed" : "built", note: parts.join(" ") };
}

function out(key, value) {
  const f = process.env.GITHUB_OUTPUT;
  const text = String(value);
  console.log(`${key}: ${text.includes("\n") ? "(multi-line)" : text}`);
  if (!f) return;
  if (text.includes("\n")) {
    // A random delimiter, so report text that happens to contain it cannot end the value
    // early and write outputs of its own.
    const end = `END_${randomBytes(12).toString("hex")}`;
    appendFileSync(f, `${key}<<${end}\n${text}\n${end}\n`);
  } else {
    appendFileSync(f, `${key}=${text}\n`);
  }
}

function readResult(path) {
  if (!path || !existsSync(path)) return null;
  return finalResult(readFileSync(path, "utf8"));
}

// In the review job: the two execution files in, verdicts and the reports out.
function weigh(env) {
  const reviews = REVIEWERS.map((r) => {
    const result = readResult(env[`${r.key.toUpperCase()}_FILE`]);
    return { ...r, verdict: verdict(result), text: result ? result.text : "" };
  });
  for (const r of reviews) out(r.key, r.verdict);
  out("passed", reviews.every((r) => r.verdict === "pass"));
  out("reports", reportsMessage(reviews));
}

// In the ship job: everything known about the run in, the card and the comment out.
function say(env) {
  const card = cardFor({
    built: env.BUILT === "true",
    packed: env.PACKED === "true",
    changed: env.CHANGED,
    guard: env.GUARD,
    opened: env.OPENED === "true",
    tier: env.TIER,
    automerge: env.AUTOMERGE,
    reviewed: env.REVIEWED === "true",
    money: env.MONEY,
    invariant: env.INVARIANT,
    says: env.SAYS
  });
  out("stage", card.stage);
  out("note", card.note);
  if (env.COMMENT_OUT) writeFileSync(env.COMMENT_OUT, prComment({ money: env.MONEY, invariant: env.INVARIANT }));
  if (env.REPORTS_OUT && env.REPORTS) writeFileSync(env.REPORTS_OUT, env.REPORTS);
}

if (process.argv[1] && process.argv[1].endsWith("autopilot-review.mjs")) {
  const mode = process.argv[2];
  if (mode === "weigh") weigh(process.env);
  else if (mode === "say") say(process.env);
  else {
    console.log("Usage: node autopilot-review.mjs weigh|say");
    process.exit(1);
  }
}
