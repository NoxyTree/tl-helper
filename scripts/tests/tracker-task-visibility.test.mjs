import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/tracker.html", import.meta.url), "utf8");

// The built-in DAILY/WEEKLY lists are one opinion about how to play. A player
// who never runs Dimensional Trials was previously stuck with a loop that could
// never read 100%, because only custom tasks could be removed.
test("built-in tasks can be hidden, not just custom ones", () => {
  assert.match(html, /hiddenTasks:\s*\[\]/, "state carries the hidden id list");
  assert.match(html, /dismissTask\(scope,\s*id\)/, "a single dismiss entry point exists");
  assert.match(html, /onRemove:\s*\(\)\s*=>\s*this\.dismissTask\(scope,\s*task\.id\)/, "every row dismisses through it");
  // Custom tasks are deleted outright; built-ins are only hidden, so the
  // distinction has to survive inside dismissTask.
  assert.match(html, /if\s*\(isCustom\)\s*return this\.removeCustom\(scope,\s*id\)/);
  assert.match(html, /hiddenTasks\s*=\s*\[\.\.\.new Set\(\[\.\.\.\(this\.state\.hiddenTasks \?\? \[\]\),\s*id\]\)\]/);
});

test("hidden tasks leave the denominator instead of sitting permanently incomplete", () => {
  assert.match(html, /visibleTasks\(tasks\)/);
  assert.match(html, /allDaily\(\)\s*\{\s*return this\.visibleTasks\(\[\.\.\.this\.DAILY/);
  assert.match(html, /allWeekly\(\)\s*\{\s*return this\.visibleTasks\(\[\.\.\.this\.WEEKLY/);
  // dailyTotal/weeklyTotal and resetScope all read from allDaily()/allWeekly(),
  // so filtering there is what keeps the progress bar honest.
  assert.match(html, /dailyTotal:\s*dailyRows\.length/);
  assert.match(html, /const dailyRows = this\.allDaily\(\)/);
  assert.match(html, /const weeklyRows = this\.allWeekly\(\)/);
});

test("hiding is reversible and scoped to one loop", () => {
  assert.match(html, /restoreHidden\(scope\)/);
  assert.match(html, /const scoped = new Set\(\(scope === "daily" \? this\.DAILY : this\.WEEKLY\)\.map/);
  assert.match(html, /hiddenTasks:\s*\(this\.state\.hiddenTasks \?\? \[\]\)\.filter\(\(id\) => !scoped\.has\(id\)\)/);
  for (const scope of ["daily", "weekly"]) {
    const capitalised = scope[0].toUpperCase() + scope.slice(1);
    assert.match(html, new RegExp(`${scope}HasHidden`), `${scope} exposes a hidden-count flag`);
    assert.match(html, new RegExp(`${scope}HiddenLabel`), `${scope} labels how many are hidden`);
    assert.match(html, new RegExp(`onRestore${capitalised}: \\(\\) => this\\.restoreHidden\\("${scope}"\\)`));
  }
});

test("the dismiss control renders for every row and names what it will do", () => {
  assert.doesNotMatch(
    html,
    /<sc-if value="\{\{ row\.custom \}\}"[\s\S]{0,400}?row\.onRemove/,
    "the dismiss button must not be gated behind row.custom any more",
  );
  assert.equal(html.match(/aria-label="\{\{ row\.dismissTitle \}\}"/g)?.length, 2, "daily and weekly rows both expose it");
  assert.match(html, /dismissTitle: task\.custom \? "Remove this custom task" : "Hide this task"/);
});

test("hidden ids round-trip through local storage", () => {
  assert.match(html, /hiddenTasks: Array\.isArray\(raw\.hiddenTasks\)/, "load rehydrates the list");
  assert.match(html, /raw\.hiddenTasks\.filter\(\(id\) => typeof id === "string"\)/, "load rejects corrupt entries");
  assert.match(html, /hiddenTasks: this\.state\.hiddenTasks,/, "save persists the list");
});
