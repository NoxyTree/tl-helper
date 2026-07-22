// Shared preset naming and row metadata for the Armory "My Builds" list and
// the optimizer save flows. Two invariants: no save path may produce a name
// that collides with an existing preset, and every list row carries enough
// context (date, weapons, heroics, key stats, origin) to identify a build
// without loading it. `core` is injected so node tests can stub it.

const WEAPON_SHORT = {
  sword: "SNS",
  sword2h: "GS",
  dagger: "DAG",
  crossbow: "XBOW",
  bow: "BOW",
  staff: "STAFF",
  wand: "WAND",
  orb: "ORB",
  spear: "SPEAR",
};

export const PRESET_ORIGINS = Object.freeze({
  manual: "Manual",
  optimized: "Optimized",
  imported: "Imported",
});

export function weaponComboLabel(core, build, { short = true } = {}) {
  const types = core.equippedWeaponTypes(build ?? {});
  if (!types.length) return "";
  return types
    .map((type) => (short ? WEAPON_SHORT[type] ?? core.label(type).toUpperCase() : core.label(type)))
    .join("/");
}

export function heroicItemNames(core, build) {
  const names = new Set();
  for (const selection of Object.values(build?.equipment ?? {})) {
    const item = core.indexes?.itemById?.[selection?.itemId];
    if (item && item.grade === core.HEROIC_GRADE && item.name) names.add(item.name);
  }
  return [...names];
}

// Legacy presets never stored an origin: a Questlog URL means imported, and
// the optimizer's old constant names mean optimized.
export function presetOrigin(preset) {
  const origin = String(preset?.origin ?? "");
  if (origin in PRESET_ORIGINS) return origin;
  if (preset?.source) return "imported";
  if (preset?.sourceKind === "scratch" || preset?.sourceKind === "existing") return "optimized";
  if (/^optimi[sz]ed (full )?build/i.test(String(preset?.name ?? ""))) return "optimized";
  return "manual";
}

export function presetOriginLabel(preset) {
  return PRESET_ORIGINS[presetOrigin(preset)];
}

export function dateStamp(value) {
  const date = value instanceof Date ? value : new Date(value ?? NaN);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function uniqueName(base, existingNames = []) {
  const cleaned = String(base ?? "").trim() || "Saved build";
  const taken = new Set(existingNames.map((name) => String(name ?? "").trim().toLowerCase()));
  if (!taken.has(cleaned.toLowerCase())) return cleaned;
  for (let suffix = 2; suffix <= existingNames.length + 2; suffix += 1) {
    const candidate = `${cleaned} (${suffix})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${cleaned} (${existingNames.length + 2})`;
}

export function generatePresetName(core, { build, origin = "manual", label = "", date = new Date(), existingNames = [] } = {}) {
  const combo = weaponComboLabel(core, build);
  const kind = String(label ?? "").trim()
    || (origin === "optimized" ? "Optimized" : origin === "imported" ? "Imported" : "Build");
  const day = dateStamp(date);
  const base = [combo, kind].filter(Boolean).join(" ") + (day ? ` — ${day}` : "");
  return uniqueName(base, existingNames);
}

// Key-stat chips for a preset row. Composite ratings use the same
// component-minimum the optimizer and the favourite card report.
export function keyStatChips(core, calc, statIds, limit = 3) {
  return (statIds ?? []).slice(0, limit).map((id) => {
    const composite = core.compositeStatBreakdown?.(calc, id);
    return {
      id,
      name: core.statName(id),
      value: core.formatStat(id, composite ? composite.total : core.statTotal(calc, id)),
    };
  });
}
