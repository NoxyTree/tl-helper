import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as realCore from "../../web/tl-core.js";
import { createOptimizerAdapter } from "../../web/tl-full-build-adapter.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";
import {
  DEFAULT_LLM_BUILD_REQUEST,
  executeLlmBuildControl,
  normalizeLlmBuildRequest,
  optimizerRequestFromLlmControl,
  parseLlmBuildRequest,
  persistLlmControlResult,
  resolveLlmControlAccount,
  summarizeLlmControlResult,
} from "../../web/tl-llm-build-control.js";

const statOptions = [
  { id: "pvp_endurance", name: "PvP Endurance" },
  { id: "weaken_chance", name: "Weaken Chance" },
  { id: "buff_duration", name: "Buff Duration" },
];
const slotOptions = [{ id: "chest", name: "Chest" }];
const core = { statDisplayToRaw: (id, value) => id === "buff_duration" ? value * 100 : value };

function request(overrides = {}) {
  return {
    version: 1,
    operation: "optimize",
    source: { kind: "armory" },
    goals: [{ stat: "PvP Endurance" }, { stat: "Buff Duration", mode: "target", value: 90 }],
    locks: { keepHeroics: true, slots: ["Chest"] },
    rules: { runes: "normal", artifacts: "sets" },
    output: {},
    ...overrides,
  };
}

test("LLM control parses and normalizes human-readable stats and display values", () => {
  const normalized = normalizeLlmBuildRequest(parseLlmBuildRequest(JSON.stringify(request())), { statOptions, slotOptions, core });
  assert.deepEqual(normalized.goals.map(({ id, mode, rawValue }) => ({ id, mode, rawValue })), [
    { id: "pvp_endurance", mode: "maximize", rawValue: null },
    { id: "buff_duration", mode: "target", rawValue: 9000 },
  ]);
  assert.deepEqual(normalized.locks.slotIds, ["chest"]);
  assert.equal(normalized.rules.includeSetEffects, true);
});

test("LLM control rejects duplicate goals and missing target values", () => {
  assert.throws(() => normalizeLlmBuildRequest(request({ goals: ["PvP Endurance", "pvp_endurance"] }), { statOptions, slotOptions, core }), /appears more than once/);
  assert.throws(() => normalizeLlmBuildRequest(request({ goals: [{ stat: "Weaken Chance", mode: "target" }] }), { statOptions, slotOptions, core }), /must be a finite number/);
});

test("signed-in account targeting verifies the requested account name", async () => {
  const control = normalizeLlmBuildRequest(request({
    account: { mode: "signed_in", expectedName: "noxytree", syncPreset: true },
    output: { savePresetAs: "Account Tank" },
  }), { statOptions, slotOptions, core });
  await assert.rejects(
    resolveLlmControlAccount(control, async () => ({ client: {}, user: { id: "u1" }, name: "someone-else", aliases: ["someone-else"] })),
    /not the requested account/,
  );
  const account = await resolveLlmControlAccount(control, async () => ({ client: {}, user: { id: "u1" }, name: "noxytree", aliases: ["noxytree"] }));
  assert.equal(account.user.id, "u1");
});

test("LLM control maps normalized goals and rules to the existing optimizer contract", () => {
  const control = normalizeLlmBuildRequest(request(), { statOptions, slotOptions, core });
  const source = { build: { equipment: {} }, attributes: {}, sourceKind: "armory" };
  const optimizer = optimizerRequestFromLlmControl(control, source);
  assert.equal(optimizer.build, source);
  assert.deepEqual(optimizer.lockedSlotIds, ["chest"]);
  assert.deepEqual(optimizer.goals.priorities[1], {
    id: "buff_duration",
    rank: 2,
    mode: "target",
    minimum: null,
    target: 9000,
  });
  assert.equal(optimizer.rules.keepCurrentHeroics, true);
  assert.equal(optimizer.rules.runes.mode, "normal");
  assert.equal(optimizer.rules.artifacts.mode, "sets");
});

test("LLM control persists a named preset and requires explicit replacement", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let presets = [];
  const persistence = {
    loadArmoryState: () => ({ ok: true, data: { profile: { name: "Tank", role: "Tank", server: "AGS" } } }),
    loadArmoryPresets: () => ({ ok: true, data: structuredClone(presets) }),
    saveArmoryPresets: (_storage, next) => { presets = structuredClone(next); },
    saveArmoryState: () => {},
  };
  const base = normalizeLlmBuildRequest(request({ output: { savePresetAs: "Agent Tank" } }), { statOptions, slotOptions, core });
  const result = { name: "Optimized", build: { equipment: {} }, attributes: {} };
  const source = { build: {}, attributes: {}, profile: null };
  persistLlmControlResult(result, base, source, { persistence, storage, gameBuild: "test" });
  assert.equal(presets.length, 1);
  assert.equal(presets[0].name, "Agent Tank");
  assert.throws(() => persistLlmControlResult(result, base, source, { persistence, storage, gameBuild: "test" }), /already exists/);
  const replacement = { ...base, output: { ...base.output, replacePreset: true } };
  persistLlmControlResult(result, replacement, source, { persistence, storage, gameBuild: "test" });
  assert.equal(presets.length, 1);
});

test("LLM control returns a compact, selected-stat result by default", () => {
  const control = normalizeLlmBuildRequest(request(), { statOptions, slotOptions, core });
  const summary = summarizeLlmControlResult({
    name: "Optimized",
    score: 12,
    scoreLabel: "12.000",
    goalResults: [{ rank: 1, id: "pvp_endurance", name: "PvP Endurance", mode: "maximize", value: 3000, formattedValue: "3,000" }],
    allStats: [{ id: "pvp_endurance", name: "PvP Endurance", value: 3000, formattedValue: "3,000" }, { id: "unused", name: "Unused", value: 1, formattedValue: "1" }],
    slots: [{ slotId: "chest", slot: "Chest", current: { name: "Old" }, recommended: { name: "New" }, reason: "Higher priority stats" }],
    setEffects: [{ id: "set-a", count: 2 }],
  }, control, { preset: null, activated: false }, 42);
  assert.equal(summary.ok, true);
  assert.equal(summary.result.selectedStats.length, 1);
  assert.equal(summary.result.equipment[0].recommended, "New");
  assert.equal("fullResult" in summary, false);
});

test("LLM control saves and immediately syncs a completed preset to the targeted account", async () => {
  let presets = [];
  let synced = null;
  const persistence = {
    loadArmoryState: () => ({ ok: true, data: { profile: { name: "Tank", role: "Tank", server: "AGS" } } }),
    loadArmoryPresets: () => ({ ok: true, data: structuredClone(presets) }),
    saveArmoryPresets: (_storage, next) => { presets = structuredClone(next); },
    saveArmoryState: () => {},
  };
  const adapter = {
    listStats: async () => statOptions,
    loadArmoryBuild: async () => ({ build: { equipment: {} }, attributes: {}, sourceKind: "armory", name: "Current" }),
  };
  const response = await executeLlmBuildControl(request({
    account: { mode: "signed_in", expectedName: "noxytree", syncPreset: true },
    output: { savePresetAs: "Account Tank" },
  }), {
    adapter,
    core: { ...core, data: { gameBuild: "g1" }, EQUIPMENT_SLOTS: slotOptions },
    persistence,
    storage: {},
    accountResolver: async () => ({ client: { marker: true }, user: { id: "u1" }, name: "noxytree", aliases: ["noxytree"] }),
    optimizerRunner: async () => ({
      name: "Optimized",
      score: 1,
      build: { equipment: {} },
      attributes: {},
      goalResults: [{ rank: 1, id: "pvp_endurance", name: "PvP Endurance", mode: "maximize", value: 1, formattedValue: "1" }],
      allStats: [{ id: "pvp_endurance", name: "PvP Endurance", value: 1, formattedValue: "1" }],
      slots: [],
    }),
    presetSyncer: async (client, preset, options) => { synced = { client, preset, options }; return { ok: true, action: "created" }; },
  });
  assert.equal(presets.length, 1);
  assert.equal(synced.preset.name, "Account Tank");
  assert.equal(synced.options.userId, "u1");
  assert.deepEqual(response.persistence.account, { name: "noxytree", synced: true, action: "created" });
  assert.equal("presetDocument" in response.persistence, false);
});

test("the shipped example validates against the live game-data stat catalogue", async () => {
  const data = await loadWebDataFromFile(fileURLToPath(new URL("../../web/data/app-data.json", import.meta.url)));
  await realCore.initCore(data);
  const adapter = await createOptimizerAdapter({ core: realCore, storage: { getItem: () => null, setItem: () => {} } });
  const stats = await adapter.listStats();
  const slots = realCore.EQUIPMENT_SLOTS.map((row) => ({ id: row.id, name: row.label }));
  const normalized = normalizeLlmBuildRequest(DEFAULT_LLM_BUILD_REQUEST, { statOptions: stats, slotOptions: slots, core: realCore });
  assert.equal(normalized.goals.length, 7);
  assert.equal(normalized.goals.find((goal) => goal.name === "Weaken Chance")?.displayValue, 2000);
  assert.equal(normalized.goals.find((goal) => goal.name === "Buff Duration")?.rawValue, 9000);
});
