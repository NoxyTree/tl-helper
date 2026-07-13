// Bounded, deterministic candidate generation for the full-build optimizer.
// The caller supplies scoring functions so this module stays independent of UI
// state while returning selections that calculateBuild already understands.

const ARTIFACT_SLOT_TYPES = ["talistone1", "talistone2", "talistone3", "talistone4", "gemstone1", "gemstone2"];

function stableScore(score, tie) {
  const value = Number(score);
  return { value: Number.isFinite(value) ? value : 0, tie };
}

function ranked(rows, limit) {
  return rows.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, limit);
}

function runeOptions(rune) {
  return Object.entries(rune.itemStats ?? {})
    .filter(([name, rows]) => name.startsWith("random_stat_group") && Array.isArray(rows))
    .flatMap(([, rows]) => rows)
    .map((row) => {
      const maxLevel = Math.max(1, Number(row.max_level ?? (row.levels?.length ?? 1) - 1));
      return { statId: row.stat_id, level: maxLevel, value: Number(row.levels?.[maxLevel] ?? row.base_value ?? 0) };
    });
}

function chaosAllowed(rune, policy) {
  if (rune.runeType !== "chaos") return true;
  if (policy.mode === "all") return true;
  if (policy.mode === "owned") return policy.ownedIds.has(rune.id);
  return false;
}

function expandChaos(types, index = 0) {
  if (index === types.length) return [types];
  if (types[index] !== "chaos") return expandChaos(types, index + 1);
  return ["attack", "defense", "assist"].flatMap((type) => {
    const copy = [...types];
    copy[index] = type;
    return expandChaos(copy, index + 1);
  });
}

function matchingSynergy(synergies, category, types) {
  const rows = synergies.filter((row) => row.equipmentCategory === category);
  for (const expanded of expandChaos(types)) {
    const found = rows.find((row) => (row.combination ?? []).join("|") === expanded.join("|"));
    if (found) return found;
  }
  return null;
}

/**
 * Generates legal three-rune socket configurations for one equipment item.
 * Normal rune IDs and stats may repeat. At most one Chaos rune is emitted.
 */
export function generateRuneCandidates({
  category,
  runes,
  runeSynergies = [],
  scoreStat = () => 0,
  allowStat = () => true,
  scoreSynergy = (synergy) => Object.entries(synergy?.stats ?? {}).reduce((sum, [id, value]) => sum + scoreStat(id, value), 0),
  chaos = { mode: "none", ownedIds: [] },
  variantsPerType = 8,
  limit = 64,
} = {}) {
  const policy = { mode: chaos.mode ?? "none", ownedIds: new Set(chaos.ownedIds ?? []) };
  const variants = [];
  for (const rune of runes ?? []) {
    if (rune.equipmentCategory !== category || !chaosAllowed(rune, policy)) continue;
    for (const option of runeOptions(rune).filter((row) => allowStat(row.statId))) {
      const key = `${rune.runeType}|${rune.id}|${option.statId}|${option.level}`;
      variants.push({ rune, option, key, score: stableScore(scoreStat(option.statId, option.value), key).value });
    }
  }
  const byType = Object.groupBy ? Object.groupBy(variants, (row) => row.rune.runeType) : variants.reduce((map, row) => {
    (map[row.rune.runeType] ??= []).push(row); return map;
  }, {});
  for (const type of Object.keys(byType)) byType[type] = ranked(byType[type], variantsPerType);
  const pool = Object.values(byType).flat();
  const candidates = [];
  for (const first of pool) for (const second of pool) for (const third of pool) {
    const rows = [first, second, third];
    if (rows.filter((row) => row.rune.runeType === "chaos").length > 1) continue;
    const synergy = matchingSynergy(runeSynergies, category, rows.map((row) => row.rune.runeType));
    const selection = rows.map(({ rune, option }) => ({ runeId: rune.id, statId: option.statId, level: option.level }));
    const key = selection.map((row) => `${row.runeId}:${row.statId}:${row.level}`).join("|");
    candidates.push({
      selection,
      synergy,
      score: rows.reduce((sum, row) => sum + row.score, 0) + Number(scoreSynergy(synergy) || 0),
      key,
      assumptions: ["Three rune sockets", "Normal rune selections may repeat", `Chaos availability: ${policy.mode}`, "At most one Chaos rune per item"],
      explanation: synergy ? `Activates ${synergy.name}` : "No matching rune synergy",
    });
  }
  return ranked(candidates, limit);
}

function maxItemLevel(item) {
  return Math.max(0, ...Object.keys(item.itemStats?.main ?? {}), ...Object.keys(item.itemStats?.extra ?? {}).map(Number));
}

function artifactSelection(item, scoreStat) {
  const inherent = item.itemStats?.artifact?.[0] ?? item.itemStats?.artifact?.["0"] ?? {};
  const artifactStatId = Object.entries(inherent).sort((a, b) => scoreStat(b[0], b[1]) - scoreStat(a[0], a[1]) || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
  return { itemId: item.id, level: maxItemLevel(item), artifactStatId, traits: [], resonance: [], runes: [] };
}

function artifactSetState(selections, artifactSets) {
  const ids = new Set(Object.values(selections).map((row) => row.itemId));
  return artifactSets.map((set) => {
    const count = (set.memberItemIds ?? []).filter((id) => ids.has(id)).length;
    const activeThresholds = (set.bonuses ?? []).filter((bonus) => count >= Number(bonus.set_count));
    return { setId: set.id, name: set.name, count, activeThresholds };
  }).filter((row) => row.count).sort((a, b) => a.setId.localeCompare(b.setId));
}

/** Generates bounded artifact loadouts while always retaining complete sets. */
export function generateArtifactCandidates({
  items,
  artifactSets = [],
  scoreItem = () => 0,
  scoreStat = () => 0,
  perSlot = 6,
  beamWidth = 96,
  limit = 48,
} = {}) {
  const artifacts = (items ?? []).filter((item) => ARTIFACT_SLOT_TYPES.includes(item.equipmentType));
  const byId = new Map(artifacts.map((item) => [item.id, item]));
  const slots = Object.fromEntries(ARTIFACT_SLOT_TYPES.map((type) => [type, ranked(
    artifacts.filter((item) => item.equipmentType === type).map((item) => ({ item, key: item.id, score: Number(scoreItem(item) || 0) })),
    perSlot,
  )]));
  let beam = [{ selections: {}, score: 0, key: "" }];
  for (const slot of ARTIFACT_SLOT_TYPES) {
    beam = ranked(beam.flatMap((state) => slots[slot].map(({ item, score }) => ({
      selections: { ...state.selections, [slot]: artifactSelection(item, scoreStat) },
      score: state.score + score,
      key: `${state.key}|${item.id}`,
    }))), beamWidth);
  }
  const completeSets = [];
  for (const set of artifactSets) {
    const members = (set.memberItemIds ?? []).map((id) => byId.get(id)).filter(Boolean);
    if (members.length !== ARTIFACT_SLOT_TYPES.length || new Set(members.map((item) => item.equipmentType)).size !== ARTIFACT_SLOT_TYPES.length) continue;
    const selections = Object.fromEntries(members.map((item) => [item.equipmentType, artifactSelection(item, scoreStat)]));
    completeSets.push({ selections, score: members.reduce((sum, item) => sum + Number(scoreItem(item) || 0), 0), key: `set:${set.id}` });
  }
  const deduped = new Map([...beam, ...completeSets].map((row) => [Object.values(row.selections).map((x) => x.itemId).join("|"), row]));
  const candidates = [...deduped.values()].map((row) => {
    const setState = artifactSetState(row.selections, artifactSets);
    return {
      ...row,
      setState,
      assumptions: ["Six artifact slots", "Complete artifact sets are retained before pruning", "All 2/4/6 thresholds are preserved, including unscored passives"],
      explanation: setState.map((set) => `${set.name} ${set.count}/6`).join(", ") || "Mixed artifact loadout",
    };
  });
  // Complete sets are structural search seeds, not ordinary low-scoring rows.
  // Keep one candidate for every complete set before spending the remaining
  // bound on mixed loadouts. This prevents an individually weak set from being
  // pruned before its 2/4/6 bonuses can be evaluated by calculateBuild.
  const requiredSets = candidates.filter((row) => row.key.startsWith("set:")).sort((a, b) => a.key.localeCompare(b.key));
  const mixed = ranked(candidates.filter((row) => !row.key.startsWith("set:")), Math.max(0, limit - requiredSets.length));
  return [...requiredSets, ...mixed];
}

export { ARTIFACT_SLOT_TYPES };
