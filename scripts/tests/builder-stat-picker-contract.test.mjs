import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/build-from-scratch.html", import.meta.url), "utf8");

test("stat picker exposes a complete ARIA combobox contract", () => {
  assert.match(html, /id="goal-input"[^>]+role="combobox"[^>]+aria-expanded="false"[^>]+aria-controls="stat-options"/);
  assert.match(html, /id="stat-options"[^>]+role="listbox"/);
  assert.match(html, /id="stat-option-\$\{index\}"[^>]+role="option"[^>]+aria-selected=/);
  assert.match(html, /aria-activedescendant/);
  assert.match(html, /setAttribute\("aria-expanded","true"\)/);
  assert.match(html, /setAttribute\("aria-expanded","false"\)/);
});

test("stat picker shows every category match and supports keyboard and pointer selection", () => {
  assert.doesNotMatch(html, /\.slice\(0,10\)/);
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) assert.ok(html.includes(`event.key===\"${key}\"`));
  assert.match(html, /node\.onclick=\(\)=>selectStatResult/);
  assert.match(html, /document\.addEventListener\("pointerdown"/);
  assert.doesNotMatch(html, /datalist/i);
});
