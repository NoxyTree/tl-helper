// Structured, scriptable control surface for the full-build optimizer and the
// build-preset lifecycle, so an automation client (or an LLM driving the page)
// can run get-account → optimize → inspect candidates → save/activate without
// operating individual browser controls.
//
// Pure and dependency-injected: the pages construct it with the live core,
// adapter, persistence, and preset-meta modules and expose it on
// window.tlHelper; node tests inject the same modules. Every optimize returns a
// deterministic resultId that saveResult can later persist, so preview and save
// are separate, explicit steps (never an ambiguous auto-save).

const WEAPON_ALIASES = {
  greatsword: "sword2h",
  "2h-sword": "sword2h",
  twohandsword: "sword2h",
  "sword-and-shield": "sword",
  sns: "sword",
  gs: "sword2h",
};

// Deterministic, synchronous string hash (djb2/xor). Good enough for a stable
// reference id keyed on the canonical request + game build; not a security hash.
function stableHash(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createOptimizerApi(deps = {}) {
  const { core, adapter, persistence, presetMeta } = deps;
  const storage = deps.storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  if (!core || !adapter || !persistence || !presetMeta) {
    throw new TypeError("createOptimizerApi requires core, adapter, persistence, and presetMeta.");
  }
  if (!storage) throw new TypeError("createOptimizerApi requires a storage (localStorage) implementation.");
  // The heavy search can run either in-thread on the adapter (default) or,
  // when the page injects a worker-backed runner, parallelised across the
  // worker pool so it never blocks the tab. Lightweight adapter helpers
  // (createScratchBuild / loadArmoryBuild) always run in-thread.
  const runOptimize = typeof deps.runOptimize === "function"
    ? deps.runOptimize
    : (request, runtime) => adapter.optimize(request, runtime);

  const gameBuild = () => core.data?.gameBuild ?? "unversioned";
  const results = new Map(); // resultId -> { result, normalized, savedPresetId }

  const resolveWeapon = (value) => {
    const raw = String(value ?? "").trim().toLowerCase();
    const mapped = WEAPON_ALIASES[raw] ?? raw;
    return (core.WEAPON_TYPES ?? []).includes(mapped) ? mapped : null;
  };

  const heroicPolicyFrom = (heroics = {}) => {
    const itemPolicy = String(heroics.itemPolicy ?? "").toLowerCase();
    const configurationPolicy = String(heroics.configurationPolicy ?? "").toLowerCase();
    if (itemPolicy === "allow_all" || itemPolicy === "replace_any") return "replace_any";
    // itemPolicy "keep": distinguish keeping the exact config from re-optimizing it.
    return configurationPolicy === "optimize" || configurationPolicy === "reoptimize" ? "keep_items" : "keep_config";
  };

  // Canonical validity source, matching the engine's assertKnownOptimizerStatIds:
  // the stat-label table plus the five attributes. statName() label-izes any
  // string, so it cannot be used to validate.
  const knownStatIds = new Set(["str", "dex", "int", "per", "con", ...Object.keys(core.data?.statLabels ?? {})]);

  const normalizeGoals = (goals = []) => {
    const unknown = [];
    const priorities = goals.map((goal, index) => {
      const id = String(goal.stat ?? goal.id ?? "").trim();
      if (!knownStatIds.has(id)) unknown.push(id);
      const mode = goal.mode === "target" ? "target" : goal.mode === "minimum" || goal.mode === "at_least" ? "at_least" : "maximize";
      const raw = mode === "maximize" || goal.value == null ? null : core.statDisplayToRaw(id, Number(goal.value));
      return { id, rank: index + 1, mode, minimum: mode === "at_least" ? raw : null, target: mode === "target" ? raw : null };
    });
    return { priorities, unknown };
  };

  // Translate the public JSON schema into the engine request. `source` is the
  // build the optimizer starts from (current account or a scratch skeleton).
  const buildEngineRequest = (input, source, scratch) => {
    const { priorities, unknown } = normalizeGoals(input.goals);
    const heroicPolicy = heroicPolicyFrom(input.heroics);
    const rules = {
      minimumItemLevel: input.minimumItemLevel ?? (input.endgameOnly ? 50 : 0),
      heroicPolicy,
      keepCurrentHeroics: heroicPolicy === "keep_config",
      reconsiderHeroics: heroicPolicy === "replace_any",
      includeSetEffects: input.includeSetEffects !== false,
      optimizeThreeTraits: true,
      bestHeroicConfiguration: true,
      runes: { mode: input.runes?.mode ?? "keep", chaosOwnershipRequired: true, normalDuplicateCap: 3, chaosDuplicateCap: 1 },
      artifacts: { mode: input.artifacts?.mode ?? "keep" },
    };
    // Set-effect controls: require a set, prefer sets, forbid breaking, or a
    // minimum active-bonus count. Passed through verbatim; the engine treats an
    // empty object as no constraint.
    if (input.sets && typeof input.sets === "object") {
      rules.sets = {
        ...(typeof input.sets.require === "string" && input.sets.require ? { require: input.sets.require } : {}),
        ...(input.sets.prefer === true ? { prefer: true } : {}),
        ...(input.sets.allowBreaking === false ? { allowBreaking: false } : {}),
        ...(Number(input.sets.minimumActiveBonuses) > 0 ? { minimumActiveBonuses: Math.trunc(Number(input.sets.minimumActiveBonuses)) } : {}),
      };
    }
    const request = {
      build: source,
      sourceKind: scratch ? "scratch" : "existing",
      goals: { priorities, protect: Array.isArray(input.protect) ? input.protect : [] },
      lockedSlotIds: Array.isArray(input.lockedSlotIds) ? input.lockedSlotIds : [],
      rules,
      depth: "thorough",
    };
    if (scratch) {
      const weapons = (input.weapons ?? []).map(resolveWeapon).filter(Boolean);
      request.weaponTypes = weapons;
      request.attributePointBudget = Number.isInteger(input.attributePointBudget) ? input.attributePointBudget : 60;
    }
    return { request, unknown, ignored: Array.isArray(input.deprioritize) && input.deprioritize.length ? { deprioritize: input.deprioritize } : null };
  };

  const shapeResultForApi = (result, resultId, extras = {}) => ({
    resultId,
    name: result.name,
    score: result.score,
    equipment: (result.loadout?.equipment ?? []).map((slot) => ({
      slot: slot.id,
      item: slot.name,
      grade: slot.grade,
      selection: slot.selection,
    })),
    goals: (result.goalResults ?? []).map((goal) => ({
      stat: goal.id,
      name: goal.name,
      value: goal.value,
      formattedValue: goal.formattedValue,
      rank: goal.rank,
      minimumMet: goal.minimumMet,
      components: (goal.components ?? []).map((component) => ({ stat: component.id, name: component.name, value: component.value })),
    })),
    setEffects: (result.setEffects?.sets ?? []).map((set) => ({
      name: set.name,
      equippedPieces: set.equippedPieces,
      active: (set.breakpoints ?? []).filter((breakpoint) => breakpoint.active).map((breakpoint) => breakpoint.required),
    })),
    heroicEffects: result.heroicSelectionReport ?? [],
    assumptions: result.assumptions ?? [],
    explanations: result.explanations ?? [],
    ...extras,
  });

  const loadPresets = () => {
    const loaded = persistence.loadArmoryPresets(storage, { currentGameBuild: gameBuild() });
    return loaded.ok ? loaded.data : [];
  };
  const savePresets = (presets) => persistence.saveArmoryPresets(storage, presets, { gameBuild: gameBuild() });

  const presetSummary = (preset) => {
    const summary = {
      id: preset.id,
      name: preset.name,
      origin: presetMeta.presetOrigin(preset),
      createdAt: preset.createdAt ?? null,
      weapons: presetMeta.weaponComboLabel(core, preset.build, { short: false }),
      heroics: presetMeta.heroicItemNames(core, preset.build),
    };
    try {
      const calc = core.calculateBuild(preset.build, preset.attributes ?? {}, { includeSetEffects: true });
      summary.keyStats = presetMeta.keyStatChips(core, calc, preset.favoriteStatIds ?? [], 6).map((chip) => ({ stat: chip.id, name: chip.name, value: chip.value }));
    } catch { summary.keyStats = []; }
    return summary;
  };

  const api = {
    async getAccount() {
      const source = await adapter.loadArmoryBuild();
      if (!source) return { signedIn: false, build: null };
      return {
        profile: source.profile ?? null,
        attributes: source.attributes ?? {},
        weapons: core.equippedWeaponTypes(source.build).map((id) => ({ id, name: core.label(id) })),
        favoriteStatIds: source.favoriteStatIds ?? [],
      };
    },

    async listPresets() {
      return loadPresets().map(presetSummary);
    },

    // Valid ids for rules.sets.require, plus piece counts, for discovery.
    async listSets() {
      const members = (set) => {
        const made = set.itemSetMadeOfItems;
        return Array.isArray(made) ? made.length : Object.keys(made ?? {}).length;
      };
      return (core.data?.itemSets ?? [])
        .map((set) => ({ id: set.id, name: set.name, pieces: members(set) }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    },

    async getPreset(id) {
      const preset = loadPresets().find((row) => row.id === id);
      if (!preset) throw new Error(`No preset with id ${id}.`);
      return { ...presetSummary(preset), build: preset.build, attributes: preset.attributes ?? {} };
    },

    async renamePreset(id, name) {
      const presets = loadPresets();
      const target = presets.find((row) => row.id === id);
      if (!target) throw new Error(`No preset with id ${id}.`);
      const clean = String(name ?? "").trim();
      if (!clean) throw new Error("A preset name cannot be empty.");
      const others = presets.filter((row) => row.id !== id).map((row) => row.name);
      const unique = presetMeta.uniqueName(clean, others);
      savePresets(presets.map((row) => (row.id === id ? { ...row, name: unique } : row)));
      return { id, name: unique, renamed: unique !== clean ? "A duplicate name was disambiguated." : null };
    },

    async deletePreset(id, options = {}) {
      if (options.confirm !== true) throw new Error("deletePreset requires { confirm: true } — deletion is irreversible.");
      const presets = loadPresets();
      if (!presets.some((row) => row.id === id)) throw new Error(`No preset with id ${id}.`);
      savePresets(presets.filter((row) => row.id !== id));
      return { id, deleted: true };
    },

    // Run the optimizer. Same code path whether preview or save-intent — the
    // result is cached under a deterministic id; nothing is persisted here.
    async optimize(input = {}, runtime = {}) {
      const scratch = Array.isArray(input.weapons) && input.weapons.length > 0 && input.sourceKind !== "existing";
      let source;
      if (scratch) {
        source = await adapter.createScratchBuild({ attributes: input.attributes ?? {} });
      } else {
        source = input.build ?? (await adapter.loadArmoryBuild());
        if (!source) throw new Error("No source build: provide weapons for a scratch build or sign in / pass a build.");
      }
      const { request, unknown, ignored } = buildEngineRequest(input, source, scratch);
      if (unknown.length) throw new Error(`Unknown goal stat id(s): ${unknown.join(", ")}.`);
      // The source build is part of the identity: two different account states
      // with identical goals/rules must not collide on one resultId (which would
      // let a stale id save the wrong optimization). Scratch skeletons are
      // deterministic, so this stays stable for identical scratch requests.
      const resultId = stableHash({
        request: { ...request, build: undefined },
        weapons: request.weaponTypes ?? null,
        source: { equipment: source?.build?.equipment ?? source?.equipment ?? null, attributes: source?.attributes ?? null },
        gameBuild: gameBuild(),
      });
      const result = await runOptimize(request, runtime);
      results.set(resultId, { result, normalized: request, savedPresetId: null });
      return shapeResultForApi(result, resultId, ignored ? { ignored } : {});
    },

    async preview(input = {}, runtime = {}) {
      return api.optimize(input, runtime);
    },

    // Pareto/tradeoff candidates retained from a prior optimize, keyed by the
    // ranked-goal vector, so a client can pick a specific tradeoff before saving.
    async getCandidates(resultId) {
      const entry = results.get(resultId);
      if (!entry) throw new Error(`No cached result ${resultId}. Run optimize first.`);
      const goalIds = (entry.result.goalResults ?? []).map((goal) => goal.id);
      return (entry.result.tuningFrontier ?? []).map((candidate) => ({
        candidateId: candidate.id,
        score: candidate.score,
        goals: goalIds.map((id) => ({ stat: id, name: core.statName(id), value: candidate.goalValues?.[id] ?? 0, formattedValue: core.formatStat(id, candidate.goalValues?.[id] ?? 0) })),
      }));
    },

    async saveResult(resultId, options = {}) {
      const entry = results.get(resultId);
      if (!entry) throw new Error(`No cached result ${resultId}. Run optimize first.`);
      const presets = loadPresets();
      const snapshot = {
        profile: { name: entry.result.name ?? "Optimized build", role: "Adventurer", server: "" },
        attributes: entry.result.optimizedAttributes ?? entry.result.attributes ?? {},
        favoriteStatIds: (entry.result.goalResults ?? []).map((goal) => goal.id),
        build: core.deepClone(entry.result.build),
        origin: "optimized",
      };
      if (options.replacePresetId) {
        const index = presets.findIndex((row) => row.id === options.replacePresetId);
        if (index < 0) throw new Error(`No preset with id ${options.replacePresetId} to replace.`);
        const name = presetMeta.uniqueName(String(options.name ?? presets[index].name).trim(), presets.filter((row) => row.id !== options.replacePresetId).map((row) => row.name));
        presets[index] = { ...snapshot, id: options.replacePresetId, name, createdAt: presets[index].createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() };
        savePresets(presets);
        entry.savedPresetId = options.replacePresetId;
        return { id: options.replacePresetId, name, replaced: true };
      }
      const name = presetMeta.uniqueName(
        String(options.name ?? "").trim() || presetMeta.generatePresetName(core, { build: snapshot.build, origin: "optimized", existingNames: presets.map((row) => row.name) }),
        presets.map((row) => row.name),
      );
      const id = `preset-${stableHash({ resultId, name, count: presets.length })}`;
      const preset = { ...snapshot, id, name, createdAt: new Date().toISOString() };
      savePresets([...presets, preset]);
      entry.savedPresetId = id;
      return { id, name, saved: true };
    },

    // Make a preset the live Armory build, backing up the replaced build so the
    // Armory's Restore control can undo it.
    async activatePreset(id) {
      const preset = loadPresets().find((row) => row.id === id);
      if (!preset) throw new Error(`No preset with id ${id}.`);
      // Returns false when there was no prior build to snapshot (fresh account),
      // in which case there is genuinely nothing to restore.
      const undoAvailable = persistence.backupArmoryStateForUndo(storage) !== false;
      persistence.saveArmoryState(storage, {
        profile: preset.profile ?? { name: preset.name, role: "Adventurer", server: "" },
        attributes: preset.attributes ?? {},
        favoriteStatIds: preset.favoriteStatIds ?? [],
        build: preset.build,
      }, { gameBuild: gameBuild() });
      return { id, activated: true, undoAvailable };
    },
  };

  return api;
}
