import {
  loadArmoryPresets,
  loadArmoryState,
  saveArmoryPresets,
  saveArmoryState,
} from "./tl-persistence.js";
import { getSession, getSupabaseClient } from "./tl-supabase.js";
import { syncPresetToAccount } from "./tl-sync.js";

export const LLM_BUILD_CONTROL_VERSION = 1;

export const DEFAULT_LLM_BUILD_REQUEST = Object.freeze({
  version: LLM_BUILD_CONTROL_VERSION,
  operation: "optimize",
  source: { kind: "armory" },
  account: { mode: "signed_in", expectedName: "noxytree", syncPreset: true },
  goals: [
    { stat: "PvP Endurance", mode: "maximize" },
    { stat: "PvP Magic Heavy Attack Evasion", mode: "maximize" },
    { stat: "PvP Melee Hit Chance", mode: "maximize" },
    { stat: "Weaken Chance", mode: "target", value: 2000 },
    { stat: "Cooldown Speed", mode: "maximize" },
    { stat: "Buff Duration", mode: "target", value: 90 },
    { stat: "Collision Chance", mode: "target", value: 1500 },
  ],
  protect: [],
  locks: { keepHeroics: true, slots: [] },
  rules: {
    minimumItemLevel: 50,
    includeSetEffects: true,
    traits: "optimize",
    runes: "normal",
    artifacts: "sets",
  },
  search: { depth: "refine" },
  output: {
    savePresetAs: "SNS/GS Tank - 3 Heroics + Weaken",
    replacePreset: true,
    activateInArmory: false,
    includeFullResult: false,
  },
});

const SOURCE_KINDS = new Set(["armory", "preset", "questlog"]);
const ACCOUNT_MODES = new Set(["local", "signed_in"]);
const GOAL_MODES = new Set(["maximize", "at_least", "target"]);
const RUNE_MODES = new Set(["keep", "normal", "chaos"]);
const ARTIFACT_MODES = new Set(["keep", "sets"]);
const SEARCH_DEPTHS = new Set(["preview", "fast", "refine", "thorough"]);

const clone = (value) => globalThis.structuredClone
  ? globalThis.structuredClone(value)
  : JSON.parse(JSON.stringify(value));

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function cleanText(value, label, { required = true, maximum = 160 } = {}) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new TypeError(`${label} is required.`);
  if (text.length > maximum) throw new RangeError(`${label} must be ${maximum} characters or fewer.`);
  return text;
}

function finiteNumber(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number.`);
  if (number < minimum || number > maximum) throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  return number;
}

function booleanValue(value, fallback) {
  return value == null ? fallback : value === true;
}

function lookupRows(rows, label) {
  const exactIds = new Map();
  const exactNames = new Map();
  for (const row of rows ?? []) {
    const id = String(row?.id ?? "").trim();
    const name = String(row?.name ?? row?.label ?? "").trim();
    if (id) exactIds.set(id.toLocaleLowerCase(), row);
    if (name) {
      const key = name.toLocaleLowerCase();
      const matches = exactNames.get(key) ?? [];
      matches.push(row);
      exactNames.set(key, matches);
    }
  }
  return (value) => {
    const query = cleanText(value, label).toLocaleLowerCase();
    const byId = exactIds.get(query);
    if (byId) return byId;
    const byName = exactNames.get(query) ?? [];
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) throw new Error(`${label} "${value}" is ambiguous; use an ID instead.`);
    throw new Error(`Unknown ${label.toLocaleLowerCase()} "${value}".`);
  };
}

export function parseLlmBuildRequest(value) {
  if (typeof value !== "string") return plainObject(clone(value), "Control request");
  try {
    return plainObject(JSON.parse(value), "Control request");
  } catch (error) {
    throw new SyntaxError(`Control request is not valid JSON: ${error.message}`);
  }
}

export function normalizeLlmBuildRequest(input, { statOptions = [], slotOptions = [], core = null } = {}) {
  const request = plainObject(clone(input), "Control request");
  const version = Number(request.version ?? LLM_BUILD_CONTROL_VERSION);
  if (version !== LLM_BUILD_CONTROL_VERSION) {
    throw new RangeError(`Unsupported control request version ${version}. Expected ${LLM_BUILD_CONTROL_VERSION}.`);
  }
  if ((request.operation ?? "optimize") !== "optimize") throw new Error("Only the optimize operation is supported in version 1.");

  const sourceInput = plainObject(request.source ?? { kind: "armory" }, "source");
  const sourceKind = cleanText(sourceInput.kind ?? "armory", "source.kind").toLocaleLowerCase();
  if (!SOURCE_KINDS.has(sourceKind)) throw new Error(`source.kind must be one of: ${[...SOURCE_KINDS].join(", ")}.`);
  const source = { kind: sourceKind };
  if (sourceKind === "preset") source.name = cleanText(sourceInput.name, "source.name");
  if (sourceKind === "questlog") source.url = cleanText(sourceInput.url, "source.url", { maximum: 2048 });

  const accountInput = plainObject(request.account ?? { mode: "local" }, "account");
  const accountMode = cleanText(accountInput.mode ?? "local", "account.mode").toLocaleLowerCase();
  if (!ACCOUNT_MODES.has(accountMode)) throw new Error(`account.mode must be one of: ${[...ACCOUNT_MODES].join(", ")}.`);
  const expectedName = accountInput.expectedName == null || accountInput.expectedName === ""
    ? null
    : cleanText(accountInput.expectedName, "account.expectedName", { maximum: 120 });
  const account = {
    mode: accountMode,
    expectedName,
    syncPreset: booleanValue(accountInput.syncPreset, accountMode === "signed_in"),
  };
  if (account.mode === "local" && account.syncPreset) throw new Error("account.syncPreset requires account.mode to be signed_in.");

  if (!Array.isArray(request.goals) || request.goals.length === 0) throw new Error("goals must contain at least one ranked stat.");
  if (request.goals.length > 32) throw new RangeError("goals can contain at most 32 stats.");
  const resolveStat = lookupRows(statOptions, "Stat");
  const seenStats = new Set();
  const goals = request.goals.map((rawGoal, index) => {
    const row = typeof rawGoal === "string" ? { stat: rawGoal } : plainObject(rawGoal, `goals[${index}]`);
    const stat = resolveStat(row.stat ?? row.id);
    if (seenStats.has(stat.id)) throw new Error(`Stat "${stat.name}" appears more than once in goals.`);
    seenStats.add(stat.id);
    const mode = cleanText(row.mode ?? "maximize", `goals[${index}].mode`).toLocaleLowerCase().replaceAll(" ", "_");
    if (!GOAL_MODES.has(mode)) throw new Error(`goals[${index}].mode must be maximize, at_least, or target.`);
    let displayValue = null;
    let rawValue = null;
    if (mode !== "maximize") {
      displayValue = finiteNumber(row.value, `goals[${index}].value`);
      rawValue = typeof core?.statDisplayToRaw === "function" ? core.statDisplayToRaw(stat.id, displayValue) : displayValue;
      if (!Number.isFinite(Number(rawValue))) throw new Error(`Could not convert the value for ${stat.name}.`);
    }
    return {
      id: stat.id,
      name: stat.name,
      rank: index + 1,
      mode,
      displayValue,
      rawValue: rawValue == null ? null : Number(rawValue),
    };
  });

  const protectInput = request.protect ?? [];
  if (!Array.isArray(protectInput)) throw new TypeError("protect must be an array of stat names or IDs.");
  const protect = [];
  for (const raw of protectInput) {
    const stat = resolveStat(typeof raw === "string" ? raw : raw?.stat ?? raw?.id);
    if (!protect.includes(stat.id)) protect.push(stat.id);
  }

  const locksInput = plainObject(request.locks ?? {}, "locks");
  const resolveSlot = lookupRows(slotOptions, "Equipment slot");
  const slotInputs = locksInput.slots ?? [];
  if (!Array.isArray(slotInputs)) throw new TypeError("locks.slots must be an array of slot names or IDs.");
  const lockedSlotIds = [];
  for (const raw of slotInputs) {
    const slot = resolveSlot(typeof raw === "string" ? raw : raw?.slot ?? raw?.id);
    if (!lockedSlotIds.includes(slot.id)) lockedSlotIds.push(slot.id);
  }

  const rulesInput = plainObject(request.rules ?? {}, "rules");
  const runes = cleanText(rulesInput.runes ?? "normal", "rules.runes").toLocaleLowerCase();
  if (!RUNE_MODES.has(runes)) throw new Error(`rules.runes must be one of: ${[...RUNE_MODES].join(", ")}.`);
  const artifacts = cleanText(rulesInput.artifacts ?? "sets", "rules.artifacts").toLocaleLowerCase();
  if (!ARTIFACT_MODES.has(artifacts)) throw new Error(`rules.artifacts must be one of: ${[...ARTIFACT_MODES].join(", ")}.`);
  const traits = cleanText(rulesInput.traits ?? "optimize", "rules.traits").toLocaleLowerCase();
  if (!new Set(["keep", "optimize"]).has(traits)) throw new Error("rules.traits must be keep or optimize.");

  const searchInput = plainObject(request.search ?? {}, "search");
  const depth = cleanText(searchInput.depth ?? "refine", "search.depth").toLocaleLowerCase();
  if (!SEARCH_DEPTHS.has(depth)) throw new Error(`search.depth must be one of: ${[...SEARCH_DEPTHS].join(", ")}.`);

  const outputInput = plainObject(request.output ?? {}, "output");
  const savePresetAs = outputInput.savePresetAs == null || outputInput.savePresetAs === ""
    ? null
    : cleanText(outputInput.savePresetAs, "output.savePresetAs", { maximum: 100 });
  if (account.syncPreset && !savePresetAs) throw new Error("account.syncPreset requires output.savePresetAs.");

  return {
    version,
    operation: "optimize",
    source,
    account,
    goals,
    protect,
    locks: { keepHeroics: booleanValue(locksInput.keepHeroics, true), slotIds: lockedSlotIds },
    rules: {
      minimumItemLevel: Math.floor(finiteNumber(rulesInput.minimumItemLevel ?? 50, "rules.minimumItemLevel", { maximum: 100 })),
      includeSetEffects: booleanValue(rulesInput.includeSetEffects, true),
      traits,
      runes,
      artifacts,
      allowUnownedChaos: booleanValue(rulesInput.allowUnownedChaos, false),
    },
    search: { depth },
    output: {
      savePresetAs,
      replacePreset: booleanValue(outputInput.replacePreset, false),
      activateInArmory: booleanValue(outputInput.activateInArmory, false),
      includeFullResult: booleanValue(outputInput.includeFullResult, false),
    },
  };
}

export async function loadLlmControlSource(source, { adapter, persistence, storage, gameBuild }) {
  if (source.kind === "armory") {
    const loaded = await adapter.loadArmoryBuild();
    if (!loaded) throw new Error("No Armory build is available in this browser.");
    return loaded;
  }
  if (source.kind === "questlog") return adapter.importQuestlogBuild(source.url);

  const loaded = persistence.loadArmoryPresets(storage, { currentGameBuild: gameBuild });
  if (!loaded.ok) throw new Error("No saved Armory presets are available in this browser.");
  const query = source.name.toLocaleLowerCase();
  const matches = loaded.data.filter((preset) => String(preset?.name ?? "").trim().toLocaleLowerCase() === query || String(preset?.id ?? "").trim().toLocaleLowerCase() === query);
  if (matches.length === 0) throw new Error(`No Armory preset named "${source.name}" was found.`);
  if (matches.length > 1) throw new Error(`More than one Armory preset is named "${source.name}"; use its ID instead.`);
  const preset = matches[0];
  return {
    build: clone(preset.build),
    attributes: clone(preset.attributes ?? {}),
    name: preset.name,
    sourceKind: "armory",
    profile: clone(preset.profile ?? null),
  };
}

export function optimizerRequestFromLlmControl(control, source) {
  return {
    build: source,
    sourceKind: "armory",
    goals: {
      priorities: control.goals.map((goal) => ({
        id: goal.id,
        rank: goal.rank,
        mode: goal.mode,
        minimum: goal.mode === "at_least" ? goal.rawValue : null,
        target: goal.mode === "target" ? goal.rawValue : null,
      })),
      protect: [...control.protect],
    },
    lockedSlotIds: [...control.locks.slotIds],
    rules: {
      minimumItemLevel: control.rules.minimumItemLevel,
      keepCurrentHeroics: control.locks.keepHeroics,
      reconsiderHeroics: !control.locks.keepHeroics,
      includeSetEffects: control.rules.includeSetEffects,
      optimizeThreeTraits: control.rules.traits === "optimize",
      bestHeroicConfiguration: !control.locks.keepHeroics,
      allowUnownedHeroics: false,
      runes: {
        mode: control.rules.runes,
        chaosOwnershipRequired: !control.rules.allowUnownedChaos,
        allowUnownedChaos: control.rules.allowUnownedChaos,
        normalDuplicateCap: 3,
        chaosDuplicateCap: 1,
      },
      artifacts: { mode: control.rules.artifacts },
    },
    depth: control.search.depth,
  };
}

export function runOptimizerWorker(request, {
  WorkerClass = globalThis.Worker,
  signal = null,
  onProgress = null,
  onPreliminary = null,
} = {}) {
  if (typeof WorkerClass !== "function") throw new Error("This browser cannot start the optimizer worker.");
  return new Promise((resolve, reject) => {
    const worker = new WorkerClass(new URL("./tl-builder-worker.js", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener?.("abort", abort);
      worker.terminate();
      callback(value);
    };
    const abort = () => {
      try { worker.postMessage({ type: "cancel" }); } catch { /* worker may already be gone */ }
      finish(reject, new DOMException("Build optimization cancelled", "AbortError"));
    };
    worker.onmessage = (event) => {
      const message = event.data ?? {};
      if (message.type === "progress") onProgress?.(message.progress ?? {});
      else if (message.type === "preliminary") onPreliminary?.(message.result);
      else if (message.type === "result") finish(resolve, message.result);
      else if (message.type === "cancelled") finish(reject, new DOMException("Build optimization cancelled", "AbortError"));
      else if (message.type === "error") finish(reject, new Error(message.message ?? "The optimizer stopped without a result."));
    };
    worker.onerror = (event) => finish(reject, new Error(event.message || "The optimizer worker stopped unexpectedly."));
    if (signal?.aborted) return abort();
    signal?.addEventListener?.("abort", abort, { once: true });
    worker.postMessage({ type: "optimize", request });
  });
}

function accountNames(user) {
  const metadata = user?.user_metadata ?? {};
  return [...new Set([
    metadata.preferred_username,
    metadata.user_name,
    metadata.name,
    metadata.full_name,
    user?.email ? String(user.email).split("@")[0] : null,
  ].map((value) => String(value ?? "").trim()).filter(Boolean))];
}

export async function currentLlmControlAccount() {
  const client = await getSupabaseClient();
  const session = await getSession();
  const user = session?.user ?? null;
  if (!client || !user) return null;
  const names = accountNames(user);
  return { client, user, name: names[0] ?? "Signed-in account", aliases: names };
}

export async function resolveLlmControlAccount(control, accountResolver = currentLlmControlAccount) {
  if (control.account.mode === "local") return null;
  const account = await accountResolver();
  if (!account?.client || !account?.user?.id) throw new Error("This request requires a signed-in TL Helper account.");
  if (control.account.expectedName) {
    const expected = control.account.expectedName.toLocaleLowerCase();
    const aliases = [...new Set([account.name, ...(account.aliases ?? accountNames(account.user))].map((value) => String(value ?? "").trim()).filter(Boolean))];
    if (!aliases.some((value) => value.toLocaleLowerCase() === expected)) {
      throw new Error(`The active account is "${account.name}", not the requested account "${control.account.expectedName}".`);
    }
  }
  return account;
}

function resultSnapshot(result, control, source, { profile = null } = {}) {
  return {
    profile: clone(profile ?? source.profile ?? { name: result.name ?? "Optimized build", role: "Optimized Build", server: "" }),
    attributes: clone(result.optimizedAttributes ?? result.attributes ?? {}),
    favoriteStatIds: control.goals.map((goal) => goal.id),
    build: clone(result.build),
  };
}

function presetId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return `preset-${globalThis.crypto.randomUUID()}`;
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function persistLlmControlResult(result, control, source, { persistence, storage, gameBuild }) {
  if (!control.output.savePresetAs && !control.output.activateInArmory) return { preset: null, activated: false, presetDocument: null };
  const armory = persistence.loadArmoryState(storage, { currentGameBuild: gameBuild });
  const snapshot = resultSnapshot(result, control, source, { profile: armory.ok ? armory.data.profile : null });
  let preset = null;
  let replaced = false;
  if (control.output.savePresetAs) {
    const loaded = persistence.loadArmoryPresets(storage, { currentGameBuild: gameBuild });
    const presets = loaded.ok ? loaded.data : [];
    const query = control.output.savePresetAs.toLocaleLowerCase();
    const existingIndex = presets.findIndex((row) => String(row?.name ?? "").trim().toLocaleLowerCase() === query);
    if (existingIndex >= 0 && !control.output.replacePreset) {
      throw new Error(`A preset named "${control.output.savePresetAs}" already exists. Set output.replacePreset to true to replace it.`);
    }
    const existing = existingIndex >= 0 ? presets[existingIndex] : null;
    replaced = existingIndex >= 0;
    preset = {
      ...snapshot,
      id: existing?.id ?? presetId(),
      name: control.output.savePresetAs,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const next = [...presets];
    if (existingIndex >= 0) next.splice(existingIndex, 1, preset);
    else next.push(preset);
    persistence.saveArmoryPresets(storage, next, { gameBuild });
  }
  if (control.output.activateInArmory) persistence.saveArmoryState(storage, snapshot, { gameBuild });
  return {
    preset: preset ? { id: preset.id, name: preset.name, replaced } : null,
    activated: control.output.activateInArmory,
    presetDocument: preset ? clone(preset) : null,
  };
}

export function summarizeLlmControlResult(result, control, persistenceResult, elapsedMs) {
  const { presetDocument: _presetDocument, ...publicPersistence } = persistenceResult ?? {};
  const goalResults = (result.goalResults ?? []).map((goal) => ({
    rank: goal.rank,
    id: goal.id,
    stat: goal.name,
    mode: goal.mode,
    value: goal.value,
    formattedValue: goal.formattedValue,
    floor: goal.minimum,
    floorMet: goal.minimumMet,
  }));
  const selectedIds = new Set(control.goals.map((goal) => goal.id));
  const selectedStats = (result.allStats ?? []).filter((row) => selectedIds.has(row.id)).map((row) => ({
    id: row.id,
    stat: row.name,
    value: row.value,
    formattedValue: row.formattedValue,
  }));
  return {
    ok: true,
    version: LLM_BUILD_CONTROL_VERSION,
    elapsedMs,
    result: {
      name: result.name,
      score: result.score,
      scoreLabel: result.scoreLabel,
      goals: goalResults,
      selectedStats,
      equipment: (result.slots ?? []).map((row) => ({
        slotId: row.slotId,
        slot: row.slot,
        current: row.current?.name ?? null,
        recommended: row.recommended?.name ?? null,
        reason: row.reason ?? null,
      })),
      setEffects: clone(result.setEffects ?? []),
      tradeoffs: clone(result.tradeoffs ?? []),
      warnings: clone(result.warnings ?? []),
      assumptions: clone(result.assumptions ?? []),
      searchMetrics: clone(result.searchMetrics ?? null),
    },
    persistence: publicPersistence,
    ...(control.output.includeFullResult ? { fullResult: clone(result) } : {}),
  };
}

export async function executeLlmBuildControl(input, {
  adapter,
  core,
  persistence = { loadArmoryPresets, loadArmoryState, saveArmoryPresets, saveArmoryState },
  storage = globalThis.localStorage,
  optimizerRunner = runOptimizerWorker,
  accountResolver = currentLlmControlAccount,
  presetSyncer = syncPresetToAccount,
  signal = null,
  onProgress = null,
  onPreliminary = null,
} = {}) {
  if (!adapter || !core) throw new TypeError("The optimizer adapter and core calculator are required.");
  const startedAt = Date.now();
  const statOptions = await adapter.listStats();
  const slotOptions = (core.EQUIPMENT_SLOTS ?? []).map((row) => ({ id: row.id, name: row.name ?? row.label ?? core.label?.(row.id) ?? row.id }));
  const control = normalizeLlmBuildRequest(parseLlmBuildRequest(input), { statOptions, slotOptions, core });
  const account = await resolveLlmControlAccount(control, accountResolver);
  const gameBuild = core.data?.gameBuild ?? "unversioned";
  const source = await loadLlmControlSource(control.source, { adapter, persistence, storage, gameBuild });
  const optimizerRequest = optimizerRequestFromLlmControl(control, source);
  const result = await optimizerRunner(optimizerRequest, { signal, onProgress, onPreliminary });
  if (!result?.build || !Array.isArray(result.goalResults) || !Array.isArray(result.allStats)) {
    throw new Error("The optimizer returned an incomplete result; nothing was saved.");
  }
  const persisted = persistLlmControlResult(result, control, source, { persistence, storage, gameBuild });
  if (control.account.syncPreset) {
    if (!persisted.presetDocument) throw new Error("The optimized preset was not available for account sync.");
    let cloud;
    try {
      cloud = await presetSyncer(account.client, persisted.presetDocument, { userId: account.user.id, gameBuild });
    } catch (error) {
      throw new Error(`Preset "${persisted.preset.name}" was saved locally, but account sync failed: ${error?.message ?? error}`);
    }
    persisted.account = { name: account.name, synced: true, action: cloud.action };
  } else if (account) {
    persisted.account = { name: account.name, synced: false, action: null };
  }
  return summarizeLlmControlResult(result, control, persisted, Date.now() - startedAt);
}
