// The structured optimizer API must translate the public JSON schema into the
// engine request faithfully (weapon aliases, heroic policy, goal modes/units),
// keep preview and save as separate explicit steps with a stable result id, and
// guard irreversible operations. The engine is stubbed; its own behavior is
// covered by the adapter tests.
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import * as persistence from "../../web/tl-persistence.js";
import * as presetMeta from "../../web/tl-preset-meta.js";
import { createOptimizerApi } from "../../web/optimizer/tl-optimizer-api.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _map: map,
  };
}

// Records the last request and returns a canned result shaped like the adapter.
function stubAdapter() {
  const calls = [];
  const cannedResult = {
    name: "Optimized build from scratch",
    score: 1.5,
    loadout: { equipment: [{ id: "main_hand", name: "Test Sword", grade: 51, selection: { itemId: "x" } }] },
    goalResults: [
      { id: "weaken_accuracy", name: "Weaken Chance", value: 2000, formattedValue: "2,000", rank: 1, minimumMet: null, components: [] },
      { id: "skill_cooldown_modifier", name: "Cooldown Speed", value: 900, formattedValue: "90%", rank: 2, minimumMet: null, components: [] },
    ],
    setEffects: { sets: [{ name: "Test Set", equippedPieces: 2, breakpoints: [{ required: 2, active: true }, { required: 4, active: false }] }] },
    heroicSelectionReport: [{ itemName: "Test Heroic", groups: [] }],
    assumptions: ["assumption"],
    explanations: ["explanation"],
    tuningFrontier: [
      { id: "cand-a", score: 1.5, goalValues: { weaken_accuracy: 2000, skill_cooldown_modifier: 900 } },
      { id: "cand-b", score: 1.4, goalValues: { weaken_accuracy: 2200, skill_cooldown_modifier: 800 } },
    ],
    build: { equipment: {}, artifacts: {}, supportSlots: {}, skills: [], masteries: {}, unifiedMasteries: [] },
    attributes: { str: 10, dex: 0, int: 0, per: 0, con: 0 },
    optimizedAttributes: { str: 10, dex: 0, int: 0, per: 0, con: 0 },
  };
  return {
    calls,
    async createScratchBuild({ attributes = {} } = {}) {
      return { build: core.createInitialBuild(), attributes: { str: 0, dex: 0, int: 0, per: 0, con: 0, ...attributes }, sourceKind: "scratch" };
    },
    async loadArmoryBuild() { return null; },
    async optimize(request) { calls.push(request); return cannedResult; },
  };
}

function makeApi() {
  const storage = memoryStorage();
  const adapter = stubAdapter();
  const api = createOptimizerApi({ core, adapter, persistence, presetMeta, storage });
  return { api, adapter, storage };
}

const SAMPLE = {
  weapons: ["sword", "greatsword"],
  heroics: { maximum: 3, itemPolicy: "allow_all", configurationPolicy: "optimize" },
  goals: [
    { stat: "pvp_all_critical_defense", mode: "target", value: 3000 },
    { stat: "pvp_magic_double_defense", mode: "minimum", value: 2000 },
    { stat: "weaken_accuracy", mode: "maximize" },
  ],
  deprioritize: ["hp_max", "damage_reduction"],
};

test("optimize maps the public schema to the engine request", async () => {
  const { api, adapter } = makeApi();
  await api.optimize(SAMPLE);
  const request = adapter.calls.at(-1);
  assert.equal(request.sourceKind, "scratch");
  assert.deepEqual(request.weaponTypes, ["sword", "sword2h"], "greatsword alias resolves to sword2h");
  assert.equal(request.rules.heroicPolicy, "replace_any", "allow_all + optimize → replace_any");
  const [target, minimum, maximize] = request.goals.priorities;
  assert.equal(target.mode, "target");
  assert.equal(target.target, core.statDisplayToRaw("pvp_all_critical_defense", 3000));
  assert.equal(target.minimum, null);
  assert.equal(minimum.mode, "at_least");
  assert.equal(minimum.minimum, core.statDisplayToRaw("pvp_magic_double_defense", 2000));
  assert.equal(maximize.mode, "maximize");
  assert.deepEqual([target.rank, minimum.rank, maximize.rank], [1, 2, 3]);
});

test("set-effect controls pass through to rules.sets", async () => {
  const { api, adapter } = makeApi();
  await api.optimize({
    weapons: ["sword", "dagger"],
    goals: [{ stat: "weaken_accuracy", mode: "maximize" }],
    sets: { require: "set_x", prefer: true, allowBreaking: false, minimumActiveBonuses: 2 },
  });
  assert.deepEqual(adapter.calls.at(-1).rules.sets, { require: "set_x", prefer: true, allowBreaking: false, minimumActiveBonuses: 2 });
  // no sets field ⇒ rules.sets is absent (engine keeps today's behavior)
  const { api: api2, adapter: adapter2 } = makeApi();
  await api2.optimize({ weapons: ["sword", "dagger"], goals: [{ stat: "weaken_accuracy", mode: "maximize" }] });
  assert.equal(adapter2.calls.at(-1).rules.sets, undefined);
});

test("listSets returns discoverable set ids with piece counts", async () => {
  const { api } = makeApi();
  const sets = await api.listSets();
  assert.ok(sets.length > 0, "the catalogue has armor sets");
  assert.ok(sets.every((set) => typeof set.id === "string" && typeof set.name === "string" && Number.isFinite(set.pieces)));
  const sorted = [...sets].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  assert.deepEqual(sets.map((s) => s.id), sorted.map((s) => s.id), "returned sorted by name");
});

test("heroic policy mapping covers all three configurations", async () => {
  const cases = [
    [{ itemPolicy: "keep", configurationPolicy: "keep" }, "keep_config"],
    [{ itemPolicy: "keep", configurationPolicy: "optimize" }, "keep_items"],
    [{ itemPolicy: "allow_all", configurationPolicy: "optimize" }, "replace_any"],
  ];
  for (const [heroics, expected] of cases) {
    const { api, adapter } = makeApi();
    await api.optimize({ weapons: ["sword", "dagger"], heroics, goals: [{ stat: "weaken_accuracy", mode: "maximize" }] });
    assert.equal(adapter.calls.at(-1).rules.heroicPolicy, expected, JSON.stringify(heroics));
  }
});

test("optimize surfaces ignored deprioritize hints and rejects unknown stats", async () => {
  const { api } = makeApi();
  const result = await api.optimize(SAMPLE);
  assert.deepEqual(result.ignored.deprioritize, ["hp_max", "damage_reduction"]);
  await assert.rejects(
    api.optimize({ weapons: ["sword", "dagger"], goals: [{ stat: "not_a_real_stat", mode: "maximize" }] }),
    /Unknown goal stat id/,
  );
});

test("the same request yields a stable resultId across runs", async () => {
  const a = makeApi();
  const b = makeApi();
  const one = await a.api.optimize(SAMPLE);
  const two = await b.api.optimize(SAMPLE);
  assert.equal(one.resultId, two.resultId);
  assert.match(one.resultId, /^[0-9a-f]{8}$/);
});

test("candidates come from the retained frontier keyed by goal vector", async () => {
  const { api } = makeApi();
  const { resultId } = await api.optimize(SAMPLE);
  const candidates = await api.getCandidates(resultId);
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map((c) => c.candidateId), ["cand-a", "cand-b"]);
  assert.equal(candidates[0].goals.find((g) => g.stat === "weaken_accuracy").value, 2000);
});

test("preview never persists; saveResult persists explicitly with a unique name", async () => {
  const { api, storage } = makeApi();
  const preview = await api.preview(SAMPLE);
  assert.equal(persistence.loadArmoryPresets(storage, {}).ok ? persistence.loadArmoryPresets(storage, {}).data.length : 0, 0, "preview must not save");
  const saved = await api.saveResult(preview.resultId, { name: "SNS/GS API Build" });
  assert.equal(saved.saved, true);
  const presets = await api.listPresets();
  assert.equal(presets.length, 1);
  assert.equal(presets[0].name, "SNS/GS API Build");
  assert.equal(presets[0].origin, "optimized");
  // saving again with the same name disambiguates rather than colliding
  const again = await api.saveResult(preview.resultId, { name: "SNS/GS API Build" });
  assert.equal(again.name, "SNS/GS API Build (2)");
});

test("saveResult can replace an existing preset in place", async () => {
  const { api } = makeApi();
  const { resultId } = await api.optimize(SAMPLE);
  const first = await api.saveResult(resultId, { name: "Replace Me" });
  const replaced = await api.saveResult(resultId, { replacePresetId: first.id, name: "Replaced" });
  assert.equal(replaced.replaced, true);
  assert.equal(replaced.id, first.id);
  const presets = await api.listPresets();
  assert.equal(presets.length, 1, "replace does not create a new preset");
  assert.equal(presets[0].name, "Replaced");
});

test("rename disambiguates duplicates and delete requires explicit confirmation", async () => {
  const { api } = makeApi();
  const { resultId } = await api.optimize(SAMPLE);
  const a = await api.saveResult(resultId, { name: "Alpha" });
  const b = await api.saveResult(resultId, { name: "Beta" });
  const renamed = await api.renamePreset(b.id, "Alpha");
  assert.equal(renamed.name, "Alpha (2)", "rename must not collide with an existing name");
  await assert.rejects(api.deletePreset(a.id), /requires \{ confirm: true \}/);
  const deleted = await api.deletePreset(a.id, { confirm: true });
  assert.equal(deleted.deleted, true);
  assert.equal((await api.listPresets()).length, 1);
});

test("activatePreset writes the active build and backs up the replaced one", async () => {
  const { api, storage } = makeApi();
  // seed an existing active build so there is something to back up
  persistence.saveArmoryState(storage, { profile: { name: "Old" }, attributes: {}, favoriteStatIds: [], build: { equipment: { main_hand: { itemId: "prev" } } } }, {});
  const { resultId } = await api.optimize(SAMPLE);
  const saved = await api.saveResult(resultId, { name: "Activate Me" });
  const activated = await api.activatePreset(saved.id);
  assert.equal(activated.activated, true);
  const undo = persistence.loadArmoryUndo(storage, {});
  assert.equal(undo.ok, true, "the replaced build is recoverable");
  assert.equal(undo.data.profile.name, "Old");
});
