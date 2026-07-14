import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/build-from-scratch.html", import.meta.url), "utf8");

test("Builder transforms from setup into a full character result", () => {
  assert.match(html, /Build from Scratch/);
  assert.match(html, /The build you created/);
  assert.match(html, /Edit build goals/);
  assert.match(html, /Equipment/);
  assert.match(html, /Favourite Stats/);
  for (const label of ["Summary", "Attack", "Defense", "Utility", "PvP", "Boss", "Gear", "Sets & Runes"]) assert.ok(html.includes(label));
});

test("Improve my build opens the exact Builder result with kept equipment context", () => {
  assert.match(html, /loadImprovedResult\(sessionStorage\)/);
  assert.match(html, /resultOrigin:'improved'/);
  assert.match(html, /Your improved build/);
  assert.match(html, /· KEPT/);
  assert.match(html, /Items marked KEPT were carried forward/);
  assert.match(html, /Save as preset/);
  assert.match(html, /Use in Armory/);
  assert.match(html, /saveArmoryPresets/);
  assert.match(html, /saveArmoryState/);
});

test("setup uses real weapon, ranked goal modes, rules, and attribute contracts", () => {
  assert.match(html, /aria-label="\{\{ w\.ariaLabel \}\}"/);
  assert.match(html, /aria-label="Add a priority stat"/);
  assert.match(html, /movePriority/);
  assert.match(html, /Goal mode for \{\{ p\.name \}\}/);
  assert.match(html, /mode,minimum:mode==='at_least'/);
  assert.match(html, /target:mode==='target'/);
  assert.match(html, /statDisplayToRaw/);
  assert.match(html, /attributePointBudget:this\.ATTR_BUDGET/);
  assert.match(html, /ATTR_BUDGET = 59/);
  assert.match(html, /depth:'thorough'/);
});

test("owned Heroic builder uses the canonical item-specific data model", () => {
  assert.match(html, /My Heroics/);
  assert.match(html, /heroicCatalog\(group\)/);
  assert.match(html, /HEROIC_GRADE/);
  assert.match(html, /heroicEffectGroupCount/);
  assert.match(html, /heroicEffectOptions/);
  assert.match(html, /heroicEffectValue/);
  assert.match(html, /uniqueTrait/);
  assert.match(html, /resonance/);
  assert.match(html, /Choose the exact owned rune, stat roll, and level/);
  assert.match(html, /Use only my Heroics/);
  assert.match(html, /Allow theoretical/);
  assert.match(html, /No Heroics/);
});

test("forge runs in a worker and remains cancellable", () => {
  assert.match(html, /new Worker\('\.\/tl-builder-worker\.js'/);
  assert.match(html, /postMessage\(\{type:'optimize'/);
  assert.match(html, /postMessage\(\{type:'cancel'/);
  assert.match(html, /progressPhase/);
  assert.match(html, /Cancel/);
  assert.doesNotMatch(html, /setInterval\(/);
});

test("result is calculated and inspectable rather than mocked", () => {
  assert.match(html, /calculateBuild\(result\.build/);
  assert.match(html, /resultCalc\.status\?\.state!==\'legal\'/);
  assert.match(html, /It was not displayed or saved/);
  assert.match(html, /result\?\.allStats/);
  assert.match(html, /result\?\.goalResults/);
  assert.match(html, /result\.optimizedAttributes/);
  assert.match(html, /buildItemHoverModel/);
  assert.match(html, /optionalFallback:false/);
  assert.match(html, /toggleLock/);
  assert.doesNotMatch(html, /<table/);
  assert.match(html, /synergy\.stats/);
  assert.match(html, /formatSigned\(value,id\)/);
});

test("Builder results use the shared Armory hover card contract", () => {
  assert.match(html, /dc-import name="ItemHoverCard" data="\{\{ hover \}\}"/);
  assert.match(html, /hoverModel:\{\.\.\.hover/);
  assert.match(html, /Each effect may be selected only once per item/);
});

test("result tuning links two to five real-stat sliders to retained legal builds", () => {
  assert.match(html, /Tune the tradeoff/);
  assert.match(html, /class="tl-tune-range"/);
  assert.match(html, /paretoTuneFrontier/);
  assert.match(html, /selectLinkedTuneCandidate/);
  assert.match(html, /s\.priorities\.slice\(0,5\)/);
  assert.match(html, /non-dominated legal build/);
  assert.match(html, /tradeoff builds/);
  assert.match(html, /Hard cap/);
  assert.match(html, /General PvP diff/);
});

test("attribute shortcomings are hidden behind hover tracks", () => {
  assert.match(html, /hover a track for breakpoint rewards/);
  assert.match(html, /onMouseEnter="\{\{ at\.open \}\}"/);
  assert.match(html, /onMouseLeave="\{\{ closeAttr \}\}"/);
  assert.match(html, /ATTRIBUTE_BREAKPOINTS/);
});

test("availability rules have accessible information controls", () => {
  assert.match(html, /endgame: true/);
  assert.match(html, /minimumItemLevel:this\.state\.rules\.endgame\?50:0/);
  assert.match(html, /Endgame equipment/);
  assert.match(html, /aria-label="About \{\{ r\.name \}\}"/);
  assert.match(html, /onMouseEnter="\{\{ r\.showTip \}\}"/);
  assert.match(html, /onFocus="\{\{ r\.showTip \}\}"/);
  assert.match(html, /role="tooltip"/);
});

test("scratch builds configure passive skills and per-weapon mastery without inventing an active loadout", () => {
  assert.match(html, /Passive Skills &amp; Mastery/);
  assert.match(html, /Active and defensive skills are deliberately excluded/);
  assert.match(html, /skillLevelCap/);
  assert.match(html, /masteryPointsByWeapon/);
  assert.match(html, /MASTERY_POINT_BUDGET/);
  assert.match(html, /selects eight passive skills/);
  assert.match(html, /toggleStatSources/);
  assert.match(html, /sourceLabel/);
});
