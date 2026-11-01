// The tier rules, checked without a git repository.
//
// These decide which changes merge with nobody looking, so every path that matters is pinned
// here: a rule that silently widens tier A is invisible in review and only shows up as a
// change that merged itself.

import { readFileSync } from "node:fs";
import { classify, parseDiff, outputLine, MAX_AUTO_LINES } from "./classify-change.mjs";

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`);
};
const tier = (files, lines = 10, notPlainText = []) => classify(files, lines, notPlainText).tier;

// Words only, small: the one case that may merge itself.
t("a doc is A", tier(["docs/STATUS.md"]) === "A");
t("a root readme is A", tier(["README.md"]) === "A");
t("several docs together are A", tier(["docs/STATUS.md", "docs/VERIFICATION.md", "RUNBOOK.md"]) === "A");
t("a doc at the line limit is A", tier(["docs/STATUS.md"], MAX_AUTO_LINES) === "A");
t("a plain text note under docs is A", tier(["docs/notes/opening-hours.txt"]) === "A");

// Words, but too many of them.
t("a doc over the line limit is B", tier(["docs/STATUS.md"], MAX_AUTO_LINES + 1) === "B");

// The app.
t("a screen is B", tier(["src/app/capture/page.tsx"]) === "B");
t("a doc plus a screen is B", tier(["docs/STATUS.md", "src/app/capture/page.tsx"]) === "B");
t("the in-app guide is B, because it is TypeScript", tier(["src/lib/appGuide.ts"]) === "B");
t("markdown below the root, outside docs, is B", tier(["src/notes.md"]) === "B");

// Under docs/ but not prose. Only .md and .txt are words there; code and pages are B.
for (const f of [
  "docs/owner-notes/render.mjs",
  "docs/owner-notes/store-app-infrastructure.html",
  "docs/tools/fix.sh",
  "docs/diagram.png",
  "docs/diagram.svg",
  "docs/owner-notes/.gitignore"
]) {
  t(`${f} is B`, tier([f]) === "B");
}
t("a text file at the root is B; only .md is words there", tier(["notes.txt"]) === "B");
t("a doc plus a script under docs is B", tier(["docs/STATUS.md", "docs/owner-notes/render.mjs"]) === "B");

// Binary, linked or executable files are not words, whatever they are called. Git counts a
// binary file as zero lines, so without this the line limit could not see its size.
t("a binary file named .md is B", tier(["docs/STATUS.md"], 0, ["docs/STATUS.md"]) === "B");
t("one binary doc among docs makes the whole change B",
  tier(["docs/STATUS.md", "docs/VERIFICATION.md"], 4, ["docs/VERIFICATION.md"]) === "B");

// Money, access, the database, and the automation. Never merges.
for (const f of [
  "supabase/payments_v2.sql",
  "src/lib/payments.ts",
  "src/lib/auth.ts",
  "src/app/api/ask/route.ts",
  "package.json",
  "vercel.json",
  ".github/workflows/slack-autopilot.yml",
  ".github/scripts/classify-change.mjs",
  ".claude/skills/robinsons-store/SKILL.md",
  ".agents/skills/supabase/SKILL.md",
  // Instructions the autopilot reads on every run. These are the ones a words-only rule
  // would otherwise let through, which is exactly why they are pinned.
  "CLAUDE.md",
  "docs/LOOP_ENGINEERING.md",
  "docs/adr/ADR-002-words-only-changes-merge-themselves.md"
]) {
  t(`${f} is C`, tier([f]) === "C");
}

// Agent instructions by name, at any depth and in any case. The first three are .md files
// under docs/ or at the root, which the words-only rule would otherwise pass.
for (const f of [
  "AGENTS.md",
  "docs/AGENTS.md",
  "docs/CLAUDE.md",
  "AGENT.md",
  "GEMINI.md",
  "docs/GEMINI.md",
  "CLAUDE.local.md",
  "claude.md",
  "docs/guides/Claude.MD",
  "docs/skills/ordering/SKILL.md",
  "src/app/CLAUDE.md",
  ".github/copilot-instructions.md",
  "docs/copilot-instructions.md",
  ".cursorrules",
  "docs/.windsurfrules",
  ".clinerules",
  ".mcp.json",
  "docs/.claude/settings.md",
  "src/app/.cursor/rules/style.mdc",
  "docs/.kiro/steering/notes.md"
]) {
  t(`${f} is C`, tier([f]) === "C");
}

// The database and configuration, wherever they sit.
for (const f of [
  "docs/fix.sql",
  "scripts/cleanup.SQL",
  "docs/slack-app-manifest.yml",
  "docs/settings.yaml",
  "docs/config.json",
  "docs/config.toml",
  "tsconfig.json",
  ".eslintrc.json",
  ".env.example",
  "docs/.env",
  ".npmrc"
]) {
  t(`${f} is C`, tier([f]) === "C");
}
// Every doc CLAUDE.md tells an agent to read is C, except the two every pull request updates.
// Read from CLAUDE.md itself, so a doc added to that list later is checked too.
{
  const claude = readFileSync(new URL("../../CLAUDE.md", import.meta.url), "utf8");
  const named = [...new Set(claude.match(/[\w./-]+\.md|docs\/adr\//g))]
    .map((p) => (p.endsWith("/") ? `${p}ADR-009-example.md` : p));
  const wordsAllowed = new Set(["docs/STATUS.md", "docs/VERIFICATION.md"]);
  t("CLAUDE.md names docs to read", named.length >= 10, `named=${named.length}`);
  for (const p of named) {
    const want = wordsAllowed.has(p) ? "A" : "C";
    t(`${p}, named in CLAUDE.md, is ${want}`, tier([p]) === want);
  }
}

t("one blocked file among docs makes the whole change C",
  tier(["docs/STATUS.md", "CLAUDE.md"]) === "C");
t("an instruction file among docs makes the whole change C",
  tier(["docs/STATUS.md", "docs/AGENTS.md"]) === "C");
t("C wins over the line limit", tier(["CLAUDE.md"], 1) === "C");

// Case does not move a file out of tier C: on a laptop that ignores case it is the same file.
for (const f of [
  "docs/ADR/ADR-002-words-only-changes-merge-themselves.md",
  "docs/loop_engineering.md",
  "Supabase/fix.sql",
  "SRC/lib/Payments.ts",
  ".GitHub/workflows/ci.yml"
]) {
  t(`${f} is C`, tier([f]) === "C");
}

// A file name with a control character is C, and the name is kept out of the reason, which
// is written to GITHUB_OUTPUT one value per line.
const ch = (n) => String.fromCharCode(n);
for (const [label, f] of [
  ["a carriage return", `docs/notes${ch(13)}tier=A`],
  ["a line feed", `docs/notes${ch(10)}tier=A.md`],
  ["a tab", `docs/notes${ch(9)}.md`],
  ["a line separator", `docs/notes${ch(0x2028)}.md`],
  ["a next-line character", `docs/notes${ch(0x85)}.md`]
]) {
  const r = classify(["docs/STATUS.md", f], 1);
  t(`a file name with ${label} is C`, r.tier === "C");
  t(`a file name with ${label} stays out of the reason`, !r.reason.includes("notes"));
}
t("an ordinary name with spaces is still A", tier(["docs/Opening Hours.md"]) === "A");

// One output line, whatever the value holds.
{
  const line = outputLine("reason", `a${ch(13)}tier=A${ch(10)}b${ch(0x2028)}c`);
  t("an output line has exactly one line break, at its end",
    line.endsWith("\n") && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(line.slice(0, -1)), JSON.stringify(line));
}
t("C wins over a binary file", tier(["docs/fix.sql"], 0, ["docs/fix.sql"]) === "C");

// Nothing changed.
t("an empty diff is none", tier([]) === "none");

// The reason is what a person reads on the pull request; it must name the file.
t("a C reason names the file", classify(["CLAUDE.md"], 1).reason.includes("CLAUDE.md"));
t("a B reason names the file", classify(["docs/owner-notes/render.mjs"], 1).reason.includes("render.mjs"));

// Reading git's output. Fixtures are what `git diff -z --numstat` and `--raw` print.
{
  const numstat = "3\t1\tdocs/STATUS.md\0-\t-\tdocs/STATUS-copy.md\0" + "2\t0\tdocs/odd\tname.md\0";
  const raw = ":100644 100644 aaa bbb M\0docs/STATUS.md\0" +
    ":000000 100644 000 ccc A\0docs/STATUS-copy.md\0" +
    ":000000 100644 000 ddd A\0docs/odd\tname.md\0";
  const d = parseDiff(numstat, raw);
  t("parseDiff lists every file", d.files.length === 3 && d.files.includes("docs/odd\tname.md"));
  t("parseDiff counts only text lines", d.lines === 6, `lines=${d.lines}`);
  t("parseDiff marks a binary file", d.notPlainText.length === 1 && d.notPlainText[0] === "docs/STATUS-copy.md");
}
{
  const numstat = "1\t0\tdocs/link.md\0" + "1\t0\tdocs/run.md\0" + "0\t4\tdocs/old.md\0";
  const raw = ":000000 120000 000 aaa A\0docs/link.md\0" +
    ":100644 100755 bbb bbb M\0docs/run.md\0" +
    ":100644 000000 ccc 000 D\0docs/old.md\0";
  const d = parseDiff(numstat, raw);
  t("parseDiff marks a link and an executable, not a deletion",
    d.notPlainText.length === 2 && d.notPlainText.includes("docs/link.md") && d.notPlainText.includes("docs/run.md"));
  t("a link named .md is B", tier(d.files, d.lines, d.notPlainText) === "B");
}
t("parseDiff of an empty diff is empty", parseDiff("", "").files.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
