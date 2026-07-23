import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/full-build-optimizer.html", import.meta.url), "utf8");
const scratchHtml = await readFile(new URL("../../web/build-from-scratch.html", import.meta.url), "utf8");

test("both optimizer pages carry complete social sharing metadata", () => {
  const expectations = [
    [html, "Build Optimizer | TL Helper", "https://tlhelper.org/full-build-optimizer"],
    [scratchHtml, "Build Optimizer: Build from Scratch | TL Helper", "https://tlhelper.org/build-from-scratch"],
  ];
  for (const [page, title, url] of expectations) {
    assert.ok(page.includes('<meta property="og:type" content="website">'), `${url} og:type`);
    assert.ok(page.includes(`<meta property="og:title" content="${title}">`), `${url} og:title`);
    assert.match(page, /<meta property="og:description" content="[^"]+">/, `${url} og:description`);
    assert.ok(page.includes(`<meta property="og:url" content="${url}">`), `${url} og:url`);
    assert.ok(page.includes('<meta property="og:image" content="https://tlhelper.org/tl-logo.png">'), `${url} og:image`);
    assert.ok(page.includes('<meta name="twitter:card" content="summary">'), `${url} twitter:card`);
    assert.ok(page.includes('<meta name="twitter:image" content="https://tlhelper.org/tl-logo.png">'), `${url} twitter:image`);
  }
});

test("full-build optimizer is a standalone shared-shell page", () => {
  assert.match(html, /<link[^>]+tl-shell\.css/);
  assert.match(html, /class="tl-app-header"/);
  assert.match(html, /Build Optimizer/);
  assert.match(html, /Keep what matters\. Improve the rest\./);
});

test("optimizer exposes source, goal, lock, and search controls", () => {
  assert.match(html, /data-source="armory"/);
  assert.match(html, /data-source="questlog"/);
  assert.match(html, /href="\.\/build-from-scratch\.html"/);
  assert.doesNotMatch(html, /data-source="scratch"/);
  assert.match(html, /id="increase-picker"/);
  assert.match(html, /id="protect-picker"/);
  assert.match(html, /id="slot-locks"/);
  assert.match(html, /id="heroic-policy"/);
  assert.match(html, /value="keep_config" selected/);
  assert.match(html, /value="keep_items"/);
  assert.match(html, /value="replace_any"/);
  assert.match(html, /id="lock-all-slots"/);
  assert.match(html, /id="clear-slot-locks"/);
  assert.match(html, /id="equipment-source-select"/);
  assert.match(html, /listArmoryBuilds\(\)/);
  assert.doesNotMatch(html, /id="search-depth"|data-value="fast"|data-value="thorough"/);
  assert.match(html, /depth:"refine"/);
  assert.doesNotMatch(html, /id="keep-heroics"|id="reconsider-heroics"|id="best-heroic"/);
  assert.match(html, /id="cancel-optimizer"/);
});

test("goal selection uses the structured Build from Scratch picker pattern", () => {
  assert.match(html, /class="picker-trigger"/);
  assert.match(html, /class="picker-menu hidden" role="dialog"/);
  assert.match(html, /Search all calculated stats/);
  assert.match(html, /STAT_CATEGORIES/);
  assert.match(html, /class="picker-results"/);
  assert.match(html, /class="goal-chip"/);
  assert.doesNotMatch(html, /createElement\("datalist"\)/);
  assert.match(html, /Ranked &middot; drag to reorder/);
  assert.match(html, /compositeComponents/);
  assert.match(html, /class="composite-badge"/);
  assert.match(html, /draggable="true"/);
  assert.match(html, /data-drag-handle/);
  assert.match(html, /goals:\{ priorities:state\.increase\.map/);
});

test("wanted stats support At least and Target minimums in display units", () => {
  assert.match(html, /data-goal-mode/);
  assert.match(html, /data-goal-value/);
  assert.match(html, /\["at_least","At least — floor, still rewards more"\]/);
  assert.match(html, /\["target","Target — floor, then stops"\]/);
  assert.match(html, /statDisplayToRaw\(id,Number\(displayValue\)\)/);
  assert.match(html, /minimum:mode==="at_least"\?value:null/);
  assert.match(html, /target:mode==="target"\?value:null/);
  assert.match(html, /Hard floor · excess above it is still rewarded/);
  assert.match(html, /Hard floor · stops rewarding past the value/);
  assert.match(html, /or switch it back to Maximize/);
  assert.match(html, /goalModes\[floor\.id\]="at_least"/);
  assert.match(html, /goalValues\[floor\.id\]=floor\.display/);
  assert.match(html, /id="run-hint"/);
});

test("protected goals show current calculated floors without shifting the workspace", () => {
  assert.match(html, /adapter\.currentStats/);
  assert.match(html, /class="picker-option-value" title="Current value"/);
  assert.match(html, /class="goal-chip-value" title="Current protected floor"/);
  assert.doesNotMatch(html, /\.setup-workspace:has\(\.picker-menu:not\(\.hidden\)\)/);
  assert.match(html, /id="goal-presets"/);
  assert.match(html, /class="goals-grid"/);
  assert.match(html, /repeat\(3,minmax\(0,1fr\)\)/);
});

test("items to keep uses a character equipment doll with complete source selection", () => {
  assert.match(html, /class="equipment-doll-grid"/);
  assert.match(html, /class="equipment-character"/);
  assert.match(html, /class="equipment-weapons"/);
  assert.match(html, /data-equipment-slot/);
  assert.match(html, /LEFT_EQUIPMENT_SLOTS/);
  assert.match(html, /RIGHT_EQUIPMENT_SLOTS/);
  assert.match(html, /Current Armory —/);
  assert.match(html, /Empty slots are available for the optimizer to fill/);
  assert.match(html, /id="heroic-empty-status"/);
  assert.match(html, /buildItemHoverModel\(slotId/);
  assert.match(html, /class="equipment-character-power"/);
  assert.match(html, /EQUIPMENT_ATTRIBUTES/);
  assert.match(html, /EQUIPMENT_HIGHLIGHTS/);
  assert.match(html, /equipmentStatsHtml\(\)/);
  assert.doesNotMatch(html, /class="equipment-character-mark"/);
});

test("optimizer uses full-screen setup and loading before opening the shared result screen", () => {
  assert.match(html, /id="setup-state" class="setup-workspace"/);
  assert.match(html, /grid-template-areas:"progress" "source" "goals" "locks" "rules" "actions"/);
  assert.match(html, /\.actions \{ position:sticky; bottom:12px;/);
  assert.match(html, /class="progress-card"/);
  assert.match(html, /Improving your build/);
  assert.match(html, /function setView\(view\)/);
  assert.match(html, /setView\("progress"\)/);
  assert.match(html, /openSharedResult/);
  assert.match(html, /storeImprovedResult/);
  assert.match(html, /build-from-scratch\.html\?result=improved/);
  assert.doesNotMatch(html, /id="empty-state"/);
  assert.match(html, /new Worker\("\.\/optimizer\/tl-builder-worker\.js"/);
  assert.match(html, /message\.type==="progress"/);
  assert.match(html, /Complete-build search/);
});

test("optimizer setup is a progressive four-step flow", () => {
  assert.match(html, /class="wizard-progress"/);
  assert.equal(html.match(/data-wizard-step="[1-4]"/g)?.length, 4);
  assert.equal(html.match(/data-wizard-panel="[1-4]"/g)?.length, 4);
  assert.match(html, /id="wizard-back"/);
  assert.match(html, /id="wizard-next"/);
  assert.match(html, /function setWizardStep\(step/);
  assert.match(html, /class="review-strip"/);
});

test("optimizer mode switch remains visible above the guided steps", () => {
  assert.match(html, /class="optimizer-mode-switch"/);
  assert.match(html, /aria-label="Choose optimizer mode"/);
  assert.match(html, /href="\.\/build-from-scratch\.html"/);
});

test("optimizer steps follow the same order in the document and on screen", () => {
  const source = html.indexOf('id="source-title">1. Starting build');
  const goals = html.indexOf('id="goals-title">2. Choose your priorities');
  const locks = html.indexOf('id="locks-title">3. Items to keep');
  const rules = html.indexOf('id="rules-title">4. Search options');
  assert.ok(source >= 0 && source < goals && goals < locks && locks < rules);
});

test("improved results reuse the Build from Scratch result experience", () => {
  assert.match(html, /import\("\.\/optimizer\/tl-optimizer-result-handoff\.js"\)/);
  assert.match(html, /location\.href="\.\/build-from-scratch\.html\?result=improved"/);
  assert.doesNotMatch(html, /renderResult\(message\.result\)/);
});

test("optimizer represents sets, traits, Heroics, runes, and artifacts", () => {
  assert.match(html, /Heroic equipment/);
  assert.match(html, /includeSetEffects:true/);
  assert.match(html, /optimizeThreeTraits:true/);
  assert.match(html, /bestHeroicConfiguration:true/);
  assert.match(html, /keepCurrentHeroics:heroicPolicy==="keep_config"/);
  assert.match(html, /reconsiderHeroics:heroicPolicy==="replace_any"/);
  assert.match(html, /Item Potentials are excluded from calculations and recommendations/);
  assert.match(html, /Optimize normal/);
  assert.match(html, /Owned Chaos/);
  assert.match(html, /normalDuplicateCap:3/);
  assert.match(html, /chaosDuplicateCap:1/);
  assert.match(html, /Chaos rune IDs already equipped/);
  assert.match(html, /no more than one Chaos rune per item/);
  assert.match(html, /Optimize sets/);
});

test("optimizer uses a strict adapter and never fabricates recommendations", () => {
  assert.match(html, /import\("\.\/optimizer\/tl-full-build-adapter\.js"\)/);
  assert.match(html, /createOptimizerAdapter/);
  assert.match(html, /loadArmoryBuild/);
  assert.match(html, /importQuestlogBuild/);
  assert.match(html, /listStats/);
  assert.match(html, /tl-builder-worker\.js/);
  assert.match(html, /worker\.postMessage\(\{type:"optimize"/);
  assert.match(html, /Results only come from the calculation engine|calculation rules automatically/);
  assert.match(html, /returned an invalid result/);
  assert.doesNotMatch(html, /setTimeout\([^)]*renderResult/);
});

test("result contract includes comparison, deltas, explanations, warnings, and alternatives", () => {
  assert.match(html, /result\.slots/);
  assert.match(html, /result\.statDeltas/);
  assert.match(html, /result\.explanations/);
  assert.match(html, /result\.assumptions/);
  assert.match(html, /result\.warnings/);
  assert.match(html, /result\.alternatives/);
  assert.match(html, /Current<\/th><th>Recommended/);
  assert.match(html, /Other strong finalists/);
  assert.doesNotMatch(html, /Near-optimal alternatives/);
});

test("result handoff remains independent of unlicensed market data", () => {
  assert.match(html, /priorities:state\.increase/);
  assert.match(html, /includeSetEffects:true/);
  assert.doesNotMatch(html, /TLDB|\/api\/market\/prices|Lucent/);
});
