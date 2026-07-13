import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/gear-viewer.html", import.meta.url), "utf8");

test("set-aware Fit is the default build calculation mode", () => {
  assert.match(html, /id="set-fit-toggle" type="checkbox" checked/);
  assert.match(html, /Include set effects in Fit/);
  assert.match(html, /includeSetEffects: true/);
  assert.match(html, /includeSetEffects: state\.includeSetEffects/);
  assert.match(html, /\$\("set-fit-toggle"\)\.disabled = state\.mode === "bare"/);
  assert.match(html, /state\.mode = "questlog";\s*\$\("set-fit-toggle"\)\.disabled = false;/);
  assert.match(html, /set effects included/);
  assert.match(html, /if \(!state\.includeSetEffects\) params\.set\("sets", "0"\)/);
  assert.match(html, /const PREFS_KEY = "tlhelper-gear-viewer-prefs-v2"/);
  assert.doesNotMatch(html, /tlhelper-gear-viewer-prefs-v1/);
});
