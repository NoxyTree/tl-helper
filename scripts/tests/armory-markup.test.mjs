import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const armoryPath = new URL("../../web/index.html", import.meta.url);
const markup = await readFile(armoryPath, "utf8");
const shellCss = await readFile(new URL("../../web/tl-shell.css", import.meta.url), "utf8");

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

test("Overall Mastery unlock level is an explicit editable build input", () => {
  assert.match(markup, /aria-label="Overall Mastery Level"/);
  assert.match(markup, /overallMasteryLevelValue: build\.overallMasteryLevel \?\? ""/);
  assert.match(markup, /next\.overallMasteryLevel = value === "" \? null : Number\(value\)/);
  assert.match(markup, /Potential affects persistent static totals/);
  assert.match(markup, /Shielded by Unity/);
  assert.doesNotMatch(markup, /Only Potential affects totals/);
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
  assert.match(runes, /data-rune-synergy-guide/);
  assert.match(runes, /Synergy Guide/);
  assert.match(runes, /Sockets 1 → 2 → 3/);
  assert.match(runes, /synergyGuideRows/);
  assert.match(markup, /actual === expected \|\| actual === "chaos"/);
});

test("TL Helper creation and saving are primary while Questlog remains optional", () => {
  const header = sectionBetween("<!-- ======================= TOP BAR", "<!-- ======================= HERO STAT STRIP");
  assert.match(header, /class="tl-armory-workspace"/);
  assert.match(header, /role="group" aria-label="Current build details"/);
  assert.match(header, /<span>My builds<\/span><span class="tl-armory-action-count">\{\{ presetCount \}\}<\/span>/);
  assert.match(header, />\+ New build<\/button>/);
  assert.match(header, />Import Questlog<\/button>/);
  assert.doesNotMatch(header, /Auto-fill|onAutoFill/);
  assert.match(header, /aria-label="Character name"/);
  assert.match(header, /aria-label="Build role"/);
  assert.match(header, /aria-label="Server"/);
  assert.match(shellCss, /\.tl-armory-identity\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(shellCss, /\.tl-armory-header \.tl-toolbar-actions\s*\{[\s\S]*?grid-template-columns:/);

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
  assert.doesNotMatch(markup, /onAutoFill|seedShowcaseBuild\(/);
});

test("compact item editing flows from selection into per-item configuration", () => {
  const picker = sectionBetween('value="{{ pickerOpen }}"', '</x-dc>');
  assert.match(picker, /data-picker-view="{{ pickerView }}"/);
  assert.match(picker, />1&nbsp; Choose item</);
  assert.match(picker, />2&nbsp; Configure</);
  assert.match(picker, /Runes \{\{ preview\.runeFilled \}\}\/3/);
  assert.match(markup, /view: equipped \? "config" : "list"/);
  assert.match(markup, /if \(isEquipped\) this\.setState\(\{ picker: \{ \.\.\.picker, view: "config" \}/);
  assert.doesNotMatch(markup, /isEquipped \? "" : item\.id/);
  assert.doesNotMatch(shellCss, /Item Picker[^\n]+last-child[^\n]+display:\s*none/);
});

test("item Heroic effects use one consistent stacked column", () => {
  const picker = sectionBetween('value="{{ pickerOpen }}"', '</x-dc>');
  assert.match(picker, /data-item-heroic-effects[^>]+grid-template-columns:\s*minmax\(0,1fr\)/);
  assert.doesNotMatch(picker, /heroicEffectRows[\s\S]{0,800}repeat\(auto-fit/);
});

test("stat totals carry delta-flash hooks that tween without touching at-rest values", () => {
  // Every animated surface tags its value node with a stable key plus the
  // React-managed truth attribute the tween reconciles against.
  assert.match(markup, /data-stat-flash="stat-total:\{\{ row\.id \}\}" data-stat-flash-value="\{\{ row\.value \}\}"/);
  assert.match(markup, /data-stat-flash="\{\{ selectedStat\.flashId \}\}" data-stat-flash-value="\{\{ selectedStat\.value \}\}"/);
  assert.match(markup, /data-stat-flash="\{\{ src\.flashId \}\}" data-stat-flash-value="\{\{ src\.value \}\}"/);
  assert.match(markup, /data-stat-flash="stat-fav:\{\{ row\.id \}\}" data-stat-flash-value="\{\{ row\.value \}\}"/);
  assert.match(markup, /data-stat-flash="hero:\{\{ chip\.label \}\}" data-stat-flash-value="\{\{ chip\.value \}\}"/);
  // The diff pass runs after every commit and skips keys seen for the first time.
  assert.match(markup, /this\.syncStatDeltaFlash\(\);/);
  assert.match(markup, /if \(prev === undefined \|\| prev === next\)/);
  // Flash colors consume the shell's good/bad tokens with hex fallbacks.
  assert.match(markup, /var\(--tl-shell-good, #7ee0a6\)/);
  assert.match(markup, /var\(--tl-shell-bad, #ff9d84\)/);
  assert.match(markup, /@keyframes tlStatFlashUp/);
  assert.match(markup, /@keyframes tlStatFlashDown/);
  // Reduced motion falls back to the instant value React already rendered.
  assert.match(markup, /prefers-reduced-motion: reduce[\s\S]{0,200}matches/);
});
