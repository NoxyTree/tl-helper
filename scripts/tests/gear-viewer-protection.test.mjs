import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/gear-viewer.html", import.meta.url), "utf8");

test("Gear Viewer separates increase goals from protected-stat constraints", () => {
  assert.match(html, /id="col-mode-increase"/);
  assert.match(html, /id="col-mode-protect"/);
  assert.match(html, /id="protect-tolerance"/);
  assert.match(html, /delta >= -allowedLoss/);
  assert.match(html, /Number\(b\.protectionPass\) - Number\(a\.protectionPass\)/);
});

test("protected stats require a real build baseline and remain visible when blocked", () => {
  assert.match(html, /state\.mode !== "bare" && state\.protected\.length > 0/);
  assert.match(html, /class="\$\{row\.protectionPass \? "" : "protection-blocked"\}"/);
  assert.match(html, /protected stat[\s\S]*waiting for a build/);
});

test("Gear Viewer is public and linked from the primary product pages", async () => {
  assert.doesNotMatch(html, /name="robots" content="noindex"/);
  assert.match(html, /rel="canonical" href="https:\/\/tlhelper\.org\/gear-viewer"/);
  for (const page of ["index.html", "tracker.html", "achievements.html", "combat-lab.html"]) {
    const source = await readFile(new URL(`../../web/${page}`, import.meta.url), "utf8");
    assert.match(source, /href="\.\/gear-viewer\.html"[^>]*>Gear Viewer<\/a>/);
  }
});

test("Combat Calculator explains reviewed ability coverage and attacker build wording", async () => {
  const source = await readFile(new URL("../../web/combat-lab.html", import.meta.url), "utf8");
  assert.match(source, /<label>Calculate using<select id="source-build">/);
  assert.match(source, /Three abilities are available because only reviewed, build-scoped formulas are shown/);
});
