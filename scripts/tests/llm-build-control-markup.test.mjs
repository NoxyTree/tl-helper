import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../web/llm-build-control.html", import.meta.url), "utf8");

test("LLM build control exposes a small stable automation surface", () => {
  assert.match(html, /aria-label="LLM build request JSON"/);
  assert.match(html, />Run optimizer</);
  assert.match(html, /aria-label="Structured result JSON"/);
  assert.match(html, /executeLlmBuildControl/);
  assert.match(html, /src="\.\/tl-account-menu\.js"/);
  assert.match(html, /Schema v1/);
});
