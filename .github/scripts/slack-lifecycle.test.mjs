// Where the Slack lifecycle workflow takes its scripts from, checked without a runner.
//
// Both of its steps run a script with the Slack token, and the checkout decides whose copy
// that is. It is pinned to the base branch: the commit a pull request targets, or the
// default branch for a CI result or a run by hand. These checks fail the moment the
// checkout loses its ref, the ref resolves to the head for any trigger, a trigger is added
// that this file has no event for, or a script runs before the checkout.
//
// No YAML library, so this runs with nothing installed. It reads this workflow's own
// layout: triggers and jobs at two spaces, steps at six, step keys at eight, `with:` at ten.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`);
};

const lines = readFileSync(new URL("../workflows/slack-lifecycle.yml", import.meta.url), "utf8")
  .split("\n").map((l) => l.replace(/\r$/, ""));
const indent = (l) => l.match(/^ */)[0].length;

/** The lines nested under the first line equal to `header` at or after `from`, comments left out. */
function under(header, from = 0) {
  const start = lines.indexOf(header, from);
  if (start < 0) return [];
  const out = [];
  for (const l of lines.slice(start + 1)) {
    if (/^\s*(#|$)/.test(l)) continue;
    if (indent(l) <= indent(header)) break;
    out.push(l);
  }
  return out;
}

/** One job's steps as { name, uses, ref, text }. */
function steps(job) {
  const blocks = [];
  for (const l of under("    steps:", lines.indexOf(`  ${job}:`))) {
    if (/^ {6}- /.test(l)) blocks.push([l]);
    else if (blocks.length) blocks[blocks.length - 1].push(l);
  }
  return blocks.map((b) => {
    const text = b.join("\n");
    const key = (k) => (text.match(new RegExp(`^(?: {6}- | {8})${k}: (.*)$`, "m")) || [])[1]?.trim() ?? "";
    const ref = (text.match(/^ {8}with:\n(?: {10}.*\n)*? {10}ref: (.*)$/m) || [])[1]?.trim() ?? "";
    return { name: key("name") || key("uses") || key("run"), uses: key("uses"), ref, text };
  });
}

/** What a `${{ a || b }}` of github.* paths and quoted strings gives, or undefined for anything else. */
function resolve(expr, github) {
  const m = expr.match(/^\$\{\{\s*(.+?)\s*\}\}$/);
  if (!m) return undefined;
  for (const term of m[1].split("||").map((s) => s.trim())) {
    let v;
    if (/^'[^']*'$/.test(term)) v = term.slice(1, -1);
    else if (/^github(\.\w+)+$/.test(term)) v = term.split(".").slice(1).reduce((o, k) => o?.[k], github);
    else return undefined;
    if (v) return v;
  }
  return "";
}

const all = steps("report");
t("the report job is found", all.length >= 3, `${all.length} steps`);

const checkouts = all.filter((s) => s.uses.startsWith("actions/checkout@"));
t("exactly one checkout", checkouts.length === 1, `${checkouts.length}`);
const checkout = checkouts[0] || { ref: "", text: "" };
const at = all.indexOf(checkout);
t("the checkout pins a ref", checkout.ref !== "");
t("the ref names nothing from the head",
  !/head|github\.(sha|ref\w*)\b|inputs\.|workflow_run\./.test(checkout.ref), checkout.ref);

// Every trigger the workflow listens to, as GitHub fills the context for it. HEAD is the
// Slack request's branch; the right answer is never any part of it.
const HEAD = { sha: "4ead5a1", ref: "claude/slack-1786568400.750549" };
const repository = { default_branch: "main" };
const events = {
  pull_request: {
    want: "ba5e5a1",
    github: {
      event_name: "pull_request", sha: "3e49e5a", ref: "refs/pull/90/merge", head_ref: HEAD.ref, base_ref: "develop",
      event: { action: "opened", pull_request: { head: HEAD, base: { sha: "ba5e5a1", ref: "develop" } }, repository }
    }
  },
  workflow_run: {
    want: "main",
    github: {
      event_name: "workflow_run", sha: "d3fa017", ref: "refs/heads/main",
      event: { workflow_run: { conclusion: "success", head_branch: HEAD.ref, head_sha: HEAD.sha }, repository }
    }
  },
  workflow_dispatch: {
    want: "main",
    github: {
      event_name: "workflow_dispatch", sha: HEAD.sha, ref: `refs/heads/${HEAD.ref}`,
      event: { inputs: { thread_ts: "1786568400.750549", stage: "live" }, ref: `refs/heads/${HEAD.ref}`, repository }
    }
  }
};

const triggers = under("on:").filter((l) => /^ {2}\w+:/.test(l)).map((l) => l.trim().slice(0, -1));
t("the triggers are found", triggers.length > 0, triggers.join(", "));
for (const name of triggers) {
  const e = events[name];
  t(`${name}: has an event in this file`, !!e);
  if (!e) continue;
  const got = resolve(checkout.ref, e.github);
  t(`${name}: checks out ${e.want}`, got === e.want, String(got));
  t(`${name}: never the head`, ![HEAD.sha, HEAD.ref, `refs/heads/${HEAD.ref}`, e.github.sha].includes(got), String(got));
}

// Nothing runs before the checkout, and nothing moves the tree after it.
const nodeRuns = (s) => [...s.text.matchAll(/(?:^\s*|run:\s*)node\s+(\S+)/gm)].map((m) => m[1]);
for (const s of all.filter((s) => nodeRuns(s).length)) {
  t(`${s.name}: runs after the checkout`, all.indexOf(s) > at);
  t(`${s.name}: runs a script from the checkout`, nodeRuns(s).every((r) => /^\.github\/scripts\/[\w.-]+\.mjs$/.test(r)), nodeRuns(s).join(", "));
}
t("no step moves the tree", !all.some((s) => /\bgit\s+(checkout|switch|fetch|pull|reset|restore)\b/.test(s.text)));
for (const f of ["slack-lifecycle-stage.mjs", "slack-status.mjs"]) {
  t(`${f} runs from the checkout`, all.some((s) => nodeRuns(s).includes(`.github/scripts/${f}`)));
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
