import * as coreDefault from "./tl-core.js";
import { loadArmoryState as loadStateDefault } from "./tl-persistence.js";
import { optimizeHeroicPotential } from "./tl-heroic-potential.js";
import { generateArtifactCandidates, generateRuneCandidates } from "./tl-optimizer-components.js";
import { optimizeFullBuild } from "./tl-full-build-optimizer.js";

const clone = (value) => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const totalMap = (calc) => Object.fromEntries((calc?.stats ?? []).map((row) => [row.id, Number(row.total) || 0]));
const scoreStats = (stats, goals) => (goals.increase ?? []).reduce((sum, id) => sum + Number(stats[id] ?? 0), 0);
const selectionFor = (build, slot) => build.equipment?.[slot] ?? build.artifacts?.[slot] ?? build.supportSlots?.[slot];
const collectionFor = (build, slot) => slot.startsWith("talistone") || slot.startsWith("gemstone") ? build.artifacts : build.equipment;

function equippedChaosIds(build, runeById) {
  const ids = new Set();
  for (const group of [build.equipment, build.artifacts, build.supportSlots]) for (const row of Object.values(group ?? {})) {
    for (const rune of row?.runes ?? []) if (runeById[rune.runeId]?.runeType === "chaos") ids.add(rune.runeId);
  }
  return [...ids];
}

function applySelections(source, selections) {
  const build = clone(source);
  for (const [slot, selection] of Object.entries(selections)) {
    if (slot === "artifact_bundle") {
      for (const [artifactSlot, row] of Object.entries(selection.selections ?? {})) build.artifacts[artifactSlot] = clone(row);
    } else collectionFor(build, slot)[slot] = clone(selection);
  }
  return build;
}

function itemSelection(core, item) {
  return { ...core.emptyEquipmentSelection(), itemId: item.id, level: core.itemMaxLevel(item) };
}

function optimizedNormalTraits(item, goals) {
  return Object.entries(item.itemStats?.traits ?? {}).map(([statId, tiers]) => {
    const values = Array.isArray(tiers) ? tiers : Object.values(tiers ?? {});
    return { statId, tier: Math.max(1, values.length), value: Number(values.at(-1) ?? 0) };
  }).sort((a, b) => (goals.increase.includes(b.statId) ? b.value : 0) - (goals.increase.includes(a.statId) ? a.value : 0) || a.statId.localeCompare(b.statId)).slice(0, 3).map(({ statId, tier }) => ({ statId, tier }));
}

function itemName(core, selection) {
  return core.indexes.itemById[selection?.itemId]?.name ?? "Empty";
}

/** Browser adapter. Dependencies are injectable to keep the boundary testable. */
export async function createOptimizerAdapter(deps = {}) {
  const core = deps.core ?? coreDefault;
  const storage = deps.storage ?? globalThis.localStorage;
  const fetcher = deps.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!core.data) await core.initCore(deps.dataSource ?? "./data/app-data.json");

  const wrap = (payload, attributes = {}) => ({ build: payload.build ?? payload, attributes: payload.attributes ?? attributes, name: payload.build?.name ?? payload.name });
  const calculate = (wrapped, includeSetEffects = true) => core.calculateBuild(wrapped.build, wrapped.attributes ?? {}, { includeSetEffects });

  return {
    async loadArmoryBuild() {
      const loaded = (deps.loadArmoryState ?? loadStateDefault)(storage, { currentGameBuild: core.data.gameBuild });
      if (!loaded?.ok) return null;
      return wrap(loaded.data);
    },

    async importQuestlogBuild(url) {
      if (!fetcher) throw new Error("Questlog import requires fetch support.");
      const response = await fetcher(`/api/questlog/character?url=${encodeURIComponent(url)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? `Questlog import failed (${response.status}).`);
      const requested = payload.buildId == null ? null : String(payload.buildId);
      const raw = (payload.characterData?.builds ?? []).find((row) => requested == null || String(row.id) === requested);
      if (!raw) throw new Error("Questlog returned no matching build.");
      const build = { ...raw, equipment: Object.fromEntries(Object.entries(raw.equipment ?? {}).map(([id, row]) => [id, row ? { ...row, itemLevel: row.itemLevel ?? row.enhLvl } : row])) };
      const skillBuild = payload.skillData?.builds?.find((row) => String(row.id) === String(build.skillBuildId));
      const masteryBuild = payload.masteryData?.builds?.find((row) => String(row.id) === String(build.weaponSpecializationBuildId));
      return wrap(core.importQuestlogBuild({ characterData: payload.characterData, build, skillBuild, masteryBuild }));
    },

    async listStats() {
      return Object.keys(core.data.statLabels ?? {}).map((id) => ({ id, name: core.statName(id) })).sort((a, b) => a.name.localeCompare(b.name));
    },

    async optimize(request, runtime = {}) {
      const source = wrap(request.build);
      const rules = request.rules ?? {};
      const goals = request.goals ?? { increase: [], protect: [] };
      const baseline = totalMap(calculate(source, rules.includeSetEffects !== false));
      const slots = core.EQUIPMENT_SLOTS.map((row) => row.id);
      const lockedIndexes = new Set(request.locks ?? []);
      const candidatesBySlot = {};
      const cap = request.depth === "thorough" ? 18 : 8;
      const contribution = (slot, selection) => core.slotSelectionContribution(slot, selection, source.build, source.attributes, { includeSetEffects: false });
      const weight = (stats) => scoreStats(stats, goals);
      const chaosOwned = equippedChaosIds(source.build, core.indexes.runeById);
      const candidateMeta = (slot, item) => ({
        heroicGroup: item?.grade === core.HEROIC_GRADE ? core.heroicSlotGroupForSlot(slot) : "",
        weaponType: core.WEAPON_SLOTS.includes(slot) ? item?.equipmentType ?? "" : "",
        setKeys: item?.setId ? [item.setId] : [],
      });
      const runeCandidatesByCategory = new Map();

      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const slot = slots[slotIndex];
        const current = selectionFor(source.build, slot);
        const currentItem = core.indexes.itemById[current?.itemId];
        const keepCurrentHeroic = rules.keepCurrentHeroics && !rules.reconsiderHeroics && currentItem?.grade === core.HEROIC_GRADE;
        if (lockedIndexes.has(slotIndex) || keepCurrentHeroic) {
          candidatesBySlot[slot] = [{ id: current.itemId || `empty:${slot}`, selection: clone(current), stats: contribution(slot, current), locked: true, ...candidateMeta(slot, currentItem) }];
          continue;
        }
        const rows = [];
        for (const item of core.slotItems(core.slotById(slot))) {
          let selection = itemSelection(core, item);
          if (rules.optimizeThreeTraits && item.grade !== core.HEROIC_GRADE) selection.traits = optimizedNormalTraits(item, goals);
          if (rules.keepCurrentHeroics && !rules.reconsiderHeroics && item.grade === core.HEROIC_GRADE && item.id !== current?.itemId) continue;
          if (rules.bestHeroicConfiguration && item.grade === core.HEROIC_GRADE) {
            selection = { ...selection, ...optimizeHeroicPotential(item, { frontierLimit: 4, evaluate: (candidate) => weight(contribution(slot, { ...selection, ...candidate })) }).selection };
          }
          if (rules.runes?.mode === "keep") selection.runes = clone(current?.runes ?? []);
          else if (rules.runes?.mode && rules.runes.mode !== "keep") {
            const category = core.runeCategoryForSlot(slot);
            const chaosMode = rules.runes.mode === "normal" ? "none" : rules.runes.allowUnownedChaos ? "all" : "owned";
            let runeRows = runeCandidatesByCategory.get(category);
            if (!runeRows) {
              runeRows = generateRuneCandidates({ category, runes: core.data.runes, runeSynergies: core.data.runeSynergies, chaos: { mode: chaosMode, ownedIds: chaosOwned }, scoreStat: (id, value) => goals.increase.includes(id) ? value : 0, limit: 4 });
              runeCandidatesByCategory.set(category, runeRows);
            }
            if (runeRows[0]) selection.runes = runeRows[0].selection;
          }
          const stats = contribution(slot, selection);
          rows.push({ id: item.id, selection, stats, scoreHint: weight(stats), ...candidateMeta(slot, item) });
        }
        const currentRow = { id: current?.itemId || `empty:${slot}`, selection: clone(current), stats: contribution(slot, current), scoreHint: weight(contribution(slot, current)), ...candidateMeta(slot, currentItem) };
        const ranked = rows.sort((a, b) => b.scoreHint - a.scoreHint || a.id.localeCompare(b.id));
        const retained = [...ranked.slice(0, cap), ...ranked.filter((row) => row.setKeys.length || row.heroicGroup)];
        candidatesBySlot[slot] = [currentRow, ...retained].filter((row, index, all) => all.findIndex((x) => x.id === row.id) === index);
      }

      if (rules.artifacts?.mode && rules.artifacts.mode !== "keep") {
        const bundles = generateArtifactCandidates({ items: core.data.items, artifactSets: core.data.artifactSets, scoreItem: (item) => weight(core.itemStatContribution(item, item.equipmentType, core.itemMaxLevel(item), source.build, source.attributes)), scoreStat: (id, value) => goals.increase.includes(id) ? value : 0, limit: request.depth === "thorough" ? 32 : 12 });
        candidatesBySlot.artifact_bundle = bundles.map((row) => ({ id: row.key, selection: row, scoreHint: row.score, stateKeys: row.setState.map((set) => `${set.setId}:${set.count}`) }));
        slots.push("artifact_bundle");
      }

      const protectedStats = Object.fromEntries((goals.protect ?? []).map((id) => [id, { baseline: baseline[id] ?? 0, allowedLossPercent: Number(request.protectTolerancePct ?? 0) }]));
      const search = await optimizeFullBuild({ candidatesBySlot, slotOrder: slots, evaluate: (selections) => {
        const build = applySelections(source.build, selections);
        const stats = totalMap(core.calculateBuild(build, source.attributes, { includeSetEffects: rules.includeSetEffects !== false }));
        const normalized = (goals.increase ?? []).reduce((sum, id) => sum + ((stats[id] ?? 0) - (baseline[id] ?? 0)) / Math.max(1, Math.abs(baseline[id] ?? 0)), 0);
        return { score: normalized, stats, build };
      }, lockedSlots: {}, heroicCaps: { weapon: 1, armor: 1, accessory: 1 }, distinctWeaponTypes: true, weights: Object.fromEntries((goals.increase ?? []).map((id) => [id, 1])), protectedStats, beamWidth: request.depth === "thorough" ? 1000 : 300, alternativeCount: 4, signal: runtime.signal, onProgress: (row) => runtime.onProgress?.({ percent: row.phase === "search" ? 5 + 45 * row.completedSlots / row.totalSlots : 50 + 50 * row.completed / row.total, label: row.phase === "search" ? "Searching legal loadouts" : "Calculating finalists", detail: `${row.searched ?? row.completed ?? 0} combinations processed` }) });
      if (!search.best) throw new Error("No build satisfies the protected-stat constraints.");
      const best = search.best;
      const finalStats = best.evaluation.stats;
      const outputSlots = core.EQUIPMENT_SLOTS.map(({ id, label }) => ({ slot: label, current: { name: itemName(core, selectionFor(source.build, id)) }, recommended: { name: itemName(core, best.selections[id]) }, reason: best.selections[id]?.itemId === selectionFor(source.build, id)?.itemId ? "Kept" : "Improves the selected build goals" }));
      return {
        name: "Optimized full build", score: best.evaluation.score, scoreLabel: best.evaluation.score.toFixed(3), slots: outputSlots,
        statDeltas: [...new Set([...(goals.increase ?? []), ...(goals.protect ?? [])])].map((id) => ({ id, name: core.statName(id), delta: (finalStats[id] ?? 0) - (baseline[id] ?? 0) })),
        explanations: ["Finalists were recalculated through the complete build calculator.", rules.includeSetEffects === false ? "Set effects were excluded." : "Known set effects were included."],
        assumptions: ["Exactly three normal rune sockets are considered; normal rune rows may repeat.", "No more than one Chaos rune is used per item."],
        warnings: ["This is a bounded search, so the result is the best loadout found rather than proof of the mathematical global optimum.", ...(rules.runes?.mode === "chaos" && !rules.runes.allowUnownedChaos ? [`Chaos suggestions are restricted to ${chaosOwned.length} equipped-owned rune ID(s).`] : [])],
        alternatives: search.alternatives.slice(1).map((row, index) => ({ name: `Alternative ${index + 1}`, summary: `Fit ${row.evaluation.score.toFixed(3)}`, score: row.evaluation.score })),
        build: best.evaluation.build,
      };
    },
  };
}

export default createOptimizerAdapter;
