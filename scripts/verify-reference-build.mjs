// Regression test for calculator reference totals.
//
// Hermetic by default: loads every fixture in scripts/reference-builds/,
// reads its committed preset file (build + attributes), runs calculateBuild
// offline, and asserts the fixture's hand-transcribed expected totals (the
// numbers initially come from Questlog's rendered stats panel because they are
// not available from the API. A fixture may intentionally diverge where
// decoded game evidence proves Questlog wrong; such fixtures must record an
// `expectationSource` note beside their expected table.
//
// TL_VERIFY_LIVE=1 refetches each fixture's build from questlog.gg tRPC and
// rewrites the preset file before verifying, so drifted gear/skill data is
// refreshed. Expected tables are never touched by live mode.
//
// TL_VERIFY_DETAILS=stat_a,stat_b prints per-source rows for those stats.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import * as core from "../web/tl-core.js";
import { resolveBuildSnapshot } from "../web/tl-build-snapshot.js";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = join(repoRoot, "scripts", "reference-builds");

async function trpc(path, input) {
  const query = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const response = await fetch(`https://questlog.gg/throne-and-liberty/api/trpc/${path}${query}`, {
    headers: { accept: "application/json", "user-agent": "TL Helper reference verifier" },
  });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
  return (await response.json()).result.data;
}

async function refreshFixtureFromLive(fixture) {
  const characterData = await trpc("characterBuilder.getCharacter", { slug: fixture.characterSlug });
  const sourceBuild = characterData.builds[Number(fixture.buildIndex ?? 0)];
  const [skillData, masteryData] = await Promise.all([
    trpc("skillBuilder.getSkillBuildsBySlug", { slug: fixture.ownerSlug }),
    trpc("weaponSpecialization.getWeaponSpecializationBySlug", { slug: fixture.ownerSlug }),
  ]);
  const imported = core.importQuestlogBuild({
    characterData,
    build: sourceBuild,
    skillBuild: skillData.builds.find((row) => row.id === sourceBuild.skillBuildId),
    masteryBuild: masteryData.builds.find((row) => row.id === sourceBuild.weaponSpecializationBuildId),
  });
  const presetPath = join(repoRoot, fixture.presetPath);
  await writeFile(presetPath, `${JSON.stringify({
    id: fixture.id,
    name: fixture.presetName ?? characterData.character.name,
    source: `https://questlog.gg/throne-and-liberty/en/character-builder/${fixture.characterSlug}`,
    profile: imported.profile,
    attributes: imported.attributes,
    build: imported.build,
  }, null, 2)}\n`, "utf8");
  console.log(`Refreshed preset from live: ${fixture.presetPath}`);
}

const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

const fixtureFiles = (await readdir(fixturesDir)).filter((name) => name.endsWith(".json")).sort();
if (!fixtureFiles.length) {
  console.error(`No fixtures found in ${fixturesDir}`);
  process.exit(1);
}

let totalRows = 0;
let totalFailed = 0;
for (const fileName of fixtureFiles) {
  const fixture = JSON.parse(await readFile(join(fixturesDir, fileName), "utf8"));
  if (!fixture.expected || !Object.keys(fixture.expected).length) {
    throw new Error(`${fileName} has no independently evidenced expected assertions`);
  }
  if (process.env.TL_VERIFY_LIVE && fixture.characterSlug) {
    await refreshFixtureFromLive(fixture);
  } else if (process.env.TL_VERIFY_LIVE) {
    console.log(`Skipped live refresh for local fixture: ${fixture.name}`);
  }
  const preset = JSON.parse(await readFile(join(repoRoot, fixture.presetPath), "utf8"));
  const build = preset.build;
  build.masteries = core.normalizeMasterySelections(build.masteries);
  const snapshot = resolveBuildSnapshot({
    build,
    attributes: preset.attributes,
    metadata: { gameDataBuild: fixture.gameDataBuild ?? "fixture-unversioned" },
  });
  const actual = Object.fromEntries(snapshot.resolved.stats.map((row) => [row.id, row.total]));
  actual.combat_power = snapshot.resolved.combatPower;
  const rows = Object.entries(fixture.expected).map(([statId, expected]) => {
    const value = Number(actual[statId] ?? 0);
    const difference = value - expected;
    return { statId, expected, actual: value, difference, pass: Math.abs(difference) < 0.0001 };
  });
  const failed = rows.filter((row) => !row.pass);
  if (failed.length || process.env.TL_VERIFY_TABLE) console.table(failed.length ? failed : rows);
  console.log(`${fixture.name}: matched ${rows.length - failed.length}/${rows.length} asserted raw totals.`);
  totalRows += rows.length;
  totalFailed += failed.length;
  if (process.env.TL_VERIFY_DETAILS) {
    for (const statId of process.env.TL_VERIFY_DETAILS.split(",")) {
      const row = snapshot.resolved.stats.find((entry) => entry.id === statId);
      console.log(`\n${statId}: ${row?.total ?? 0}`);
      console.table(row?.sources ?? []);
    }
    if (process.env.TL_VERIFY_DETAILS.includes("combat_power")) console.dir(core.combatPowerBreakdown(build), { depth: null });
  }
}

console.log(`\nTotal: ${totalRows - totalFailed}/${totalRows} across ${fixtureFiles.length} reference build(s).`);
if (totalFailed) process.exitCode = 1;
