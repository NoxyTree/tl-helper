import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/gear-viewer.html", import.meta.url), "utf8");

test("set-aware Fit is an explicit build-only option", () => {
  assert.match(html, /id="set-fit-toggle" type="checkbox"/);
  assert.match(html, /Include set effects in Fit/);
  assert.match(html, /includeSetEffects: false/);
  assert.match(html, /includeSetEffects: state\.includeSetEffects/);
  assert.match(html, /\$\("set-fit-toggle"\)\.disabled = state\.mode === "bare"/);
  assert.match(html, /state\.mode = "questlog";\s*\$\("set-fit-toggle"\)\.disabled = false;/);
  assert.match(html, /set effects included/);
});
