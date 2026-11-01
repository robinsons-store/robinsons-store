// The shape of the Slack autopilot workflow, checked without a runner.
//
// The builder has a shell on its own runner, with sudo, so nothing on that runner is trusted
// during or after the build: not the working tree, not the scripts in it, not the runner's
// environment, and not any secret the job was given. The workflow answers that with four
// jobs. find holds the Slack token and runs no model. build holds the Anthropic key and a
// read-only token and nothing else, and hands its commit over as a bundle. review and ship
// start on fresh runners, check out the workflow's own commit, read the bundle as data and
// run only scripts from that checkout; only ship can write, and it pushes only past the
// guard. These checks fail the moment any of that changes.
//
// No YAML library, so this runs with nothing installed. It reads this workflow's own
// layout: jobs at two spaces, job keys at four, steps at six, step keys at eight.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`);
};

const lines = readFileSync(new URL("../workflows/slack-autopilot.yml", import.meta.url), "utf8")
  .split("\n")
  .map((l) => l.replace(/\r$/, ""));

/** A key's value at the given indent, including a folded (`>`) or literal (`|`) block. */
function value(blockLines, key, indent) {
  const pad = " ".repeat(indent);
  const i = blockLines.findIndex((l) => l.startsWith(`${pad}${key}:`) || l.startsWith(`${" ".repeat(indent - 2)}- ${key}:`));
  if (i < 0) return "";
  const first = blockLines[i].slice(blockLines[i].indexOf(`${key}:`) + key.length + 1).trim();
  if (first !== ">" && first !== "|") return first;
  const rest = [];
  for (const l of blockLines.slice(i + 1)) {
    if (l.trim() && l.length - l.trimStart().length <= indent) break;
    rest.push(l.trim());
  }
  return rest.join(" ").trim();
}

/** One job: its header lines and its steps as { name, id, if, text }, comments left out. */
function job(name) {
  const start = lines.indexOf(`  ${name}:`);
  if (start < 0) return { header: [], headerText: "", steps: [], text: "" };
  let end = lines.findIndex((l, i) => i > start && /^ {2}\S/.test(l));
  if (end < 0) end = lines.length;
  const body = lines.slice(start + 1, end).filter((l) => !/^\s*#/.test(l));
  const stepsAt = body.indexOf("    steps:");
  const header = stepsAt < 0 ? body : body.slice(0, stepsAt);
  const blocks = [];
  for (const l of stepsAt < 0 ? [] : body.slice(stepsAt + 1)) {
    if (/^ {6}- /.test(l)) blocks.push([l]);
    else if (blocks.length) blocks[blocks.length - 1].push(l);
  }
  const steps = blocks.map((b) => ({
    name: value(b, "name", 8) || value(b, "uses", 8) || value(b, "run", 8),
    id: value(b, "id", 8),
    if: value(b, "if", 8),
    text: b.join("\n")
  }));
  return { header, headerText: header.join("\n"), steps, text: body.join("\n") };
}

/** What each `node <script>` in a step's shell points at. */
const nodeRuns = (s) => [...s.text.matchAll(/(?:^|[\s;&|(])node\s+(\S+)/gm)].map((m) => m[1]);
const secretsIn = (text) => [...new Set([...text.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]))];
const holdsSlack = (s) => /secrets\.SLACK_BOT_TOKEN/.test(s.text);
const usesModel = (s) => /uses: anthropics\/claude-code-action@/.test(s.text);

const JOBS = ["find", "build", "review", "ship"];
const jobs = Object.fromEntries(JOBS.map((n) => [n, job(n)]));
const jobNames = lines.slice(lines.indexOf("jobs:") + 1).filter((l) => /^ {2}[\w-]+:$/.test(l)).map((l) => l.trim().slice(0, -1));
t("the workflow has exactly the four jobs, in order", jobNames.join(",") === JOBS.join(","), jobNames.join(", "));
const allSteps = JOBS.flatMap((n) => jobs[n].steps.map((s) => ({ job: n, ...s })));

// find: the cheap question. Slack, no model, no install, read-only.
const find = jobs.find;
t("find: the job is found", find.steps.length > 3, `${find.steps.length} steps`);
t("find: runs no model", !find.steps.some(usesModel));
t("find: installs nothing", !/npm ci|setup-node/.test(find.text));
t("find: its token can only read", /^ {6}contents: read$/m.test(find.headerText) && !/: write/.test(find.headerText));
t("find: posts the first card", find.steps.some((s) => holdsSlack(s) && nodeRuns(s).includes(".github/scripts/slack-status.mjs")));

// build: the model, the Anthropic key, a read-only token. Nothing else, before or after.
const build = jobs.build;
t("build: the job is found", build.steps.length > 3, `${build.steps.length} steps`);
t("build: runs after find", /^ {4}needs: find$/m.test(build.headerText), value(build.header, "needs", 4));
t("build: its token can only read", /^ {6}contents: read$/m.test(build.headerText) && !/: write/.test(build.headerText));
const buildSecrets = secretsIn(build.text);
t("build: holds only the Anthropic key and its own token",
  buildSecrets.every((s) => ["ANTHROPIC_API_KEY", "GITHUB_TOKEN"].includes(s)), buildSecrets.join(", "));
t("build: nothing Slack is on this runner at all", !/SLACK/.test(build.text));
t("build: no step pushes or calls GitHub", !build.steps.some((s) => /\bgit push\b|\bgh\s/.test(s.text)));
t("build: starts from the base commit find read",
  /^ {10}ref: \$\{\{ needs\.find\.outputs\.base_sha \}\}$/m.test(build.steps.find((s) => /actions\/checkout@/.test(s.text))?.text || ""));
t("find: reads the base commit before the build", /^ {6}base_sha: \$\{\{ steps\.base\.outputs\.sha \}\}$/m.test(find.headerText));
const at = build.steps.findIndex((s) => s.name === "Build it");
t("build: the build step is found", at >= 0);
t("build: the builder is told not to push", /Do NOT push and do NOT open a pull request/.test(build.steps[at]?.text || ""));
const afterBuild = build.steps.slice(at + 1);
for (const s of afterBuild) {
  t(`build, ${s.name}: runs no node script after the build`, nodeRuns(s).length === 0, nodeRuns(s).join(", "));
  t(`build, ${s.name}: holds no secret after the build`, !/secrets\./.test(s.text));
}
const pack = afterBuild.find((s) => /\bgit bundle create\b/.test(s.text));
t("build: the commit is packed as a bundle after the build", !!pack);
t("build: the bundle is uploaded after it is packed",
  afterBuild.some((s) => /uses: actions\/upload-artifact@/.test(s.text) && afterBuild.indexOf(s) > afterBuild.indexOf(pack)));

// review and ship: fresh runners, the workflow's own commit, the bundle as data.
for (const name of ["review", "ship"]) {
  const j = jobs[name];
  t(`${name}: the job is found`, j.steps.length > 0);
  t(`${name}: runs after the build job`, /^ {4}needs: .*\bbuild\b/m.test(j.headerText), value(j.header, "needs", 4));
  const checkouts = j.steps.filter((s) => /uses: actions\/checkout@/.test(s.text));
  t(`${name}: checks out exactly once`, checkouts.length === 1, `${checkouts.length}`);
  t(`${name}: checks out first`, /uses: actions\/checkout@/.test(j.steps[0]?.text || ""));
  t(`${name}: checks out the workflow's own commit`, /^ {10}ref: \$\{\{ github\.sha \}\}$/m.test(checkouts[0]?.text || ""));
  for (const s of j.steps) {
    for (const target of nodeRuns(s)) {
      t(`${name}, ${s.name}: runs a script from its own checkout`, /^\.github\/scripts\/[\w.-]+\.mjs$/.test(target), target);
    }
  }
  t(`${name}: never moves its checkout to the change`, !/\bgit\s+(checkout|switch|reset|restore|worktree|merge|rebase|pull|am|apply)\b/.test(j.text));
  const download = j.steps.findIndex((s) => /uses: actions\/download-artifact@/.test(s.text));
  const change = j.steps.findIndex((s) => s.id === "change");
  t(`${name}: downloads the bundle`, download > 0);
  t(`${name}: reads it with autopilot-change.mjs, after the download`,
    change > download && nodeRuns(j.steps[change] || { text: "" }).includes(".github/scripts/autopilot-change.mjs"));
  t(`${name}: requires the change to sit on the base commit find read`,
    /autopilot-change\.mjs "[^"]+" "\$BASE" "\$BASE_SHA"/.test(j.steps[change]?.text || "") &&
    /^ {6}BASE_SHA: \$\{\{ needs\.find\.outputs\.base_sha \}\}$/m.test(j.headerText));
}

// review: reads only, reads the bundle (not a pull request), and strips the change's agent files.
const review = jobs.review;
t("review: its token can only read the repository", /^ {6}contents: read$/m.test(review.headerText) && !/: write/.test(review.headerText));
t("review: does not look for a pull request", !/\bgh\s/.test(review.text));
t("review: holds no Slack token", !/SLACK/.test(review.text));
const layout = review.steps.find((s) => /\.autopilot-review\/head/.test(s.text));
t("review: lays out only a change the guard cleared", (layout?.if || "").includes("steps.change.outputs.guard == 'ok'"), layout?.if);
t("review: lays out the commit the bundle carried", /SHA: \$\{\{ steps\.change\.outputs\.sha \}\}/.test(layout?.text || ""));
t("review: the file list and the diff name both sides of a move",
  /git -c core\.quotePath=false diff --no-renames --name-only/.test(layout?.text || "") && /git diff --no-renames "origin\/\$BASE\.\.\.\$SHA" >/.test(layout?.text || ""));
t("review: reports the sha it laid out", /^ {6}sha: \$\{\{ steps\.layout\.outputs\.sha \}\}$/m.test(review.headerText) && layout?.id === "layout");
for (const f of ["CLAUDE.md", "AGENTS.md", ".mcp.json"]) {
  t(`review: ${f} is removed from the change before the reviewers read it`, (layout?.text || "").includes(`-name ${f}`));
}
for (const d of [".claude", ".agents"]) {
  t(`review: ${d}/ is removed from the change before the reviewers read it`, (layout?.text || "").includes(`-name ${d}`));
}
const reviewers = review.steps.filter(usesModel);
t("review: two reviewers", reviewers.length === 2, `${reviewers.length}`);
for (const s of reviewers) {
  t(`review, ${s.name}: reads only`, /--allowedTools "Read,Grep,Glob"/.test(s.text));
}

// Who holds which secret, across the whole workflow.
for (const s of allSteps.filter(holdsSlack)) {
  t(`${s.job}, ${s.name}: the Slack token is only in find and ship`, s.job === "find" || s.job === "ship");
  if (s.job === "ship") t(`ship, ${s.name}: holds the Slack token and runs no git`, !/(?:^|\s)git\s/m.test(s.text));
}
t("ship: holds no Anthropic key", !/ANTHROPIC/.test(jobs.ship.text));
t("the card is updated after the build, from ship", jobs.ship.steps.some((s) => holdsSlack(s) && nodeRuns(s).includes(".github/scripts/slack-status.mjs")));
const models = allSteps.filter(usesModel);
t("a model runs only in build and review", models.every((s) => s.job === "build" || s.job === "review"), models.map((s) => s.job).join(", "));

// The push and the pull request: ship only, past the guard, the commit that was read.
const pushes = allSteps.filter((s) => /\bgit push\b/.test(s.text));
t("exactly one step pushes, in ship", pushes.length === 1 && pushes[0].job === "ship", pushes.map((p) => p.job).join(", "));
const pushIf = pushes[0]?.if || "";
t("the push checks the guard itself", pushIf.includes("steps.change.outputs.guard == 'ok'"), pushIf);
t("the push needs a tier", pushIf.includes("steps.tier.outputs.tier != ''"), pushIf);
t("the push does not run regardless of failures", !/always\(\)/.test(pushIf));
t("the push sends the commit ship read, to the run's own branch",
  /git push origin "\$SHA:refs\/heads\/\$BRANCH"/.test(pushes[0]?.text || "") &&
  /SHA: \$\{\{ steps\.change\.outputs\.sha \}\}/.test(pushes[0]?.text || ""));
const opens = allSteps.filter((s) => /\bgh pr create\b/.test(s.text));
t("exactly one step opens the pull request, the one that pushes", opens.length === 1 && opens[0] === pushes[0]);
const tier = jobs.ship.steps.find((s) => s.id === "tier");
t("ship: classifies the commit it read", /SHA: \$\{\{ steps\.change\.outputs\.sha \}\}/.test(tier?.text || "") &&
  nodeRuns(tier || { text: "" }).includes(".github/scripts/classify-change.mjs"));

// The merge checks the tier and both verdicts itself, on the commit that was reviewed.
const merges = allSteps.filter((s) => /\bgh pr merge\b/.test(s.text));
t("exactly one step merges, in ship", merges.length === 1 && merges[0].job === "ship", merges.map((m) => m.job).join(", "));
const mergeIf = merges[0]?.if || "";
t("the merge needs tier A", mergeIf.includes("steps.tier.outputs.tier == 'A'"), mergeIf);
t("the merge needs both reviewers to pass", mergeIf.includes("needs.review.outputs.passed == 'true'"));
t("the merge needs the reviewed commit to be the one ship pushed", mergeIf.includes("needs.review.outputs.sha == steps.change.outputs.sha"));
t("the merge needs the switch on", mergeIf.includes("vars.AUTOMERGE_TIER_A == 'true'"));
t("the merge needs the pull request ship opened", mergeIf.includes("steps.pr.outputs.number != ''"));
t("the merge does not run regardless of failures", !/always\(\)/.test(mergeIf));

// No expression is pasted into a shell. Values reach scripts through env, where the shell
// cannot read them as commands.
const runBlocks = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(\s*)(?:- )?run: ?(.*)$/);
  if (!m) continue;
  const indent = m[1].length;
  const block = [m[2]];
  if (/^[|>]$/.test(m[2].trim())) {
    while (i + 1 < lines.length && (!lines[i + 1].trim() || lines[i + 1].length - lines[i + 1].trimStart().length > indent)) {
      block.push(lines[++i]);
    }
  }
  runBlocks.push(block.join("\n"));
}
const pasted = runBlocks.filter((r) => r.includes("${{"));
t("no ${{ }} inside any run block", runBlocks.length > 10 && pasted.length === 0, `${runBlocks.length} blocks, ${pasted.length} with an expression`);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
