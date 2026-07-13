import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const armoryPath = new URL("../../web/index.html", import.meta.url);
const markup = await readFile(armoryPath, "utf8");

function sectionBetween(start, end) {
  const startAt = markup.indexOf(start);
  const endAt = markup.indexOf(end, startAt + start.length);
  assert.notEqual(startAt, -1, `missing section marker: ${start}`);
  assert.notEqual(endAt, -1, `missing section marker: ${end}`);
  return markup.slice(startAt, endAt);
}

test("mastery nodes bind a context-menu action", () => {
  const wheel = sectionBetween('list="{{ wheelNodes }}"', 'list="{{ laneLegend }}"');
  assert.match(wheel, /onContextMenu="{{ node\.onContextMenu }}"/);
});

test("skill budget summary declares columns for all four values", () => {
  const budget = sectionBetween("<!-- budget strip -->", "<!-- active loadout -->");
  assert.match(budget, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto\s+auto/);
});

test("hero stats do not hardcode Melee Hit", () => {
  const heroStats = sectionBetween("// hero chips", "const leftIds");
  assert.doesNotMatch(heroStats, /label:\s*["']Melee Hit["']/);
  assert.doesNotMatch(heroStats, /fmt\(["']melee_accuracy["']\)/);
});

test("rune panel provides explicit item, effect, and selector empty states", () => {
  const runes = sectionBetween('value="{{ tabRunes }}"', 'value="{{ tabArtifacts }}"');
  assert.match(runes, /value="{{ noRuneItem }}"/);
  assert.match(runes, /Equip an item first/);
  assert.match(runes, /value="{{ noRuneEffects }}"/);
  assert.match(runes, /No rune effects yet\./);
  assert.match(runes, /<option value="">Empty<\/option>/);
  assert.match(runes, /<option value="">Choose stat<\/option>/);
});

test("TL Helper creation and saving are primary while Questlog remains optional", () => {
  const header = sectionBetween("<!-- ======================= TOP BAR", "<!-- ======================= HERO STAT STRIP");
  assert.match(header, />My builds \(\{\{ presetCount \}\}\)<\/button>/);
  assert.match(header, />New build<\/button>/);
  assert.match(header, />Import Questlog<\/button>/);
  assert.match(header, /aria-label="Character name"/);
  assert.match(header, /aria-label="Build role"/);
  assert.match(header, /aria-label="Server"/);

  const builds = sectionBetween('value="{{ presetsOpen }}"', 'value="{{ importOpen }}"');
  assert.match(builds, /Create and edit builds directly in TL Helper/);
  assert.match(builds, /do not require a Questlog import/);
  assert.match(builds, />Save current build<\/button>/);
});

test("Questlog import accepts a character-builder link instead of raw JSON", () => {
  const importer = sectionBetween('value="{{ importOpen }}"', 'value="{{ pickerOpen }}"');
  assert.match(importer, /type="url"/);
  assert.match(importer, /aria-label="Questlog character-builder link"/);
  assert.match(importer, /questlog\.gg\/throne-and-liberty\/en\/character-builder/);
  assert.doesNotMatch(importer, /Questlog build JSON|Paste a JSON object|<textarea/);
  assert.match(markup, /fetch\(`\/api\/questlog\/character\?url=\$\{encodeURIComponent\(url\)\}`/);
});

test("a first visit starts with an editable empty TL Helper build", () => {
  assert.match(markup, /const build = saved\?\.build \?\? core\.createInitialBuild\(\)/);
  assert.doesNotMatch(markup, /const build = saved\?\.build \?\? core\.seedShowcaseBuild/);
});
