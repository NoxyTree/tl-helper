import { normalizeCombatScenario } from "./vendor/combat-engine/combat-scenario.mjs";

export const IMPROVED_RESULT_HANDOFF_KEY = "tlhelper.optimizer.improved-result.v2";
export const IMPROVED_RESULT_HANDOFF_SCHEMA_VERSION = 2;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validResult(result) {
  if (!(result && typeof result === "object" && result.build && Array.isArray(result.goalResults) && Array.isArray(result.allStats))) return false;
  if (result.scenario == null) return true;
  try {
    normalizeCombatScenario(result.scenario);
    return true;
  } catch {
    return false;
  }
}

export function keptSlotsFromResult(result) {
  if (!Array.isArray(result?.slots)) return [];
  return [...new Set(result.slots.filter((row) => {
    const current = String(row?.current?.name ?? "").trim();
    const recommended = String(row?.recommended?.name ?? "").trim();
    return Boolean(row?.slotId) && current && recommended && (current === recommended || /^kept\b/i.test(String(row?.reason ?? "")));
  }).map((row) => row.slotId))];
}

export function storeImprovedResult(storage, { result, priorities = [], includeSetEffects = true, returnUrl = "./full-build-optimizer.html" } = {}) {
  if (!storage?.setItem) throw new TypeError("A browser storage target is required.");
  if (!validResult(result)) throw new TypeError("The optimizer result is incomplete and cannot be opened in the shared result screen.");
  const document = {
    schema: "tl-helper.improved-result-handoff",
    schemaVersion: IMPROVED_RESULT_HANDOFF_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    returnUrl,
    priorities: [...new Set(priorities.filter((id) => typeof id === "string" && id))],
    includeSetEffects: includeSetEffects !== false,
    keptSlotIds: keptSlotsFromResult(result),
    result: clone(result),
  };
  storage.setItem(IMPROVED_RESULT_HANDOFF_KEY, JSON.stringify(document));
  return document;
}

export function loadImprovedResult(storage) {
  if (!storage?.getItem) return null;
  let document;
  try { document = JSON.parse(storage.getItem(IMPROVED_RESULT_HANDOFF_KEY) ?? "null"); } catch { return null; }
  if (document?.schema !== "tl-helper.improved-result-handoff" || document?.schemaVersion !== IMPROVED_RESULT_HANDOFF_SCHEMA_VERSION || !validResult(document.result)) return null;
  return clone(document);
}
