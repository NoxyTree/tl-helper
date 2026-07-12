import { ARTIFACT_SLOTS, EQUIPMENT_SLOTS, importQuestlogBuild, indexes, initCore } from "./tl-core.js";
import { resolveBuildSnapshot, snapshotStat } from "./tl-build-snapshot.js";
import { inferBuildAttackType, resolveVisibleMatchupInputs } from "./combat-lab-build-inputs.js";
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
  resolvePvpMatchup,
  TIER_MAPPINGS,
} from "./combat-lab-model.js";

const byId = (id) => document.getElementById(id);
const ui = Object.fromEntries(["game-build","fatal-error","ability-tab","matchup-tab","ability-view","matchup-view","build-picker-heading","ability-icon","ability-name","ability-kind","source-build","source-summary","target-build","target-summary","source-questlog-url","source-questlog-import","source-import-error","target-questlog-url","target-questlog-import","target-import-error","source-fighter-name","source-fighter-weapons","source-fighter-cp","source-weapons","source-gear","target-fighter-name","target-fighter-weapons","target-fighter-cp","target-weapons","target-gear","swap-builds","pvp-mode","attack-type","pvp-hit","pvp-evasion","pvp-critical","pvp-endurance","pvp-heavy","pvp-heavy-evasion","pvp-sdb","pvp-sdr","matchup-title","matchup-context","matchup-results","matchup-note","ability","component","cast-field","cast","tier","level","level-note","outcome","outcome-note","damage-source","damage-min","damage-max","healing-inputs","healing","healing-received","skill-damage-boost","allow-modeled","modeled-note","result-title","result-range","expression","healing-results","result-minimum","result-maximum","result-expected","total-applications","overall-badge","precision-grid","warnings","trace","provenance"].map((id) => [id, byId(id)]));
const state = { data: null, builds: [] };
const ABILITY_ART = Object.freeze({
  "judgment-lightning": "./assets/icons/Game/Image/Skill/Active/S_WP_ST_PowerAttack.webp",
  "swift-healing": "./assets/icons/Game/Image/Skill/Active/S_WP_WA_GR_S_Heal_AA.webp",
  "distortion-veil": "./assets/icons/Game/Image/Skill/Active/S_WP_ORB_Active_Shield.webp",
});

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
  setupPortraitUpload();
  populateComponents();
  updateModeControls();
  populateLevels();
  updateBuildSummaries();
  syncAttackTypeFromSource();
  prefillMatchup();
  prefillDamage();
  prefillHealing();
  renderFighters();
  render();
  selectView("matchup");
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
  ui["target-build"].innerHTML = '<option value="">Choose an opponent</option>';
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
  if (state.data.abilities.some(({ id }) => id === "judgment-lightning")) ui.ability.value = "judgment-lightning";
  TIER_MAPPINGS.forEach((tier) => ui.tier.add(new Option(tier.label, tier.id)));
  ui.tier.value = "epic";
  populateOutcomes();
}

function bindEvents() {
  for (const id of ["ability-tab", "matchup-tab"]) ui[id].addEventListener("click", () => selectView(ui[id].dataset.view));
  ui.ability.addEventListener("change", () => { populateComponents(); updateModeControls(); populateOutcomes(); updateBuildSummaries(); prefillHealing(); render(); });
  ui.component.addEventListener("change", () => { syncCastFromComponent(); render(); });
  ui.cast.addEventListener("change", () => { syncComponentFromCast(); render(); });
  ui.tier.addEventListener("change", () => { populateLevels(); render(); });
  ui.level.addEventListener("change", render);
  ui.outcome.addEventListener("change", render);
  ui["source-build"].addEventListener("change", () => { updateBuildSummaries(); syncAttackTypeFromSource(); prefillDamage(); prefillHealing(); prefillMatchup(); renderFighters(); render(); });
  ui["target-build"].addEventListener("change", () => { updateBuildSummaries(); prefillHealing(); prefillMatchup(); renderFighters(); render(); });
  ui["source-questlog-import"].addEventListener("click", () => importQuestlog("source"));
  ui["target-questlog-import"].addEventListener("click", () => importQuestlog("target"));
  ui["swap-builds"].addEventListener("click", swapBuilds);
  ui["attack-type"].addEventListener("change", () => { byId("attack-type-note").textContent = `Manual override: ${title(ui["attack-type"].value)} attacks.`; prefillMatchup(); render(); });
  ui["pvp-mode"].addEventListener("change", render);
  for (const id of ["pvp-hit","pvp-evasion","pvp-critical","pvp-endurance","pvp-heavy","pvp-heavy-evasion","pvp-sdb","pvp-sdr"]) ui[id].addEventListener("input", render);
  ui["damage-source"].addEventListener("change", () => { prefillDamage(); render(); });
  ui["damage-min"].addEventListener("input", render);
  ui["damage-max"].addEventListener("input", render);
  ui.healing.addEventListener("input", render);
  ui["healing-received"].addEventListener("input", render);
  ui["skill-damage-boost"].addEventListener("input", render);
  ui["allow-modeled"].addEventListener("change", render);
}

function setupPortraitUpload() {
  const drop = byId("player-image-drop");
  const input = byId("player-image-input");
  const image = byId("source-character-image");
  let objectUrl = "";
  const applyFile = (file) => {
    if (!file?.type?.startsWith("image/")) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    image.src = objectUrl;
    image.hidden = false;
    drop.classList.add("has-image");
  };
  input.addEventListener("change", () => applyFile(input.files?.[0]));
  for (const eventName of ["dragenter", "dragover"]) drop.addEventListener(eventName, (event) => { event.preventDefault(); drop.classList.add("dragging"); });
  for (const eventName of ["dragleave", "drop"]) drop.addEventListener(eventName, (event) => { event.preventDefault(); drop.classList.remove("dragging"); });
  drop.addEventListener("drop", (event) => applyFile(event.dataTransfer?.files?.[0]));
}

function selectView(view) {
  document.body.dataset.combatView = view;
  ui["build-picker-heading"].textContent = view === "matchup" ? "Choose both builds" : "Choose your build";
  if (view === "matchup" && !ui["target-build"].value && state.builds.length) {
    const fallback = state.builds.find((build) => build.id !== ui["source-build"].value) ?? state.builds[0];
    ui["target-build"].value = fallback.id;
    updateBuildSummaries();
    prefillMatchup();
    renderFighters();
    render();
  }
  for (const name of ["ability", "matchup"]) {
    const active = name === view;
    ui[`${name}-tab`].classList.toggle("active", active);
    ui[`${name}-tab`].setAttribute("aria-selected", String(active));
    ui[`${name}-view`].classList.toggle("active", active);
  }
}

function selectedAbility() { return state.data.abilities.find((entry) => entry.id === ui.ability.value); }
function selectedBuild(id) { return state.builds.find((entry) => entry.id === id); }

async function importQuestlog(side) {
  const input = ui[`${side}-questlog-url`];
  const button = ui[`${side}-questlog-import`];
  const errorBox = ui[`${side}-import-error`];
  errorBox.classList.add("hidden");
  button.disabled = true;
  button.textContent = "Importing…";
  try {
    const response = await fetch(`/api/questlog/character?url=${encodeURIComponent(input.value.trim())}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error ?? `Questlog import failed (${response.status}).`);
    const requested = payload.buildId === null ? null : String(payload.buildId);
    const rows = (payload.characterData?.builds ?? []).filter((row) => requested === null || String(row.id) === requested);
    if (!rows.length) throw new Error(requested ? `Questlog build ${requested} was not found.` : "Questlog returned no builds.");
    const importedCandidates = rows.map((sourceBuild) => questlogCandidate(payload, sourceBuild));
    for (const candidate of importedCandidates) {
      const existing = state.builds.findIndex((entry) => entry.id === candidate.id);
      if (existing >= 0) state.builds[existing] = candidate;
      else {
        state.builds.push(candidate);
        ui["source-build"].add(new Option(candidate.label, candidate.id));
        ui["target-build"].add(new Option(candidate.label, candidate.id));
      }
    }
    ui[`${side}-build`].value = importedCandidates[0].id;
    updateBuildSummaries();
    if (side === "source") syncAttackTypeFromSource();
    prefillDamage();
    prefillHealing();
    prefillMatchup();
    renderFighters();
    render();
  } catch (error) {
    errorBox.textContent = String(error?.message ?? error);
    errorBox.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = "Import";
  }
}

function questlogCandidate(payload, rawBuild) {
  const sourceBuild = {
    ...rawBuild,
    equipment: Object.fromEntries(Object.entries(rawBuild.equipment ?? {}).map(([slot, row]) => [slot, row ? { ...row, itemLevel: row.itemLevel ?? row.enhLvl } : row])),
  };
  const skillBuild = payload.skillData?.builds?.find((row) => String(row.id) === String(sourceBuild.skillBuildId));
  const masteryBuild = payload.masteryData?.builds?.find((row) => String(row.id) === String(sourceBuild.weaponSpecializationBuildId));
  const imported = importQuestlogBuild({ characterData: payload.characterData, build: sourceBuild, skillBuild, masteryBuild });
  const id = `questlog:${payload.characterSlug}:${sourceBuild.id}`;
  const label = `${imported.profile.name} · ${sourceBuild.name ?? `Build ${sourceBuild.id}`}`;
  return {
    id, label, state: imported, profile: imported.profile, source: "questlog", sourceUrl: payload.sourceUrl,
    snapshot: resolveBuildSnapshot({ build: imported.build, attributes: imported.attributes, metadata: { gameDataBuild: state.data.gameBuild } }),
  };
}

function swapBuilds() {
  const source = ui["source-build"].value;
  ui["source-build"].value = ui["target-build"].value;
  ui["target-build"].value = source;
  updateBuildSummaries();
  syncAttackTypeFromSource();
  prefillDamage();
  prefillHealing();
  prefillMatchup();
  renderFighters();
  render();
}

function renderFighters() {
  renderFighter("source", selectedBuild(ui["source-build"].value));
  renderFighter("target", selectedBuild(ui["target-build"].value));
}

function renderFighter(side, candidate) {
  const build = candidate?.state?.build;
  const snapshot = candidate?.snapshot;
  ui[`${side}-fighter-name`].textContent = candidate?.label ?? (side === "source" ? "Choose your build" : "Choose an opponent");
  const weaponItems = ["main_hand", "off_hand"].map((slotId) => itemFor(build, slotId)).filter(({ item }) => item);
  const weaponPair = weaponItems.map(({ item }) => title(item.equipmentType ?? item.mainCategory ?? "Weapon")).join(" / ") || "No weapons resolved";
  byId(`${side}-portrait-name`).textContent = candidate?.profile?.name ?? candidate?.state?.build?.name ?? candidate?.label ?? (side === "source" ? "Your character" : "Unknown challenger");
  byId(`${side}-portrait-weapons`).textContent = weaponPair;
  ui[`${side}-weapons`].innerHTML = weaponItems.map(renderWeaponStrip).join("") || '<p class="field-note">No weapon data.</p>';
  byId(`${side}-gear-left`).innerHTML = ["head","chest","hands","legs","feet","cloak"].map((id) => renderGearNode(EQUIPMENT_SLOTS.find((slot) => slot.id === id), itemFor(build, id))).join("");
  byId(`${side}-gear-right`).innerHTML = ["necklace","bracelet","belt","ring_1","ring_2","brooch","earring"].map((id) => renderGearNode(EQUIPMENT_SLOTS.find((slot) => slot.id === id), itemFor(build, id))).join("");
  byId(`${side}-combat-stats`).innerHTML = renderCombatStatStrip(snapshot);
  byId(`${side}-artifacts`).innerHTML = renderArtifacts(build);
}

function itemFor(build, slotId) {
  const selection = build?.equipment?.[slotId];
  return { slotId, selection, item: indexes.itemById?.[selection?.itemId] };
}

function renderWeaponStrip({ slotId, selection, item }) {
  const icon = itemIcon(item);
  return `<div class="weapon-strip ${slotId === "main_hand" ? "main-weapon" : "off-weapon"}">${icon ? `<img src="${escapeHtml(icon)}" alt="">` : '<span class="gear-placeholder"></span>'}<div><span>${slotId === "main_hand" ? "Main weapon" : "Off weapon"}</span><strong>${escapeHtml(item.name ?? selection.itemId)}</strong><small>${escapeHtml(title(item.equipmentType ?? "Weapon"))}</small></div><b>Lv.${escapeHtml(selection.level ?? "?")}</b></div>`;
}

function renderGearNode(slot, { selection, item }) {
  const icon = itemIcon(item);
  return `<div class="gear-node" title="${escapeHtml(item?.name ?? `Empty ${slot.label}`)}"><span class="gear-orb">${selection?.level ? `<span class="level">${escapeHtml(selection.level)}</span>` : ""}${icon ? `<img src="${escapeHtml(icon)}" alt="">` : '<span class="gear-placeholder"></span>'}</span><small>${escapeHtml(slot.label)}</small></div>`;
}

function renderCombatStatStrip(snapshot) {
  const value = (id) => snapshot ? snapshotStat(snapshot, id) : 0;
  const minimum = value("attack_power_main_hand_min");
  const maximum = value("attack_power_main_hand_max");
  const cells = [
    ["Base damage", snapshot ? `${formatNumber(minimum)}–${formatNumber(maximum)}` : "Unavailable"],
    ["Attack speed", snapshot ? `${(value("attack_speed_main_hand") / 1000).toFixed(2)}s` : "Unavailable"],
    ["Range", snapshot ? `${(value("attack_range_main_hand") / 100).toFixed(2)}m` : "Unavailable"],
  ];
  return cells.map(([label, result]) => `<div><small>${label}</small><strong>${result}</strong></div>`).join("");
}

function renderArtifacts(build) {
  const icons = ARTIFACT_SLOTS.map((slot) => {
    const selection = build?.artifacts?.[slot.id];
    const item = indexes.itemById?.[selection?.itemId];
    const icon = itemIcon(item);
    return `<span class="artifact-orb" title="${escapeHtml(item?.name ?? `Empty ${slot.label}`)}">${icon ? `<img src="${escapeHtml(icon)}" alt="">` : ""}</span>`;
  }).join("");
  return `<small>Artifacts</small><div class="artifact-icons">${icons}</div>`;
}

function itemIcon(item) {
  const value = item?.imageUrl ?? item?.icon ?? "";
  if (!value) return "";
  if (/^https?:\/\//.test(value)) return value;
  return `./${String(value).replace(/^\.\/?/, "")}`;
}

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
  const ability = selectedAbility();
  const healing = isHealingResolverAbility(ability);
  ui["ability-icon"].src = ABILITY_ART[ability?.id] ?? "";
  ui["ability-icon"].alt = ability ? `${ability.name} icon` : "";
  ui["ability-name"].textContent = ability?.name ?? "Select an ability";
  ui["ability-kind"].textContent = ability?.id === "judgment-lightning" ? `${title(ability.weapon)} · Raw damage per hit` : `${title(ability?.weapon)} · ${title(ability?.kind ?? "Reviewed effect")}`;
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

function prefillMatchup() {
  const source = selectedBuild(ui["source-build"].value);
  const target = selectedBuild(ui["target-build"].value);
  const values = resolveVisibleMatchupInputs({ sourceSnapshot: source?.snapshot, targetSnapshot: target?.snapshot, attackType: ui["attack-type"].value, readStat: snapshotStat });
  for (const [id, key] of Object.entries({ "pvp-hit":"hit", "pvp-evasion":"evasion", "pvp-critical":"criticalHit", "pvp-endurance":"endurance", "pvp-heavy":"heavyAttackChance", "pvp-heavy-evasion":"heavyAttackEvasion", "pvp-sdb":"skillDamageBoost", "pvp-sdr":"skillDamageResistance" })) ui[id].value = String(values[key]);
}

function syncAttackTypeFromSource() {
  const source = selectedBuild(ui["source-build"].value);
  const inferred = inferBuildAttackType(source?.state?.build, (itemId) => indexes.itemById?.[itemId]?.equipmentType ?? "");
  if (!inferred) {
    byId("attack-type-note").textContent = "Choose an attack type manually because no main weapon was resolved.";
    return;
  }
  ui["attack-type"].value = inferred.attackType;
  const hand = inferred.slotId === "main_hand" ? "main weapon" : "off weapon";
  byId("attack-type-note").textContent = `Automatically using ${title(inferred.attackType)} from the attacker's ${title(inferred.weaponType)} ${hand}. Change it here when testing a skill from their other weapon.`;
}

function displayStat(snapshot, statId, scale) {
  return String(Number(((snapshot ? snapshotStat(snapshot, statId) : 0) * scale).toFixed(4)));
}

function render() {
  try {
    renderMatchup();
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
    ui["result-title"].textContent = result.abilityName === "Judgment Lightning" ? "Judgment Lightning raw damage per hit" : `${result.abilityName} output`;
    if (result.supported) renderWholeNumberRange(result.result.minimum, result.result.maximum);
    else ui["result-range"].textContent = "No numeric result";
    ui.expression.textContent = result.expression ?? "Inspection only";
    ui["overall-badge"].textContent = "Before defense";
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

function renderMatchup() {
  const result = resolvePvpMatchup({
    pvpMode: ui["pvp-mode"].value,
    attackType: ui["attack-type"].value,
    hit: ui["pvp-hit"].value,
    evasion: ui["pvp-evasion"].value,
    criticalHit: ui["pvp-critical"].value,
    endurance: ui["pvp-endurance"].value,
    heavyAttackChance: ui["pvp-heavy"].value,
    heavyAttackEvasion: ui["pvp-heavy-evasion"].value,
    skillDamageBoost: ui["pvp-sdb"].value,
    skillDamageResistance: ui["pvp-sdr"].value,
  });
  ui["matchup-title"].textContent = `${title(result.pvpMode)} PvP · ${title(result.attackType)}`;
  const source = selectedBuild(ui["source-build"].value);
  const target = selectedBuild(ui["target-build"].value);
  const typeLabel = title(result.attackType);
  ui["matchup-context"].textContent = `${source?.label ?? "Your build"}: ${ui["pvp-hit"].value} Hit, ${ui["pvp-critical"].value} Critical, ${ui["pvp-heavy"].value} Heavy, ${ui["pvp-sdb"].value} SDB · ${target?.label ?? "Manual opponent"}: ${ui["pvp-evasion"].value} Evasion, ${ui["pvp-endurance"].value} Endurance, ${ui["pvp-heavy-evasion"].value} Heavy Evasion, ${ui["pvp-sdr"].value} SDR`;
  const rows = [
    [`${typeLabel} Hit`, percent(result.hitChance), contestNote(result.operations.hit, ui["pvp-hit"].value, ui["pvp-evasion"].value, "Hit", "Evasion")],
    [`${typeLabel} Critical`, percent(result.criticalChance), `${contestNote(result.operations.critical, ui["pvp-critical"].value, ui["pvp-endurance"].value, "Critical", "Endurance")}; Glance ${percent(result.glanceChance)}`],
    [`${typeLabel} Heavy`, percent(result.heavyChance), contestNote(result.operations.heavy, ui["pvp-heavy"].value, ui["pvp-heavy-evasion"].value, "Heavy", "Heavy Evasion")],
    ["SDB/SDR", `${Number(result.skillDamageMultiplier).toFixed(3)}×`, "Signed difference model"],
  ];
  ui["matchup-results"].innerHTML = rows.map(([label,value,note], index) => `<div style="--meter:${matchupMeter(result,index)}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><span>${escapeHtml(note)}</span></div>`).join("");
  ui["matchup-note"].textContent = "Hit uses the established one-sided Evasion rule. Heavy and glancing remain evidence-scoped models. Final damage, block, Defense, modifier order, and rounding are not applied here.";
}

function contestNote(operation, offense, defense, offenseLabel, defenseLabel) {
  const cap = operation?.inputs?.capApplied ? `; capped to ${operation.inputs.effectiveDifference}` : "";
  return `${offense} ${offenseLabel} vs ${defense} ${defenseLabel}${cap}`;
}

function matchupMeter(result, index) {
  const values = [result.hitChance, result.criticalChance, result.heavyChance, Math.min(1, Math.max(0, Number(result.skillDamageMultiplier) - 0.5))];
  return `${Math.max(3, Number(values[index]) * 100).toFixed(2)}%`;
}

function percent(value) { return `${(Number(value) * 100).toFixed(2)}%`; }

function renderWholeNumberRange(minimum, maximum) {
  const format = (value) => Math.round(Number(value)).toLocaleString();
  ui["result-range"].innerHTML = `<span class="range-bound"><small>Minimum</small><strong>${escapeHtml(format(minimum))}</strong></span><span class="range-divider" aria-hidden="true"><i></i><b>to</b><i></i></span><span class="range-bound"><small>Maximum</small><strong>${escapeHtml(format(maximum))}</strong></span>`;
  ui["result-range"].setAttribute("aria-label", `Minimum ${format(minimum)}, maximum ${format(maximum)}`);
}

function renderHealing(result) {
  const supported = result.status === "modeled";
  const perApplication = result.modeledRange?.perApplication;
  const totalApplied = result.modeledRange?.totalApplied;
  ui["result-title"].textContent = `${result.abilityName} healing per application`;
  if (supported) renderWholeNumberRange(perApplication.minimum, perApplication.maximum);
  else ui["result-range"].textContent = "Modeled resolver disabled";
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
