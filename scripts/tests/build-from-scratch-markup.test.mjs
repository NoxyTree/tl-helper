import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/build-from-scratch.html", import.meta.url), "utf8");

test("Builder transforms from setup into a full character result", () => {
  assert.match(html, /Build from Scratch/);
  assert.match(html, /Forge a strong loadout/);
  assert.doesNotMatch(html, /Forge best loadout/);
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
  assert.match(html, /class="tl-weapon-card"/);
  assert.match(html, /class="tl-weapon-card-select"/);
  assert.equal(html.match(/class="tl-weapon-pairing"/g)?.length, 1);
  assert.match(html, /\.tl-weapon-card-select\{position:absolute;z-index:5;inset:0;width:100%;height:100%/);
  assert.match(html, /name:selected\?this\.core\.label\(selected\):'Choose weapon'/);
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
  // The "No Heroics" mode was retired — an optimized build always includes heroics.
  assert.doesNotMatch(html, /id:'none', label:'No Heroics'/);
});

test("forge runs in a worker and remains cancellable", () => {
  assert.match(html, /new Worker\('\.\/optimizer\/tl-builder-worker\.js'/);
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

test("result tuning links two to five real-stat sliders to retained complete builds", () => {
  assert.match(html, /Tune the tradeoff/);
  assert.match(html, /class="tl-tune-range"/);
  assert.match(html, /paretoTuneFrontier/);
  assert.match(html, /selectLinkedTuneCandidate/);
  assert.match(html, /s\.priorities\.slice\(0,5\)/);
  assert.match(html, /complete recalculated build/);
  assert.match(html, /tradeoff builds/);
  assert.match(html, /Hard cap/);
  assert.match(html, /General PvP diff/);
  assert.match(html, /candidateProgression=candidate\.progression\?\{\.\.\.structuredClone\(candidate\.progression\.summary\|\|\{\}\),settings:structuredClone\(candidate\.progression\.settings\|\|\{\}\)\}:null/);
  assert.match(html, /progression:candidateProgression,goalResults,allStats/);
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

test("scratch Overall Mastery uses decoded level choices and emits only the explicit level", () => {
  assert.match(html, /aria-label="Overall Mastery unlock threshold"/);
  assert.match(html, /Unlocked through level \$\{level\}/);
  assert.match(html, /OVERALL_MASTERY_LEVELS = Object\.freeze\(Array\.from\(\{length:13\},\(_,index\)=>index\*130\)\)/);
  assert.match(html, /overallMasteryLevel:0/);
  assert.match(html, /this\.OVERALL_MASTERY_LEVELS\.includes\(requested\)\?requested:0/);
  assert.match(html, /progression:\{\.\.\.this\.state\.progression,masteryPointsByWeapon:\{\.\.\.this\.state\.progression\.masteryPointsByWeapon\}\}/);
  assert.match(html, /this\._worker\.postMessage\(\{type:'optimize',request\}\)/);
  assert.doesNotMatch(html, /includePotential/);
  assert.doesNotMatch(html, /togglePotential/);
  assert.match(html, /The node named Potential is separate from Item Potentials, which remain excluded/);
});

test("scratch result lists each Overall Mastery node with honest calculation classification", () => {
  assert.match(html, /\{\{ overallMasteryCount \}\}\/4 selected using unlock threshold \{\{ resultOverallMasteryLevel \}\}/);
  assert.match(html, /Calculator evaluated/);
  assert.match(html, /<sc-for list="\{\{ overallMasteries \}\}" as="mastery"/);
  assert.match(html, /\{\{ mastery\.classification \}\}/);
  assert.match(html, /this\.core\.unifiedMasteryCounted\(id\)/);
  assert.match(html, /this\.scenarioEffects\?\.SCENARIO_EFFECT_DEFINITIONS\?\.\[id\]/);
  assert.match(html, /scenarioAppliedRows\.filter\(row=>row\.effectId===id\)/);
  assert.match(html, /persistent\?'persistent':scenarioApplied\?'scenario-applied':'unsupported'/);
  assert.match(html, /Applied only to scenario totals/);
  assert.match(html, /no static value was invented/);
  assert.doesNotMatch(html, /contributes directly to these totals/);
});
