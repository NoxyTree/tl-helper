import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/gear-viewer.html", import.meta.url), "utf8");

test("Gear Viewer cache identity includes canonical static and scenario fingerprints", () => {
  assert.match(html, /import \{ scenarioCalculationFingerprint, staticCalculationFingerprint \} from "\.\/tl-build-snapshot\.js"/);
  assert.match(html, /staticCalculationFingerprint\(\{ build, attributes, includeSetEffects: state\.includeSetEffects \}\)/);
  assert.match(html, /scenarioCalculationFingerprint\(\{ build, attributes, includeSetEffects: state\.includeSetEffects, scenario \}\)/);
  assert.match(html, /staticCalculationFingerprint\(\{ build: context\.build, attributes: context\.attributes, includeSetEffects: state\.includeSetEffects \}\)/);
  assert.match(html, /scenarioCalculationFingerprint\(\{ build: context\.build, attributes: context\.attributes, includeSetEffects: state\.includeSetEffects, scenario \}\)/);
  assert.match(html, /\$\{state\.mode\}\|\$\{calculationKey\}/);
});

test("Gear Viewer refuses non-legal source builds before ranking", () => {
  assert.match(html, /calculationBlock = state\.mode === "bare" \|\| \(currentCalculation\.status\?\.state === "legal" && currentCalculation\.scenarioEffects\?\.status !== "unsupported"\)/);
  assert.match(html, /if \(calculationBlock\) return \[\]/);
  assert.match(html, /must be resolved before build-aware gear ranking/);
  assert.match(html, /core\.itemSelectionCalculationStatus\(item, selection/);
  assert.match(html, /if \(selectionStatus\.state !== "legal"\) continue/);
  assert.match(html, /core\.slotSelectionCalculationStatus\(slotId, selection, build, attributes/);
  assert.ok(
    html.indexOf("const currentCalculation = core.calculateBuild(build, attributes") < html.indexOf("if (poolCache.has(key))"),
    "source legality must be checked before a cached ranking can be returned",
  );
});
