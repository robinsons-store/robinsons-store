// Run: node .github/scripts/promote.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../workflows/promote.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const step = workflow.split("- name: Merge it once CI passes on its exact commit")[1];
assert.ok(step, "the promotion merge step exists");
const script = step.split("run: |\n")[1];
const snapshot = 'before=$(git rev-parse origin/main)';
const compare = '[ "$(git rev-parse origin/main)" = "$before" ]';
const dispatch = script.indexOf("gh workflow run ci.yml");
const wait = script.indexOf('gh run watch "$run"');
const merge = script.indexOf('gh pr merge "$PR"');
const fetch = script.lastIndexOf("git fetch --no-tags --quiet origin");
const guard = script.indexOf(compare);

test("main is recorded once before starting CI", () => {
  assert.equal(script.split(snapshot).length - 1, 1);
  assert.ok(script.indexOf(snapshot) > script.indexOf("git merge-base --is-ancestor"));
  assert.ok(script.indexOf(snapshot) < dispatch);
  assert.match(script, /before=\$\(git rev-parse origin\/main\) \|\| hold "Could not read main\."/);
});

test("main is fetched again after CI succeeds and before comparison", () => {
  assert.ok(dispatch >= 0 && dispatch < wait);
  assert.ok(wait < fetch && fetch < guard && guard < merge);
  assert.match(script.slice(fetch, guard), /\|\| hold "Could not fetch main again\."/);
});

test("a changed main stops promotion with a clear message", () => {
  assert.ok(guard >= 0);
  assert.match(script.slice(guard).split("\n")[0], /\|\| hold "main moved while CI ran\./);
  assert.match(script, /hold\(\) \{[\s\S]*?echo "::error::[\s\S]*?exit 1/);
});

test("the base comparison immediately precedes the pinned merge", () => {
  const between = script.slice(guard, merge).split("\n").slice(1);
  assert.ok(between.every((line) => !line.trim() || line.trim().startsWith("#")));
  assert.match(script.slice(merge).split("\n")[0], /--merge --match-head-commit "\$SHA"/);
});

test("the pull request is read again after CI and before the final fetch", () => {
  const reread = script.indexOf("again=$(read_pr)");
  assert.ok(wait < reread && reread < fetch);
  assert.match(script.slice(reread, fetch), /\[ "\$again" = "OPEN main develop false \$SHA" \] \|\| hold/);
});

test("promotion uses an immediate merge with no bypass flags", () => {
  const command = script.slice(merge).split("\n")[0];
  assert.doesNotMatch(command, /--(?:auto|admin|delete-branch)\b/);
});
