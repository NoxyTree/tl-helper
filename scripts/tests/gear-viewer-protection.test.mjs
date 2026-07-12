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

test("build-aware weapon ranking stays within the equipped weapon families and matching slots", () => {
  assert.match(html, /function equippedWeaponSlots\(build = scoringContext\(\)\.build\)/);
  assert.match(html, /return matching\[0\]\?\.slotId \?\? TYPE_SLOT\[item\.equipmentType\]/);
  assert.match(html, /equippedWeaponTypes\.has\(row\.item\.equipmentType\)/);
});

test("equipped Heroic items are protected from replacement by default", () => {
  assert.match(html, /id="heroic-toggle" type="checkbox" checked/);
  assert.match(html, /keepHeroic: true/);
  assert.match(html, /core\.gradeName\(item\.grade\) === "Heroic"/);
  assert.match(html, /lockedHeroicBySlot\.get\(row\.slotId\) === row\.item\.id/);
  assert.match(html, /equipped Heroic slot/);
});

test("hover cards show inherent stats separately and gear can filter exact item level", async () => {
  const core = await readFile(new URL("../../web/tl-core.js", import.meta.url), "utf8");
  const hoverCard = await readFile(new URL("../../web/ItemHoverCard.dc.html", import.meta.url), "utf8");
  assert.match(core, /stats, hasStats: stats\.length > 0/);
  assert.match(hoverCard, /data\.hasStats/);
  assert.match(html, /id="level-select"/);
  assert.match(html, /String\(row\.level\) === state\.itemLevel/);
  assert.match(html, /if \(model\.hasStats\).*Stats.*statRows\(model\.stats\)/);
  assert.match(core, /name: statName\(statId\), formattedValue: formatStat\(statId, value\)/);
  assert.match(html, /grid-template-columns: 12px minmax\(0, 1fr\) auto/);
});

test("equipped labels do not interrupt item names and attribute effects nest beneath their parent", async () => {
  const core = await readFile(new URL("../../web/tl-core.js", import.meta.url), "utf8");
  assert.match(html, /<span class="name" style="color:\$\{color\}">\$\{row\.item\.name\}<\/span>/);
  assert.match(html, /<span class="sub"><span>\$\{core\.label\(row\.item\.equipmentType\)\}<\/span>/);
  assert.match(core, /\["attribute_bonus", "attribute_bracket"\]/);
  assert.match(core, /options\.preferredStatIds/);
  assert.match(core, /return \{ \.\.\.row, children, hasChildren: children\.length > 0 \}/);
  assert.match(html, /class="hc-derived"/);
});

test("hover cards omit skill-core potentials and present set effects clearly", async () => {
  const core = await readFile(new URL("../../web/tl-core.js", import.meta.url), "utf8");
  const hoverCard = await readFile(new URL("../../web/ItemHoverCard.dc.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /Skill Cores · Potentials|model\.hasCores/);
  assert.doesNotMatch(hoverCard, /Skill Cores · Potentials|data\.hasCores/);
  assert.doesNotMatch(core, /cores, hasCores|coreMoreLabel/);
  assert.match(html, />Set Effects</);
  assert.match(hoverCard, />Set Effects</);
  assert.match(core, /mark: active \? "✓" : "○"/);
});
