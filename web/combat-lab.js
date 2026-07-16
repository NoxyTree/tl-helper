import { ARTIFACT_SLOTS, EQUIPMENT_SLOTS, data as coreData, importQuestlogBuild, indexes, initCore } from "./tl-core.js";
import { resolveBuildSnapshot, snapshotStat } from "./tl-build-snapshot.js";
import { inferBuildAttackType, resolveVisibleMatchupInputs, selectAbilityWeaponHand } from "./combat-lab-build-inputs.js";
import { loadArmoryPresets, loadArmoryState } from "./tl-persistence.js";
import {
  compareExpectedPvpDamage,
  HEALING_CASTS,
  HEALING_OUTCOMES,
  isHealingResolverAbility,
  loadCombatLabData,
  mapDisplayedLevel,
  OUTCOMES,
  projectAbilityRange,
  resolveCombatLabBuildContext,
  resolveCombatLabHealing,
  resolveCustomExpectedPvpDamage,
  resolveExpectedPvpDamage,
  resolveKitRotationPacket,
  resolvePvpMatchup,
  resolvePvpTradeVerdict,
  TIER_MAPPINGS,
} from "./combat-lab-model.js";

const byId = (id) => document.getElementById(id);
const ui = Object.fromEntries(["game-build","fatal-error","ability-tab","matchup-tab","ability-view","matchup-view","build-picker-heading","ability-icon","ability-name","ability-kind","source-build","source-summary","target-build","target-summary","comparison-build","source-questlog-url","source-questlog-import","source-import-error","target-questlog-url","target-questlog-import","target-import-error","source-fighter-name","source-fighter-weapons","source-fighter-cp","source-weapons","source-gear","target-fighter-name","target-fighter-weapons","target-fighter-cp","target-weapons","target-gear","swap-builds","pvp-mode","attack-type","pvp-hit","pvp-evasion","pvp-critical","pvp-endurance","pvp-heavy","pvp-heavy-evasion","pvp-sdb","pvp-sdr","pvp-critical-damage","pvp-critical-resistance","pvp-heavy-damage","pvp-heavy-resistance","matchup-title","matchup-context","matchup-results","matchup-note","trade-verdict","expected-ability","expected-weapon","expected-level-field","expected-level","expected-damage-results","expected-damage-verdict","expected-damage-limits","ability","component","cast-field","cast","tier","level","level-note","outcome","outcome-note","damage-source","damage-source-note","damage-min","damage-max","healing-inputs","healing","healing-received","skill-damage-boost","allow-modeled","modeled-note","result-title","result-range","expression","healing-results","result-minimum","result-maximum","result-expected","total-applications","overall-badge","precision-grid","warnings","trace","provenance"].map((id) => [id, byId(id)]));
const state = { data: null, builds: [], excludedBuilds: [], kitPackets: null };
const ABILITY_ART = Object.freeze({
  "judgment-lightning": "./assets/icons/Game/Image/Skill/Active/S_WP_ST_PowerAttack.webp",
  "swift-healing": "./assets/icons/Game/Image/Skill/Active/S_WP_WA_GR_S_Heal_AA.webp",
  "distortion-veil": "./assets/icons/Game/Image/Skill/Active/S_WP_ORB_Active_Shield.webp",
});

boot().catch(showFatal);

async function boot() {
  const [abilityResponse, referenceResponse, opponentsResponse] = await Promise.all([
    fetch("./data/combat-abilities.json"),
    fetch("./data/reference-build.json"),
    fetch("./data/opponents.json"),
    initCore("./data/app-data.json"),
  ]);
  if (!abilityResponse.ok) throw new Error(`Combat ability data failed to load (${abilityResponse.status}). Run the combat ability data build first.`);
  try {
    const kitResponse = await fetch("./data/kit-packets.json");
    if (kitResponse.ok) {
      const kitPackets = await kitResponse.json();
      if (String(kitPackets.gameBuild) === String(coreData?.gameBuild)) state.kitPackets = kitPackets;
    }
  } catch { /* kit packets are optional; the verdict falls back to a generic swing */ }
  state.data = loadCombatLabData(await abilityResponse.json());
  if (String(state.data.gameBuild) !== String(coreData?.gameBuild)) {
    throw new Error(`Combat ability data build ${state.data.gameBuild} does not match static calculator build ${coreData?.gameBuild ?? "unknown"}.`);
  }
  ui["game-build"].textContent = state.data.gameBuild;
  const reference = referenceResponse.ok ? await referenceResponse.json() : null;
  const opponents = opponentsResponse.ok ? await opponentsResponse.json() : [];
  state.builds = collectBuilds(reference, opponents);
  populateBuilds();
  ui["source-build"].value = defaultSourceId();
  ui["target-build"].value = defaultTargetId(ui["source-build"].value);
  populateStaticOptions();
  syncCustomExpectedWeapon();
  updateExpectedAbilityControls();
  bindEvents();
  setupPortraitUpload();
  populateComponents();
  updateModeControls();
  populateLevels();
  updateBuildSummaries();
  syncDamageSourceToAbility();
  syncAttackTypeFromSource();
  prefillMatchup();
  prefillDamage();
  prefillHealing();
  renderFighters();
  selectView("matchup");
}

function collectBuilds(reference, opponents) {
  const candidates = [];
  state.excludedBuilds = [];
  try {
    const current = loadArmoryState(localStorage, { currentGameBuild: state.data.gameBuild });
    if (current.ok) candidates.push({ id: "current", label: current.data.build?.name || "Current Armory build", state: current.data });
    const presets = loadArmoryPresets(localStorage, { currentGameBuild: state.data.gameBuild });
    if (presets.ok) presets.data.forEach((preset, index) => candidates.push({ id: `preset:${preset.id ?? index}`, label: preset.name || preset.build?.name || `Saved preset ${index + 1}`, state: preset }));
  } catch {
    // localStorage itself can throw (blocked cookies, sandboxed frame). Saved
    // builds are then unavailable; degrade to the bundled reference and
    // practice opponents instead of failing the whole boot.
  }
  if (reference) candidates.push({ id: `reference:${reference.id ?? "default"}`, label: reference.name || reference.build?.name || "Reference build", state: reference, profile: reference.profile });
  for (const opponent of opponents ?? []) {
    candidates.push({ id: opponent.id ?? `opponent:${opponent.name}`, label: opponent.name || "Practice opponent", state: opponent, profile: opponent.profile, blurb: opponent.blurb, isPracticeOpponent: true });
  }
  const seen = new Set();
  return candidates.filter((candidate) => {
    try {
      candidate.snapshot = resolveBuildSnapshot({ build: candidate.state.build, attributes: candidate.state.attributes, metadata: { gameDataBuild: state.data.gameBuild } });
    } catch (error) {
      // A candidate that cannot even resolve into a snapshot is excluded for the
      // same reason as an illegal one, so it is surfaced the same way instead of
      // being silently dropped.
      state.excludedBuilds.push({ label: candidate.label, status: { state: "invalid", blockingIssues: [{ message: String(error?.message ?? error) }] } });
      return false;
    }
    // The matchup and modeled comparison are evidence-scoped, so a provisional
    // snapshot is allowed in with a visible badge rather than silently dropped;
    // only genuinely invalid builds are excluded.
    candidate.legality = candidate.snapshot.resolved.status?.state ?? "invalid";
    candidate.statusIssues = candidate.snapshot.resolved.status?.blockingIssues ?? [];
    if (candidate.legality !== "legal" && candidate.legality !== "provisional") {
      state.excludedBuilds.push({ label: candidate.label, status: candidate.snapshot.resolved.status });
      return false;
    }
    const signature = JSON.stringify({ build: candidate.state.build, attributes: candidate.state.attributes ?? {} });
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function buildHasWeapon(candidate) {
  return ["main_hand", "off_hand"].some((slotId) => itemFor(candidate?.state?.build, slotId).item);
}

// Prefer a real geared attacker (the player's own build in production, the rich
// bundled reference in a fresh browser) over the empty starter build so the VS
// screen never lands on a blank fighter card. Practice opponents are never the
// default attacker.
function defaultSourceId() {
  const playerBuilds = state.builds.filter((build) => !build.isPracticeOpponent);
  return (playerBuilds.find(buildHasWeapon) ?? playerBuilds[0] ?? state.builds[0])?.id ?? "";
}

// Default the opponent to a bundled practice archetype so the matchup is never
// self-vs-self; fall back to any other build when none are available.
function defaultTargetId(sourceId) {
  const opponent = state.builds.find((build) => build.isPracticeOpponent && build.id !== sourceId);
  if (opponent) return opponent.id;
  return (state.builds.find((build) => build.id !== sourceId) ?? state.builds[0])?.id ?? "";
}

function populateBuilds() {
  const playerBuilds = state.builds.filter((build) => !build.isPracticeOpponent);
  const opponents = state.builds.filter((build) => build.isPracticeOpponent);
  ui["source-build"].innerHTML = "";
  ui["target-build"].innerHTML = '<option value="">Choose an opponent</option>';
  ui["comparison-build"].innerHTML = '<option value="">No comparison build</option>';
  // Practice archetypes are opponents only, so they stay out of the attacker list.
  for (const build of playerBuilds) {
    ui["source-build"].add(new Option(build.label, build.id));
    ui["target-build"].add(new Option(build.label, build.id));
    ui["comparison-build"].add(new Option(build.label, build.id));
  }
  if (opponents.length) {
    for (const select of [ui["target-build"], ui["comparison-build"]]) {
      const group = document.createElement("optgroup");
      group.label = "Practice opponents";
      opponents.forEach((opponent) => group.appendChild(new Option(opponent.label, opponent.id)));
      select.appendChild(group);
    }
  }
  if (!playerBuilds.length) {
    ui["source-build"].add(new Option("Manual inputs only", ""));
    ui["damage-source"].value = "manual";
  }
}

function populateStaticOptions() {
  state.data.abilities.forEach((ability) => ui.ability.add(new Option(`${ability.name} · ${ability.weapon}`, ability.id)));
  ui["expected-ability"].add(new Option("Generic 100% weapon-damage packet", "custom-packet"));
  state.data.abilities.filter(isExpectedDamageAbility).forEach((ability) => ui["expected-ability"].add(new Option(`${ability.name} · ${ability.weapon}`, ability.id)));
  for (const weapon of ["sword", "sword2h", "dagger", "spear", "gauntlet", "bow", "crossbow", "staff", "wand", "orb"]) ui["expected-weapon"].add(new Option(title(weapon), weapon));
  ui["expected-ability"].value = "custom-packet";
  for (let level = 1; level <= 20; level += 1) ui["expected-level"].add(new Option(`Global Lv. ${level}`, String(level)));
  ui["expected-level"].value = "20";
  if (state.data.abilities.some(({ id }) => id === "judgment-lightning")) ui.ability.value = "judgment-lightning";
  TIER_MAPPINGS.forEach((tier) => ui.tier.add(new Option(tier.label, tier.id)));
  ui.tier.value = "epic";
  populateOutcomes();
}

function bindEvents() {
  for (const id of ["ability-tab", "matchup-tab"]) ui[id].addEventListener("click", () => selectView(ui[id].dataset.view));
  ui.ability.addEventListener("change", () => { populateComponents(); updateModeControls(); populateOutcomes(); updateBuildSummaries(); syncDamageSourceToAbility(); prefillDamage(); prefillHealing(); render(); });
  ui.component.addEventListener("change", () => { syncCastFromComponent(); render(); });
  ui.cast.addEventListener("change", () => { syncComponentFromCast(); render(); });
  ui.tier.addEventListener("change", () => { populateLevels(); render(); });
  ui.level.addEventListener("change", render);
  ui.outcome.addEventListener("change", render);
  ui["source-build"].addEventListener("change", () => { updateBuildSummaries(); syncAttackTypeFromSource(); syncCustomExpectedWeapon(); syncDamageSourceToAbility(); prefillDamage(); prefillHealing(); prefillMatchup(); renderFighters(); render(); });
  ui["target-build"].addEventListener("change", () => { updateBuildSummaries(); prefillHealing(); prefillMatchup(); renderFighters(); render(); });
  ui["comparison-build"].addEventListener("change", render);
  ui["source-questlog-import"].addEventListener("click", () => importQuestlog("source"));
  ui["target-questlog-import"].addEventListener("click", () => importQuestlog("target"));
  ui["swap-builds"].addEventListener("click", swapBuilds);
  ui["attack-type"].addEventListener("change", () => { byId("attack-type-note").textContent = `Manual override: ${title(ui["attack-type"].value)} attacks.`; prefillMatchup(); render(); });
  ui["pvp-mode"].addEventListener("change", render);
  for (const id of ["pvp-hit","pvp-evasion","pvp-critical","pvp-endurance","pvp-heavy","pvp-heavy-evasion","pvp-sdb","pvp-sdr","pvp-critical-damage","pvp-critical-resistance","pvp-heavy-damage","pvp-heavy-resistance"]) ui[id].addEventListener("input", render);
  ui["expected-ability"].addEventListener("change", () => { updateExpectedAbilityControls(); syncExpectedAttackType(); render(); });
  ui["expected-weapon"].addEventListener("change", () => { syncExpectedAttackType(); render(); });
  ui["expected-level"].addEventListener("change", render);
  ui["damage-source"].addEventListener("change", () => {
    if (ui["damage-source"].value !== "manual") syncDamageSourceToAbility();
    ui["damage-source-note"].textContent = ui["damage-source"].value === "manual" ? "Manual Base Damage values are being used." : ui["damage-source-note"].textContent;
    prefillDamage();
    render();
  });
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
  if (view === "matchup") { syncExpectedAttackType(); render(); }
  for (const name of ["ability", "matchup"]) {
    const active = name === view;
    ui[`${name}-tab`].classList.toggle("active", active);
    ui[`${name}-tab`].setAttribute("aria-selected", String(active));
    ui[`${name}-view`].classList.toggle("active", active);
  }
}

function selectedAbility() { return state.data.abilities.find((entry) => entry.id === ui.ability.value); }
function selectedExpectedAbility() { return state.data.abilities.find((entry) => entry.id === ui["expected-ability"].value); }
function isExpectedDamageAbility(ability) { return String(ability?.kind ?? "").toLowerCase() === "damage"; }
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
    if (!response.ok) {
      // Non-OK responses are not guaranteed to carry JSON, so the body is read
      // defensively to keep the friendly message instead of a SyntaxError.
      const failure = await response.json().catch(() => null);
      throw new Error(failure?.error ?? `Questlog import failed (${response.status}).`);
    }
    const payload = await response.json();
    const requested = payload.buildId == null ? null : String(payload.buildId);
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
        ui["comparison-build"].add(new Option(candidate.label, candidate.id));
      }
    }
    ui[`${side}-build`].value = importedCandidates[0].id;
    updateBuildSummaries();
    if (side === "source") { syncAttackTypeFromSource(); syncDamageSourceToAbility(); }
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
  const snapshot = resolveBuildSnapshot({ build: imported.build, attributes: imported.attributes, metadata: { gameDataBuild: state.data.gameBuild } });
  const legality = snapshot.resolved.status?.state ?? "invalid";
  if (legality !== "legal" && legality !== "provisional") {
    const count = snapshot.resolved.status?.invalidIssues?.length ?? snapshot.resolved.status?.blockingIssues?.length ?? 0;
    throw new Error(`Imported build is invalid with ${count} blocking issue${count === 1 ? "" : "s"} and cannot be resolved into a static snapshot.`);
  }
  return {
    id, label, state: imported, profile: imported.profile, source: "questlog", sourceUrl: payload.sourceUrl,
    snapshot, legality, statusIssues: snapshot.resolved.status?.blockingIssues ?? [],
  };
}

function swapBuilds() {
  const source = ui["source-build"].value;
  ui["source-build"].value = ui["target-build"].value;
  ui["target-build"].value = source;
  updateBuildSummaries();
  syncAttackTypeFromSource();
  syncDamageSourceToAbility();
  prefillDamage();
  prefillHealing();
  prefillMatchup();
  renderFighters();
  render();
}

function renderFighters() {
  renderFighter("source", selectedBuild(ui["source-build"].value));
  renderFighter("target", selectedBuild(ui["target-build"].value));
  playFighterEntrance();
}

// ---------------------------------------------------------------------------
// Motion helpers. Purely decorative: every animated value is also present in
// the DOM immediately (visually-hidden or as the final markup), and all of it
// collapses to the final state under prefers-reduced-motion. Transforms,
// opacity, and filter only — nothing here animates layout.
const MOTION = { countUpFrame: 0, lastVerdictKey: "" };

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

// Removing and re-adding an animation class in the same style flush does not
// restart the animation, so a reflow is forced between the two steps.
function replayClass(element, className) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

// Left card slides in from the left, right card from the right, and the VS
// mark does a quick scale pop whenever either fighter selection re-renders.
function playFighterEntrance() {
  if (prefersReducedMotion()) return;
  replayClass(document.querySelector(".player-card"), "fighter-enter-left");
  replayClass(document.querySelector(".enemy-card"), "fighter-enter-right");
  replayClass(ui["swap-builds"], "vs-pop");
}

function revealVerdict(banner) {
  if (prefersReducedMotion()) {
    banner.classList.remove("verdict-reveal");
    return;
  }
  replayClass(banner, "verdict-reveal");
}

// Counts the visible advantage number up from 0 with an ease-out curve. The
// aria-hidden counter starts and ends at the exact engine-provided string, and
// a visually-hidden sibling carries the true value from the first paint.
function animateAdvantageCount(banner, finalText) {
  const counter = banner.querySelector(".verdict-advantage-count");
  if (!counter) return;
  cancelAnimationFrame(MOTION.countUpFrame);
  const finalValue = Number(finalText);
  if (prefersReducedMotion() || !Number.isFinite(finalValue)) {
    counter.textContent = String(finalText);
    return;
  }
  const duration = 900;
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    if (progress >= 1) {
      // The last frame writes the exact engine string, not a re-formatted one.
      counter.textContent = String(finalText);
      return;
    }
    const eased = 1 - Math.pow(1 - progress, 3);
    counter.textContent = (finalValue * eased).toFixed(1);
    MOTION.countUpFrame = requestAnimationFrame(step);
  };
  counter.textContent = "0.0";
  MOTION.countUpFrame = requestAnimationFrame(step);
}

// Builds the TTK race visualization for rotation-mode verdicts. Both lanes
// fill toward the kill marker on the right; the winner reaches 100% while the
// loser stops at winnerTTK/loserTTK. Omitted entirely when either time to
// kill is non-finite or over the 999s display cap, matching the verdict copy.
// Labels must already be HTML-escaped by the caller.
function raceBarMarkup(escapedSourceLabel, escapedTargetLabel, verdict) {
  const seconds = (pressurePercent) => 100 / Number(pressurePercent);
  const sourceSeconds = seconds(verdict.pressures.source.perSwingPercentOfOpponentHp);
  const targetSeconds = seconds(verdict.pressures.target.perSwingPercentOfOpponentHp);
  if (![sourceSeconds, targetSeconds].every((value) => Number.isFinite(value) && value > 0 && value < 999)) return "";
  const lane = (label, ownSeconds, otherSeconds) => {
    const wins = ownSeconds <= otherSeconds;
    const fill = wins ? 1 : Math.max(0.04, Math.min(1, otherSeconds / ownSeconds));
    return `<div class="ttk-lane ${wins ? "ttk-winner" : "ttk-loser"}"><small class="ttk-lane-name">${label}</small><span class="ttk-track"><i class="ttk-fill" style="--race-fill:${fill.toFixed(4)}"></i></span><small class="ttk-lane-time">~${Math.round(ownSeconds)}s</small></div>`;
  };
  return `<div class="ttk-race" aria-hidden="true">${lane(escapedSourceLabel, sourceSeconds, targetSeconds)}${lane(escapedTargetLabel, targetSeconds, sourceSeconds)}</div>`;
}

// The fills transition transform: scaleX, so the run class is applied one
// double-rAF after the markup lands to guarantee the start state is painted
// first. Reduced motion applies the class synchronously (no transition runs).
function startRaceBars(banner) {
  const race = banner.querySelector(".ttk-race");
  if (!race) return;
  if (prefersReducedMotion()) {
    race.classList.add("is-run");
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => race.classList.add("is-run")));
}

// Winner card pulses gold then settles on a static glow; loser desaturates.
// Even, pending, and error verdicts reset both cards. The pulse only replays
// when the verdict identity (winner + pairing) changes, so editing matchup
// stats does not restart a pulse that already settled.
function applyCardVerdictMotion(winner) {
  const decided = winner === "source" || winner === "target";
  const verdictKey = decided ? `${winner}|${ui["source-build"].value}|${ui["target-build"].value}` : "";
  const isNewVerdict = verdictKey !== MOTION.lastVerdictKey;
  MOTION.lastVerdictKey = verdictKey;
  for (const [side, selector] of [["source", ".player-card"], ["target", ".enemy-card"]]) {
    const card = document.querySelector(selector);
    if (!card) continue;
    const victor = winner === side;
    card.classList.toggle("card-defeated", decided && !victor);
    if (!victor) {
      card.classList.remove("card-victor");
    } else if (isNewVerdict && !prefersReducedMotion()) {
      replayClass(card, "card-victor");
    } else {
      card.classList.add("card-victor");
    }
  }
}

function renderFighter(side, candidate) {
  const build = candidate?.state?.build;
  const snapshot = candidate?.snapshot;
  ui[`${side}-fighter-name`].textContent = candidate?.label ?? (side === "source" ? "Choose your build" : "Choose an opponent");
  renderLegalityBadge(byId(`${side}-legality`), candidate);
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

// Provisional builds are allowed into the matchup, but their status is surfaced
// here so the evidence scope stays honest rather than hidden.
function renderLegalityBadge(element, candidate) {
  if (!element) return;
  if (candidate?.legality !== "provisional") { element.hidden = true; element.textContent = ""; return; }
  const issues = candidate.statusIssues ?? [];
  const count = issues.length;
  element.textContent = count ? `Provisional · ${count} caveat${count === 1 ? "" : "s"}` : "Provisional";
  element.className = "legality-badge provisional";
  element.title = count ? issues.map((issue) => `• ${issue.message}`).join("\n") : "Some inputs could not be fully verified; matchup stages remain evidence-scoped.";
  element.hidden = false;
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
  const excludedNote = state.excludedBuilds.length ? ` ${state.excludedBuilds.length} saved build${state.excludedBuilds.length === 1 ? " was" : "s were"} excluded because the static calculation is not legal.` : "";
  ui["source-summary"].innerHTML = source ? buildSummary(source.snapshot) : `No legal resolved source build. Enter Base Damage manually.${excludedNote}`;
  const target = selectedBuild(ui["target-build"].value);
  const healing = isHealingResolverAbility(selectedAbility());
  ui["target-summary"].innerHTML = target
    ? `${buildSummary(target.snapshot)}<br><strong>${healing ? "Healing Received is used by the opted-in model; defenses remain context only." : "Not used in arithmetic."}</strong>`
    : healing ? "Self-heal context: the source build’s Healing Received value is used." : "Target defenses are context only.";
  ui["source-summary"].classList.remove("hidden");
  ui["target-summary"].classList.remove("hidden");
}

function syncExpectedAttackType() {
  const ability = selectedExpectedAbility();
  const weapon = ability?.weapon ?? ui["expected-weapon"].value;
  if (!weapon) return;
  ui["attack-type"].value = attackTypeForWeapon(weapon);
  byId("attack-type-note").textContent = `Using ${title(ui["attack-type"].value)} because the damage packet uses ${title(weapon)}.`;
  prefillMatchup();
}

function syncCustomExpectedWeapon() {
  if (ui["expected-ability"].value !== "custom-packet") return;
  const source = selectedBuild(ui["source-build"].value);
  const inferred = inferBuildAttackType(source?.state?.build, (itemId) => indexes.itemById?.[itemId]?.equipmentType ?? "");
  if (inferred && [...ui["expected-weapon"].options].some(({ value }) => value === inferred.weaponType)) ui["expected-weapon"].value = inferred.weaponType;
}

function updateExpectedAbilityControls() {
  const ability = selectedExpectedAbility();
  ui["expected-weapon"].disabled = Boolean(ability);
  if (ability) ui["expected-weapon"].value = ability.weapon;
  ui["expected-level-field"].classList.toggle("hidden", !ability);
}

function buildSummary(snapshot) {
  const stellarite = snapshot.loadout.supportSlots?.stellarite?.itemId;
  // Also enforces that the snapshot was resolved with Item Potentials excluded,
  // and surfaces that context to the reader in plain language.
  const calculationContext = resolveCombatLabBuildContext(snapshot);
  return `Combat Power <strong>${formatNumber(snapshot.resolved.combatPower)}</strong><br>Main-hand Base Damage ${formatNumber(snapshotStat(snapshot,"attack_power_main_hand_min"))} to ${formatNumber(snapshotStat(snapshot,"attack_power_main_hand_max"))}<br>Off-hand Base Damage ${formatNumber(snapshotStat(snapshot,"attack_power_off_hand_min"))} to ${formatNumber(snapshotStat(snapshot,"attack_power_off_hand_max"))}<br>Healing +${displayStat(snapshot,"heal_modifier",0.01)}% · Healing Received +${displayStat(snapshot,"skill_heal_taken_modifier",0.01)}%<br>Skill Damage Boost ${displayStat(snapshot,"skill_power_amplification",0.1)}<br>Stellarite <strong>${stellarite ? "included in Base Damage" : "not equipped"}</strong><br>Item Potentials <strong>${escapeHtml(calculationContext.itemPotentials)}</strong>`;
}

function prefillDamage() {
  const source = selectedBuild(ui["source-build"].value);
  let hand = ui["damage-source"].value;
  if (!source || hand === "manual") return;
  const ability = selectedAbility();
  const requiredWeapon = String(ability?.weapon ?? "").toLowerCase();
  const match = selectAbilityWeaponHand(source.state.build, requiredWeapon, (itemId) => indexes.itemById?.[itemId]?.equipmentType ?? "");
  if (!match || match.hand !== hand) {
    syncDamageSourceToAbility();
    hand = ui["damage-source"].value;
    if (hand === "manual") return;
  }
  const prefix = hand === "off" ? "attack_power_off_hand" : "attack_power_main_hand";
  ui["damage-min"].value = String(snapshotStat(source.snapshot, `${prefix}_min`));
  ui["damage-max"].value = String(snapshotStat(source.snapshot, `${prefix}_max`));
}

function syncDamageSourceToAbility() {
  const source = selectedBuild(ui["source-build"].value);
  const ability = selectedAbility();
  const requiredWeapon = String(ability?.weapon ?? "").toLowerCase();
  const match = selectAbilityWeaponHand(source?.state?.build, requiredWeapon, (itemId) => indexes.itemById?.[itemId]?.equipmentType ?? "");
  if (!source || !requiredWeapon || !match) {
    ui["damage-source"].value = "manual";
    ui["damage-source-note"].textContent = source && requiredWeapon
      ? `${title(requiredWeapon)} is not equipped by the selected build. Enter Base Damage manually; no other weapon hand is substituted.`
      : "Choose a legal source build or enter Base Damage manually.";
    return;
  }
  ui["damage-source"].value = match.hand;
  ui["damage-source-note"].textContent = `Using the ${match.hand === "main" ? "main-hand" : "off-hand"} ${title(requiredWeapon)} required by ${ability.name}.`;
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
  ui["pvp-critical-damage"].value = displayStat(source?.snapshot, "critical_damage_dealt_modifier", 0.01);
  ui["pvp-critical-resistance"].value = displayStat(target?.snapshot, "critical_damage_taken_modifier", 0.01);
  ui["pvp-heavy-damage"].value = displayStat(source?.snapshot, "double_damage_dealt_modifier", 0.01);
  ui["pvp-heavy-resistance"].value = displayStat(target?.snapshot, "double_damage_taken_modifier", 0.01);
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
  let result;
  try {
    result = resolvePvpMatchup({
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
  } catch (error) {
    ui["matchup-context"].textContent = "";
    ui["matchup-results"].innerHTML = `<div class="matchup-message">${escapeHtml(String(error?.message ?? error))} Every Hit, Critical, Heavy, and SDB rating must be zero or higher.</div>`;
    ui["matchup-note"].textContent = "";
    renderExpectedDamageComparison();
    renderTradeVerdict();
    return;
  }
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
  renderExpectedDamageComparison();
  renderTradeVerdict();
}

function renderTradeVerdict() {
  const banner = ui["trade-verdict"];
  if (!banner) return;
  const source = selectedBuild(ui["source-build"].value);
  const target = selectedBuild(ui["target-build"].value);
  banner.hidden = false;
  if (!source || !target) {
    banner.className = "trade-verdict pending";
    banner.innerHTML = `<strong>Pick both fighters to get a verdict.</strong><span>The verdict projects the full damage race between the two builds — chance, damage multipliers, and health pools together.</span>`;
    applyCardVerdictMotion(null);
    return;
  }
  try {
    const resolveItemType = (itemId) => indexes.itemById?.[itemId]?.equipmentType ?? "";
    const kitFor = (candidate) => {
      const actives = (candidate.state.build.skills ?? []).filter((row) => row.loadoutType === "active");
      const included = [];
      for (const row of actives) {
        const packet = state.kitPackets?.skills?.[row.skillId];
        if (!packet) continue;
        const available = Object.keys(packet.levels).map(Number).sort((a, b) => a - b);
        // A skill leveled below the lowest recorded packet level has no honest
        // packet to use; substituting a higher-level packet would overstate its
        // contribution, so the skill is left out of the modeled kit instead.
        const level = available.filter((value) => value <= Number(row.level)).pop();
        if (level === undefined) continue;
        const entry = packet.levels[String(level)];
        included.push({ skillSetId: row.skillId, name: packet.name, coefficient: entry.coefficient, flatAdd: entry.flatAdd, cooldown: entry.cooldown, mappingClass: packet.mappingClass });
      }
      return { included, totalActives: actives.length };
    };
    const sourceKit = kitFor(source);
    const targetKit = kitFor(target);
    const rotationMode = sourceKit.included.length > 0 && targetKit.included.length > 0;
    const expectedFor = (attacker, defender, kit) => {
      const inferred = inferBuildAttackType(attacker.state.build, resolveItemType);
      if (!inferred) throw new Error(`${attacker.label} has no equipped weapon to model.`);
      const prefix = inferred.slotId === "off_hand" ? "attack_power_off_hand" : "attack_power_main_hand";
      const weaponDamage = {
        minimum: String(snapshotStat(attacker.snapshot, `${prefix}_min`)),
        maximum: String(snapshotStat(attacker.snapshot, `${prefix}_max`)),
      };
      const basis = rotationMode
        ? (() => { const packet = resolveKitRotationPacket({ skills: kit.included, weaponDamage }); return { minimum: packet.perSecond.minimum, maximum: packet.perSecond.maximum }; })()
        : weaponDamage;
      const contest = stringifyEngineInputs(resolveVisibleMatchupInputs({ sourceSnapshot: attacker.snapshot, targetSnapshot: defender.snapshot, attackType: inferred.attackType, readStat: snapshotStat }));
      return resolveCustomExpectedPvpDamage({
        minimum: basis.minimum,
        maximum: basis.maximum,
        pvpMode: ui["pvp-mode"].value,
        attackType: inferred.attackType,
        ...contest,
        criticalDamage: displayStat(attacker.snapshot, "critical_damage_dealt_modifier", 0.01),
        criticalDamageResistance: displayStat(defender.snapshot, "critical_damage_taken_modifier", 0.01),
        heavyDamage: displayStat(attacker.snapshot, "double_damage_dealt_modifier", 0.01),
        heavyDamageResistance: displayStat(defender.snapshot, "double_damage_taken_modifier", 0.01),
      });
    };
    const sourceHp = Number(snapshotStat(source.snapshot, "hp_max"));
    const targetHp = Number(snapshotStat(target.snapshot, "hp_max"));
    const verdict = resolvePvpTradeVerdict({
      source: { expected: expectedFor(source, target, sourceKit), maxHp: sourceHp },
      target: { expected: expectedFor(target, source, targetKit), maxHp: targetHp },
    });
    const sourceLabel = escapeHtml(source.label);
    const targetLabel = escapeHtml(target.label);
    const ttk = (pressurePercent) => {
      const seconds = 100 / Number(pressurePercent);
      return Number.isFinite(seconds) && seconds < 999 ? `~${Math.round(seconds)}s` : "over 999s";
    };
    const race = rotationMode
      ? `Running their full skill kits, ${sourceLabel} lands the kill in ${ttk(verdict.pressures.source.perSwingPercentOfOpponentHp)}; ${targetLabel} needs ${ttk(verdict.pressures.target.perSwingPercentOfOpponentHp)}`
      : `${sourceLabel} removes ${escapeHtml(verdict.pressures.source.perSwingPercentOfOpponentHp)}% of ${targetLabel}'s health per swing; ${targetLabel} removes ${escapeHtml(verdict.pressures.target.perSwingPercentOfOpponentHp)}% back`;
    const stability = verdict.stableWithinModeledSensitivity
      ? "Stable across the model's sensitivity range."
      : "Close enough that model uncertainty could flip it.";
    const kitNote = rotationMode
      ? `Kit basis: ${sourceLabel} ${sourceKit.included.length}/${sourceKit.totalActives} damage skills modeled, ${targetLabel} ${targetKit.included.length}/${targetKit.totalActives} · base cooldowns, Cooldown Speed not applied.`
      : "Generic weapon-swing basis — one or both builds carry no modelable skill kit.";
    const badge = rotationMode ? "Modeled · full skill kit · before Defense" : "Modeled · one swing each · before Defense";
    const raceBar = rotationMode ? raceBarMarkup(sourceLabel, targetLabel, verdict) : "";
    if (verdict.winner === "even") {
      banner.className = "trade-verdict even";
      banner.innerHTML = `<strong>Dead even — this one comes down to the pilot.</strong><span>${race}. ${escapeHtml(stability)}</span>${raceBar}<span class="trade-verdict-kit">${kitNote}</span><em class="badge modeled">${escapeHtml(badge)}</em>`;
    } else {
      const winnerIsSource = verdict.winner === "source";
      banner.className = `trade-verdict ${winnerIsSource ? "win" : "lose"}`;
      const headline = winnerIsSource
        ? `${sourceLabel} ${verdict.verdictBand === "decisive" ? "wins this matchup" : "is favored"}`
        : `${targetLabel} ${verdict.verdictBand === "decisive" ? "wins this matchup" : "is favored"}`;
      // advantagePercent is null when the loser applies no modeled pressure at
      // all (an unbounded ratio), so the headline must work without a number.
      // The visible number span is decorative (counted up by rAF) and is
      // aria-hidden; the visually-hidden twin carries the true value from the
      // first paint so screen readers and DOM tests never see a partial value.
      const advantageCopy = verdict.advantagePercent == null
        ? "the opponent applies no modeled damage pressure back"
        : `projected +<span class="verdict-advantage-count" aria-hidden="true">${escapeHtml(verdict.advantagePercent)}</span><span class="visually-hidden">${escapeHtml(verdict.advantagePercent)}</span>% in the damage race`;
      banner.innerHTML = `<strong>⚔ ${headline} — ${advantageCopy}.</strong><span>${race}. ${escapeHtml(stability)}</span>${raceBar}<span class="trade-verdict-kit">${kitNote}</span><em class="badge modeled">${escapeHtml(badge)}</em>`;
      animateAdvantageCount(banner, verdict.advantagePercent ?? "");
    }
    revealVerdict(banner);
    startRaceBars(banner);
    applyCardVerdictMotion(verdict.winner);
  } catch (error) {
    banner.className = "trade-verdict pending";
    banner.innerHTML = `<strong>No verdict for this pairing.</strong><span>${escapeHtml(String(error?.message ?? error))}</span>`;
    applyCardVerdictMotion(null);
  }
}

function renderExpectedDamageComparison() {
  const output = ui["expected-damage-results"];
  const verdict = ui["expected-damage-verdict"];
  const limits = ui["expected-damage-limits"];
  try {
    const source = selectedBuild(ui["source-build"].value);
    const target = selectedBuild(ui["target-build"].value);
    const alternative = selectedBuild(ui["comparison-build"].value);
    const ability = selectedExpectedAbility();
    const customPacket = ui["expected-ability"].value === "custom-packet";
    if (!source) throw new Error("Choose a legal attacker build.");
    if (!target) throw new Error("Choose an opponent build for a damage comparison.");
    if (!customPacket && !ability) throw new Error("No reviewed damage ability is available.");
    const components = ability?.formulaComponents?.filter((entry) => stripEnum(entry.formulaType) === "kAmountFromAttackPower") ?? [];
    if (!customPacket && components.length !== 1) throw new Error(`${ability.name} requires an explicit component choice because it has ${components.length} reviewed attack-power components.`);
    const [component] = components;
    const requiredWeapon = ability?.weapon ?? ui["expected-weapon"].value;
    const packetName = ability?.name ?? "Generic weapon-damage packet";
    const attackType = attackTypeForWeapon(requiredWeapon);
    if (ui["attack-type"].value !== attackType) throw new Error(`${packetName} requires ${title(attackType)} matchup stats. Select that attack type or reselect the packet.`);
    const resolveBuild = (build) => {
      const hand = selectAbilityWeaponHand(build.state.build, requiredWeapon, (itemId) => indexes.itemById?.[itemId]?.equipmentType ?? "");
      if (!hand) throw new Error(`${build.label} does not equip the ${title(requiredWeapon)} required by ${packetName}.`);
      const prefix = hand.hand === "off" ? "attack_power_off_hand" : "attack_power_main_hand";
      const automatic = stringifyEngineInputs(resolveVisibleMatchupInputs({ sourceSnapshot: build.snapshot, targetSnapshot: target.snapshot, attackType, readStat: snapshotStat }));
      const targetContest = {
        evasion: ui["pvp-evasion"].value,
        endurance: ui["pvp-endurance"].value,
        heavyAttackEvasion: ui["pvp-heavy-evasion"].value,
        skillDamageResistance: ui["pvp-sdr"].value,
      };
      const contest = build.id === source.id ? {
        hit: ui["pvp-hit"].value,
        criticalHit: ui["pvp-critical"].value,
        heavyAttackChance: ui["pvp-heavy"].value,
        skillDamageBoost: ui["pvp-sdb"].value,
        ...targetContest,
      } : { ...automatic, ...targetContest };
      const request = {
        minimum: String(snapshotStat(build.snapshot, `${prefix}_min`)),
        maximum: String(snapshotStat(build.snapshot, `${prefix}_max`)),
        pvpMode: ui["pvp-mode"].value,
        attackType,
        ...contest,
        criticalDamage: build.id === source.id ? ui["pvp-critical-damage"].value : displayStat(build.snapshot, "critical_damage_dealt_modifier", 0.01),
        criticalDamageResistance: ui["pvp-critical-resistance"].value,
        heavyDamage: build.id === source.id ? ui["pvp-heavy-damage"].value : displayStat(build.snapshot, "double_damage_dealt_modifier", 0.01),
        heavyDamageResistance: ui["pvp-heavy-resistance"].value,
      };
      return customPacket
        ? resolveCustomExpectedPvpDamage(request)
        : resolveExpectedPvpDamage({ ...request, ability, componentId: component.id, globalLevel: Number(ui["expected-level"].value) });
    };
    const primary = resolveBuild(source);
    const rows = [[source.label, primary]];
    let comparison = null;
    if (alternative) {
      comparison = resolveBuild(alternative);
      rows.push([alternative.label, comparison]);
    }
    output.innerHTML = rows.map(([label, result]) => {
      const interval = result.sensitivityInterval.minimum === result.sensitivityInterval.maximum
        ? formatNumber(result.expectedDamage)
        : `${formatNumber(result.sensitivityInterval.minimum)} to ${formatNumber(result.sensitivityInterval.maximum)}`;
      return `<div style="--meter:${Math.min(100, Number(result.probabilities.hit) * 100).toFixed(2)}%"><small>${escapeHtml(label)}</small><strong>${escapeHtml(interval)}</strong><span>${escapeHtml(`${title(attackType)} · Crit ${percent(result.probabilities.critical)} · Heavy ${percent(result.probabilities.heavy)} · SDB ${Number(result.multipliers.skillDamage).toFixed(3)}×`)}</span></div>`;
    }).join("");
    if (!comparison) {
      verdict.textContent = "Select an Alternative attacker above to compare the included pre-Defense stages against this same opponent.";
    } else {
      const result = compareExpectedPvpDamage(primary, comparison);
      if (result.winner === "overlap") {
        verdict.textContent = "Model-sensitive: the included-stage intervals overlap, so this model cannot identify a stable leader.";
      } else {
        const winningLabel = result.winner === "left" ? source.label : alternative.label;
        const differences = rankingSensitiveDifferences(source, alternative, attackType);
        verdict.textContent = differences.length
          ? `${winningLabel} leads the included pre-Defense stages by at least ${result.guaranteedDifferencePercent}%, but the full ranking remains unsupported because omitted build inputs differ: ${differences.join(", ")}.`
          : `${winningLabel} leads the included pre-Defense stages under every Heavy-plus-glance sensitivity variant by at least ${result.guaranteedDifferencePercent}%. This is model-stable for the included stages, not a final server-damage claim.`;
      }
    }
    limits.innerHTML = [...primary.assumptions, ...primary.unsupportedStages].map((text) => `<div class="warning-item">${escapeHtml(text)}</div>`).join("");
  } catch (error) {
    output.innerHTML = "";
    verdict.textContent = String(error?.message ?? error);
    limits.innerHTML = '<div class="warning-item">No numeric comparison was produced.</div>';
  }
}

function attackTypeForWeapon(weaponType) {
  const weapon = String(weaponType ?? "").toLowerCase();
  const types = { bow: "range", crossbow: "range", staff: "magic", wand: "magic", orb: "magic", sword: "melee", sword2h: "melee", dagger: "melee", spear: "melee", gauntlet: "melee" };
  if (!(weapon in types)) throw new RangeError(`Unsupported weapon family for damage comparison: ${weapon || "missing"}.`);
  return types[weapon];
}

function rankingSensitiveDifferences(left, right, attackType) {
  const candidates = [
    ["damage_reduction_penetration", "Bonus Damage"],
    [`${attackType}_damage_dealt_modifier`, `${title(attackType)} Damage modifier`],
    ["pvp_damage_dealt_modifier", "PvP Damage modifier"],
    ["shield_block_chance_penetration", "Shield Block Penetration"],
  ];
  return candidates.filter(([statId]) => snapshotStat(left.snapshot, statId) !== snapshotStat(right.snapshot, statId)).map(([, label]) => label);
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
  ui.trace.innerHTML = result.traces.length ? result.traces.map((trace) => `<div class="trace-group"><h3>${escapeHtml(title(trace.bound))} bound · input ${escapeHtml(trace.inputs.baseDamage)} · output ${escapeHtml(trace.output)}</h3>${trace.stages.map((stage,index) => `<div class="trace-row"><span>${index+1}</span><b>${escapeHtml(stage.operation)}</b><code>${escapeHtml(stage.inputs.join(" × "))}<br>scale ${escapeHtml(stage.scale)}; ${escapeHtml(stage.rounding)}; remainder ${escapeHtml(stage.discardedRemainder)}</code><output>${escapeHtml(stage.output)}</output></div>`).join("")}</div>`).join("") : '<p class="field-note">No arithmetic trace was produced for this formula.</p>';
}

function renderProvenance(result) {
  const source = result.source ?? {};
  ui.provenance.innerHTML = `<dl><dt>Game build</dt><dd>${escapeHtml(state.data.gameBuild)}</dd><dt>Table</dt><dd>${escapeHtml(source.table ?? "Unknown")}</dd><dt>Row</dt><dd>${escapeHtml(source.rowId ?? "Unknown")}</dd><dt>Source hash</dt><dd>${escapeHtml(source.sourceSha256 ?? "Unknown")}</dd><dt>Coefficient</dt><dd>${escapeHtml(title(result.precision.coefficient))}</dd><dt>Provenance</dt><dd>${escapeHtml(title(result.precision.provenance))}</dd></dl>`;
}

function showFatal(error) { ui["fatal-error"].textContent = String(error?.message ?? error); ui["fatal-error"].classList.remove("hidden"); }
// The combat engine's fixed-point boundary accepts decimal strings but throws
// on fractional JS Numbers, so numeric snapshot/contest values are stringified
// before they cross into the engine.
function stringifyEngineInputs(values) { return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])); }
function stripEnum(value) { const text=String(value); return text.slice(text.lastIndexOf("::")+2); }
function title(value) { return String(value ?? "").replace(/[_-]+/g," ").replace(/\b\w/g,(c)=>c.toUpperCase()); }
function formatNumber(value) { return Number(value ?? 0).toLocaleString(undefined,{maximumFractionDigits:2}); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]); }
