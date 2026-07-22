// Generates the Combat Lab practice-opponent roster (web/data/opponents.json)
// from live, high-rated public Questlog PvP builds so the roster tracks the
// real ladder meta instead of a synthetic recipe. The earlier trait-swap
// generator produced ~1k-evasion / 2-4k-endurance chassis while verified live
// top builds run ~4.7k hit / ~6k evasion / near-zero endurance, so verdicts
// against it systematically undervalued evasion.
//
// Roster selection lives in scripts/combat-opponents/questlog-roster.json:
// each entry pins one build (characterSlug + buildId) chosen from the browse
// directory (https://questlog.gg/throne-and-liberty/en/character-builder) to
// cover tank/dps/healer across hit and evasion leans where available.
//
// Each build is fetched through the same three tRPC procedures as
// api/questlog/character.js, imported through core.importQuestlogBuild exactly
// like Combat Lab's own URL importer (web/combat-lab.js questlogCandidate),
// and must resolve to a legal or provisional snapshot via resolveBuildSnapshot
// before it is written — nothing is fabricated and nothing broken ships.
//
// Run: node scripts/build-combat-opponents.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as core from "../web/tl-core.js";
import { resolveBuildSnapshot } from "../web/tl-build-snapshot.js";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const roster = JSON.parse(await readFile(join(root, "scripts", "combat-opponents", "questlog-roster.json"), "utf8"));
await core.initCore(await loadWebDataFromFile(join(root, "web", "data", "app-data.json")));

// Upstream courtesy: strictly sequential requests with a pause between them,
// and the same user-agent string the hosted importer sends.
const COURTESY_DELAY_MS = 1200;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function trpc(procedure, input) {
  const query = encodeURIComponent(JSON.stringify(input));
  const upstream = await fetch(`https://questlog.gg/throne-and-liberty/api/trpc/${procedure}?input=${query}`, {
    headers: { accept: "application/json", "user-agent": "TL Helper hosted importer" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!upstream.ok) throw new Error(`Questlog ${procedure} failed (${upstream.status}).`);
  const data = JSON.parse(await upstream.text())?.result?.data;
  if (!data) throw new Error(`Questlog ${procedure} returned invalid data.`);
  await sleep(COURTESY_DELAY_MS);
  return data;
}

const sourceUrlFor = (entry) =>
  `https://questlog.gg/throne-and-liberty/en/character-builder/${encodeURIComponent(entry.characterSlug)}?build-id=${entry.buildId}`;

async function importOpponent(entry) {
  const characterData = await trpc("characterBuilder.getCharacter", { slug: entry.characterSlug });
  const ownerSlug = characterData?.character?.user?.slug;
  if (!ownerSlug || !Array.isArray(characterData?.builds)) throw new Error(`${entry.id}: Questlog returned an incomplete character package.`);
  const rawBuild = characterData.builds.find((row) => String(row.id) === String(entry.buildId));
  if (!rawBuild) throw new Error(`${entry.id}: build ${entry.buildId} not found on ${entry.characterSlug} (${characterData.builds.length} builds).`);
  const skillData = await trpc("skillBuilder.getSkillBuildsBySlug", { slug: ownerSlug });
  const masteryData = await trpc("weaponSpecialization.getWeaponSpecializationBySlug", { slug: ownerSlug });

  // Same normalization as web/combat-lab.js questlogCandidate: Questlog stores
  // the enhancement level as enhLvl on some rows, which importQuestlogBuild
  // reads as itemLevel.
  const sourceBuild = {
    ...rawBuild,
    equipment: Object.fromEntries(Object.entries(rawBuild.equipment ?? {}).map(([slot, row]) => [slot, row ? { ...row, itemLevel: row.itemLevel ?? row.enhLvl } : row])),
  };
  const imported = core.importQuestlogBuild({
    characterData,
    build: sourceBuild,
    skillBuild: skillData?.builds?.find((row) => String(row.id) === String(sourceBuild.skillBuildId)),
    masteryBuild: masteryData?.builds?.find((row) => String(row.id) === String(sourceBuild.weaponSpecializationBuildId)),
  });
  imported.build.id = `opponent-${entry.id}`;
  imported.build.name = entry.label;

  const snapshot = resolveBuildSnapshot({
    build: imported.build,
    attributes: imported.attributes,
    metadata: { gameDataBuild: core.data?.gameBuild },
  });
  const legality = snapshot.resolved.status?.state ?? "invalid";
  if (legality !== "legal" && legality !== "provisional") {
    const issues = snapshot.resolved.status?.invalidIssues ?? snapshot.resolved.status?.blockingIssues ?? [];
    throw new Error(`${entry.id}: imported build is ${legality} (${issues.length} blocking issues: ${issues.map((issue) => issue.message).join("; ")}).`);
  }

  // Same rating scale the Combat Lab matchup panel displays (see
  // resolveVisibleMatchupInputs): pvp_* snapshot stats are stored x10.
  const stats = Object.fromEntries(snapshot.resolved.stats.map((row) => [row.id, row.total]));
  const point = (statId) => Math.max(0, Number(stats[statId] ?? 0)) * 0.1;
  const defensiveSummary = [["hit", "accuracy"], ["evasion", "evasion"], ["endurance", "critical_defense"]]
    .map(([label, statKind]) => `${label}=${Math.max(...["melee", "range", "magic"].map((school) => point(`pvp_${school}_${statKind}`)))}`)
    .join(" ");
  console.log(`${entry.id}: ${legality}, max ${defensiveSummary}, from "${imported.profile.name}"`);

  return {
    id: `opponent:${entry.id}`,
    name: entry.label,
    source: `Imported from ${entry.author}'s public Questlog build "${entry.buildName}" by scripts/build-combat-opponents.mjs`,
    sourceUrl: sourceUrlFor(entry),
    kind: "practice-opponent",
    blurb: entry.blurb,
    profile: { name: entry.label, role: "Practice opponent", server: "Questlog" },
    attributes: imported.attributes,
    build: imported.build,
  };
}

const opponents = [];
for (const entry of roster.entries) opponents.push(await importOpponent(entry));

const output = join(root, "web", "data", "opponents.json");
await writeFile(output, `${JSON.stringify(opponents, null, 2)}\n`, "utf8");
console.log(`Wrote ${opponents.length} practice opponents to ${output}`);
