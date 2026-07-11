import { initCore } from "./tl-core.js";
import { resolveBuildSnapshot, snapshotStat } from "./tl-build-snapshot.js";
import { loadArmoryPresets, loadArmoryState } from "./tl-persistence.js";
import {
  HEALING_CASTS,
  HEALING_OUTCOMES,
  isHealingResolverAbility,
  loadCombatLabData,
  mapDisplayedLevel,
  OUTCOMES,
  projectAbilityRange,
  resolveCombatLabHealing,
  TIER_MAPPINGS,
} from "./combat-lab-model.js";

const byId = (id) => document.getElementById(id);
const ui = Object.fromEntries(["game-build","fatal-error","source-build","source-summary","target-build","target-summary","ability","component","cast-field","cast","tier","level","level-note","outcome","outcome-note","damage-source","damage-min","damage-max","healing-inputs","healing","healing-received","skill-damage-boost","allow-modeled","modeled-note","result-title","result-range","expression","healing-results","result-minimum","result-maximum","result-expected","total-applications","overall-badge","precision-grid","warnings","trace","provenance"].map((id) => [id, byId(id)]));
const state = { data: null, builds: [] };

boot().catch(showFatal);

async function boot() {
  const [abilityResponse, referenceResponse] = await Promise.all([
    fetch("./data/combat-abilities.json", { cache: "no-store" }),
    fetch("./data/reference-build.json", { cache: "no-store" }),
    initCore("./data/app-data.json"),
  ]);
  if (!abilityResponse.ok) throw new Error(`Combat ability data failed to load (${abilityResponse.status}). Run the combat ability data build first.`);
  state.data = loadCombatLabData(await abilityResponse.json());
  ui["game-build"].textContent = state.data.gameBuild;
  const reference = referenceResponse.ok ? await referenceResponse.json() : null;
  state.builds = collectBuilds(reference);
  populateBuilds();
  populateStaticOptions();
  bindEvents();
  populateComponents();
  updateModeControls();
  populateLevels();
  updateBuildSummaries();
  prefillDamage();
  prefillHealing();
  render();
}

function collectBuilds(reference) {
  const candidates = [];
  const current = loadArmoryState(localStorage, { currentGameBuild: state.data.gameBuild });
  if (current.ok) candidates.push({ id: "current", label: current.data.build?.name || "Current Armory build", state: current.data });
  const presets = loadArmoryPresets(localStorage, { currentGameBuild: state.data.gameBuild });
  if (presets.ok) presets.data.forEach((preset, index) => candidates.push({ id: `preset:${preset.id ?? index}`, label: preset.name || preset.build?.name || `Saved preset ${index + 1}`, state: preset }));
  if (reference) candidates.push({ id: `reference:${reference.id ?? "default"}`, label: reference.name || reference.build?.name || "Reference build", state: reference });
  const seen = new Set();
  return candidates.filter((candidate) => {
    try {
      candidate.snapshot = resolveBuildSnapshot({ build: candidate.state.build, attributes: candidate.state.attributes, metadata: { gameDataBuild: state.data.gameBuild } });
    } catch { return false; }
    const signature = JSON.stringify(candidate.state.build);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function populateBuilds() {
  ui["source-build"].innerHTML = "";
  ui["target-build"].innerHTML = '<option value="">No target selected</option>';
  for (const build of state.builds) {
    ui["source-build"].add(new Option(build.label, build.id));
    ui["target-build"].add(new Option(build.label, build.id));
  }
  if (!state.builds.length) {
    ui["source-build"].add(new Option("Manual inputs only", ""));
    ui["damage-source"].value = "manual";
  }
}

function populateStaticOptions() {
  state.data.abilities.forEach((ability) => ui.ability.add(new Option(`${ability.name} · ${ability.weapon}`, ability.id)));
  if (state.data.abilities.some(({ id }) => id === "gaia-crash")) ui.ability.value = "gaia-crash";
  TIER_MAPPINGS.forEach((tier) => ui.tier.add(new Option(tier.label, tier.id)));
  ui.tier.value = "epic";
  populateOutcomes();
}

function bindEvents() {
  ui.ability.addEventListener("change", () => { populateComponents(); updateModeControls(); populateOutcomes(); updateBuildSummaries(); prefillHealing(); render(); });
  ui.component.addEventListener("change", () => { syncCastFromComponent(); render(); });
  ui.cast.addEventListener("change", () => { syncComponentFromCast(); render(); });
  ui.tier.addEventListener("change", () => { populateLevels(); render(); });
  ui.level.addEventListener("change", render);
  ui.outcome.addEventListener("change", render);
  ui["source-build"].addEventListener("change", () => { updateBuildSummaries(); prefillDamage(); prefillHealing(); render(); });
  ui["target-build"].addEventListener("change", () => { updateBuildSummaries(); prefillHealing(); render(); });
  ui["damage-source"].addEventListener("change", () => { prefillDamage(); render(); });
  ui["damage-min"].addEventListener("input", render);
  ui["damage-max"].addEventListener("input", render);
  ui.healing.addEventListener("input", render);
  ui["healing-received"].addEventListener("input", render);
  ui["skill-damage-boost"].addEventListener("input", render);
  ui["allow-modeled"].addEventListener("change", render);
}

function selectedAbility() { return state.data.abilities.find((entry) => entry.id === ui.ability.value); }
function selectedBuild(id) { return state.builds.find((entry) => entry.id === id); }

function populateComponents() {
  const ability = selectedAbility();
  ui.component.innerHTML = "";
  for (const component of ability?.formulaComponents ?? []) {
    ui.component.add(new Option(`${title(component.id)} · ${stripEnum(component.formulaType)}`, component.id));
  }
}

function populateOutcomes() {
  const previous = ui.outcome.value;
  const outcomes = isHealingResolverAbility(selectedAbility()) ? HEALING_OUTCOMES : OUTCOMES;
  ui.outcome.innerHTML = "";
  outcomes.forEach((outcome) => ui.outcome.add(new Option(outcome.label, outcome.id)));
  if (outcomes.some(({ id }) => id === previous)) ui.outcome.value = previous;
}

function updateModeControls() {
  const healing = isHealingResolverAbility(selectedAbility());
  ui["cast-field"].classList.toggle("hidden", !healing);
  ui["healing-inputs"].classList.toggle("hidden", !healing);
  ui["healing-results"].classList.toggle("hidden", !healing);
  if (healing) syncCastFromComponent();
}

function syncCastFromComponent() {
  const cast = HEALING_CASTS.find(({ componentId }) => componentId === ui.component.value);
  if (cast) ui.cast.value = cast.id;
}

function syncComponentFromCast() {
  const cast = HEALING_CASTS.find(({ id }) => id === ui.cast.value);
  if (cast && [...ui.component.options].some(({ value }) => value === cast.componentId)) ui.component.value = cast.componentId;
}

function populateLevels() {
  const tier = TIER_MAPPINGS.find((entry) => entry.id === ui.tier.value) ?? TIER_MAPPINGS[0];
  ui.level.innerHTML = "";
  for (let level = tier.minimum; level <= tier.maximum; level += 1) ui.level.add(new Option(`Lv. ${level}`, String(level)));
  ui["level-note"].textContent = tier.id === "global"
    ? "Direct global formula-table level."
    : `${tier.label} Lv.N maps to global level N+${tier.offset}. This mapping was confirmed against live tooltips on 10 July 2026.`;
}

function updateBuildSummaries() {
  const source = selectedBuild(ui["source-build"].value);
  ui["source-summary"].innerHTML = source ? buildSummary(source.snapshot) : "No resolved source build. Enter Base Damage manually.";
  const target = selectedBuild(ui["target-build"].value);
  const healing = isHealingResolverAbility(selectedAbility());
  ui["target-summary"].innerHTML = target
    ? `${buildSummary(target.snapshot)}<br><strong>${healing ? "Healing Received is used by the opted-in model; defenses remain context only." : "Not used in arithmetic."}</strong>`
    : healing ? "Self-heal context: the source build’s Healing Received value is used." : "Target defenses are context only.";
}

function buildSummary(snapshot) {
  const stellarite = snapshot.loadout.supportSlots?.stellarite?.itemId;
  return `Combat Power <strong>${formatNumber(snapshot.resolved.combatPower)}</strong><br>Main-hand Base Damage ${formatNumber(snapshotStat(snapshot,"attack_power_main_hand_min"))} to ${formatNumber(snapshotStat(snapshot,"attack_power_main_hand_max"))}<br>Off-hand Base Damage ${formatNumber(snapshotStat(snapshot,"attack_power_off_hand_min"))} to ${formatNumber(snapshotStat(snapshot,"attack_power_off_hand_max"))}<br>Healing +${displayStat(snapshot,"heal_modifier",0.01)}% · Healing Received +${displayStat(snapshot,"skill_heal_taken_modifier",0.01)}%<br>Skill Damage Boost ${displayStat(snapshot,"skill_power_amplification",0.1)}<br>Stellarite <strong>${stellarite ? "included in Base Damage" : "not equipped"}</strong>`;
}

function prefillDamage() {
  const source = selectedBuild(ui["source-build"].value);
  const hand = ui["damage-source"].value;
  if (!source || hand === "manual") return;
  const prefix = hand === "off" ? "attack_power_off_hand" : "attack_power_main_hand";
  ui["damage-min"].value = String(snapshotStat(source.snapshot, `${prefix}_min`));
  ui["damage-max"].value = String(snapshotStat(source.snapshot, `${prefix}_max`));
}

function prefillHealing() {
  const source = selectedBuild(ui["source-build"].value);
  const target = selectedBuild(ui["target-build"].value) ?? source;
  ui.healing.value = displayStat(source?.snapshot, "heal_modifier", 0.01);
  ui["healing-received"].value = displayStat(target?.snapshot, "skill_heal_taken_modifier", 0.01);
  ui["skill-damage-boost"].value = displayStat(source?.snapshot, "skill_power_amplification", 0.1);
}

function displayStat(snapshot, statId, scale) {
  return String(Number(((snapshot ? snapshotStat(snapshot, statId) : 0) * scale).toFixed(4)));
}

function render() {
  try {
    const mapping = mapDisplayedLevel(ui.tier.value, Number(ui.level.value));
    if (isHealingResolverAbility(selectedAbility())) {
      renderHealing(resolveCombatLabHealing({
        ability: selectedAbility(),
        globalLevel: mapping.globalSkillLevel,
        castComponent: ui.cast.value,
        minimum: ui["damage-min"].value,
        maximum: ui["damage-max"].value,
        outcomeId: ui.outcome.value,
        outgoingHealingPercent: ui.healing.value,
        healingReceivedPercent: ui["healing-received"].value,
        skillDamageBoost: ui["skill-damage-boost"].value,
        allowModeledHealing: ui["allow-modeled"].checked,
      }));
      return;
    }
    const result = projectAbilityRange({
      ability: selectedAbility(), componentId: ui.component.value, globalLevel: mapping.globalSkillLevel,
      minimum: ui["damage-min"].value, maximum: ui["damage-max"].value, outcomeId: ui.outcome.value,
    });
    ui["result-title"].textContent = `${result.abilityName} · ${title(result.componentId)} · global Lv.${result.globalLevel}`;
    ui["result-range"].textContent = result.supported ? `${result.result.minimum} – ${result.result.maximum}` : "No numeric result";
    ui.expression.textContent = result.expression ?? "Inspection only";
    ui["overall-badge"].textContent = "Unsupported final outcome";
    ui["overall-badge"].className = "badge unsupported";
    ui["outcome-note"].textContent = result.outcome.reason ?? "The selected outcome is not applied to the coefficient projection.";
    renderPrecision(result);
    renderWarnings(result);
    renderTrace(result);
    renderProvenance(result);
  } catch (error) {
    ui["result-range"].textContent = "Cannot project";
    ui.expression.textContent = error.message;
    ui["precision-grid"].innerHTML = "";
    ui.warnings.innerHTML = `<div class="warning-item">${escapeHtml(error.message)}</div>`;
    ui.trace.innerHTML = "";
    ui.provenance.innerHTML = "";
  }
}

function renderHealing(result) {
  const supported = result.status === "modeled";
  const perApplication = result.modeledRange?.perApplication;
  const totalApplied = result.modeledRange?.totalApplied;
  ui["result-title"].textContent = `${result.abilityName} · ${title(result.componentId)} · global Lv.${result.globalLevel}`;
  ui["result-range"].textContent = supported ? `${perApplication.minimum} – ${perApplication.maximum}` : "Modeled resolver disabled";
  ui.expression.textContent = supported ? "Per-application modeled projection interval before overheal" : "Enable modeled stages to calculate this projection interval.";
  ui["result-minimum"].textContent = supported ? perApplication.minimum : "Unsupported";
  ui["result-maximum"].textContent = supported ? perApplication.maximum : "Unsupported";
  ui["result-expected"].textContent = "Unsupported";
  ui["total-applications"].textContent = supported ? `${result.applications.count} · ${totalApplied.minimum}–${totalApplied.maximum} total` : "Unsupported";
  ui["overall-badge"].textContent = supported ? "Modeled, not final" : "Unsupported";
  ui["overall-badge"].className = `badge ${supported ? "modeled" : "unsupported"}`;
  ui["outcome-note"].textContent = supported
    ? `${title(result.outcome.id)} is forced. Heavy Attack chance is not calculated.`
    : "No healing arithmetic is executed until explicit modeled opt-in is enabled.";
  renderHealingPrecision(result);
  renderWarnings({ warnings: result.warnings ?? [], unresolvedStages: supported ? [] : [{ reason: `Missing modeled inputs: ${(result.missingInputs ?? []).join(", ") || "modeled opt-in"}.` }] });
  renderFlexibleTrace(result.traces);
  renderHealingProvenance(result);
}

function renderHealingPrecision(result) {
  const stages = result.provenance?.stages ?? [];
  const rows = [
    ["Overall", result.status === "modeled" ? "modeled" : "unsupported"],
    ["Applications", result.applications?.precision ?? "unsupported"],
    ...stages.map((stage) => [title(stage.id), stage.precision]),
    ["Expected value", "unsupported"],
  ];
  ui["precision-grid"].innerHTML = rows.map(([label,value]) => `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(title(value))}</strong></div>`).join("");
}

function renderFlexibleTrace(traces) {
  if (!traces) { ui.trace.innerHTML = '<p class="field-note">No arithmetic trace was produced.</p>'; return; }
  ui.trace.innerHTML = Object.entries(traces).map(([bound, endpoint]) => {
    const rows = endpoint?.trace?.stages ?? [];
    return `<div class="trace-group"><h3>${escapeHtml(title(bound))} bound</h3>${rows.map((stage,index) => `<div class="trace-row"><span>${index+1}</span><b>${escapeHtml(title(stage.operation ?? stage.stage ?? stage.id ?? "stage"))}</b><code>${escapeHtml(formatTraceInputs(stage.inputs))}</code><output>${escapeHtml(stage.output ?? stage.result ?? "")}</output></div>`).join("")}</div>`;
  }).join("");
}

function formatTraceInputs(inputs) {
  if (Array.isArray(inputs)) return inputs.join(" × ");
  if (inputs && typeof inputs === "object") return Object.entries(inputs).map(([key,value]) => `${key}=${value}`).join("; ");
  return inputs ?? "";
}

function renderHealingProvenance(result) {
  const stages = (result.provenance?.stages ?? []).map((stage) => `<dt>${escapeHtml(title(stage.id))}</dt><dd>${escapeHtml(title(stage.precision))}${stage.provenance ? ` · ${escapeHtml(title(stage.provenance))}` : ""}</dd>`).join("");
  ui.provenance.innerHTML = `<dl><dt>Game build</dt><dd>${escapeHtml(state.data.gameBuild)}</dd><dt>Resolver</dt><dd>Healing Resolver v1</dd><dt>Final outcome</dt><dd>Unsupported · no overheal or live pipeline claim</dd>${stages}</dl>`;
}

function renderPrecision(result) {
  const rows = [["Coefficient",result.precision.coefficient],["Coefficient basis",result.precision.coefficientBasis ?? "not recorded"],["Provenance",result.precision.provenance],["Arithmetic",result.precision.arithmeticProjection ?? "not executed"],["Final outcome",result.precision.overall]];
  ui["precision-grid"].innerHTML = rows.map(([label,value]) => `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(title(value))}</strong></div>`).join("");
}

function renderWarnings(result) {
  const unresolved = (result.unresolvedStages ?? []).map((stage) => stage.reason);
  ui.warnings.innerHTML = [...result.warnings, ...unresolved].map((warning) => `<div class="warning-item">${escapeHtml(warning)}</div>`).join("");
}

function renderTrace(result) {
  ui.trace.innerHTML = result.traces.length ? result.traces.map((trace) => `<div class="trace-group"><h3>${escapeHtml(title(trace.bound))} bound · input ${escapeHtml(trace.inputs.baseDamage)} · output ${escapeHtml(trace.output)}</h3>${trace.stages.map((stage,index) => `<div class="trace-row"><span>${index+1}</span><b>${escapeHtml(stage.operation)}</b><code>${escapeHtml(stage.inputs.join(" × "))}<br>scale ${stage.scale}; ${stage.rounding}; remainder ${stage.discardedRemainder}</code><output>${escapeHtml(stage.output)}</output></div>`).join("")}</div>`).join("") : '<p class="field-note">No arithmetic trace was produced for this formula.</p>';
}

function renderProvenance(result) {
  const source = result.source ?? {};
  ui.provenance.innerHTML = `<dl><dt>Game build</dt><dd>${escapeHtml(state.data.gameBuild)}</dd><dt>Table</dt><dd>${escapeHtml(source.table ?? "Unknown")}</dd><dt>Row</dt><dd>${escapeHtml(source.rowId ?? "Unknown")}</dd><dt>Source hash</dt><dd>${escapeHtml(source.sourceSha256 ?? "Unknown")}</dd><dt>Coefficient</dt><dd>${escapeHtml(title(result.precision.coefficient))}</dd><dt>Provenance</dt><dd>${escapeHtml(title(result.precision.provenance))}</dd></dl>`;
}

function showFatal(error) { ui["fatal-error"].textContent = error.message; ui["fatal-error"].classList.remove("hidden"); }
function stripEnum(value) { const text=String(value); return text.slice(text.lastIndexOf("::")+2); }
function title(value) { return String(value ?? "").replace(/[_-]+/g," ").replace(/\b\w/g,(c)=>c.toUpperCase()); }
function formatNumber(value) { return Number(value ?? 0).toLocaleString(undefined,{maximumFractionDigits:2}); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]); }
