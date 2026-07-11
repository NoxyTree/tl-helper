import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildCombatEffectLinks } from "../lib/combat-effect-links.mjs";
import { buildCombatEffectLinkFiles } from "../build-combat-effect-links.mjs";

const BUILD = "24118850";

function fixture() {
  return {
    gameBuild: BUILD,
    effectTable: {
      table: "TLEffectProperty", gameBuild: BUILD, sha256: "effect-hash", decoderVersion: "0.2.0",
      rows: {
        WP_ST_S_PowerAttack_DD: { UID: 950135968, Group: "EEffectGroup::Direct_Damage", Abnormal: "abn_DirectDamage", formula_parameter: "ST_PowerAttack_DD", show_effect_hit_floater: true },
        WP_ST_S_PowerAttack_DD_2: { UID: 967438815, Group: "EEffectGroup::Direct_Damage", Abnormal: "abn_DirectDamage", formula_parameter: "ST_PowerAttack_DD", show_effect_hit_floater: true },
        WP_ST_S_PowerAttack_Projectile_DD: { UID: 963274211, Group: "EEffectGroup::Direct_Damage", Abnormal: "abn_DirectDamage", formula_parameter: "ST_PowerAttack_DD_Wet", show_effect_hit_floater: true },
        WP_ST_S_PowerAttack_Branch: { UID: 777, Group: "EEffectGroup::Conditional_Branch", Abnormal: "None", formula_parameter: "None" },
      },
    },
    abilityArtifact: {
      schema: "tl-helper.combat-ability-data", schemaVersion: 1, gameBuild: BUILD,
      abilities: [{ id: "judgment-lightning", name: "Judgment Lightning", skillSetId: "SkillSet_WP_ST_S_PowerAttack", formulaComponents: [{ id: "first-cast-per-hit-damage", role: "first-cast-per-hit-magnitude", sourceRow: "ST_PowerAttack_DD" }] }],
    },
  };
}

test("links formula components to client-visible effects without claiming an ability total", () => {
  const report = buildCombatEffectLinks(fixture());
  const ability = report.abilities[0];
  assert.equal(report.schema, "tl-helper.combat-effect-links");
  assert.equal(ability.relatedEffects.length, 4);
  assert.deepEqual(ability.components[0].linkedEffects.map(({ effectRowId }) => effectRowId), ["WP_ST_S_PowerAttack_DD", "WP_ST_S_PowerAttack_DD_2"]);
  assert.deepEqual(ability.components[0].directDamageEffects.map(({ uid }) => uid), ["950135968", "967438815"]);
  assert.match(ability.components[0].limitation, /whole-ability total/);
  assert.match(ability.limitations[1], /must not be summed/);
  assert.equal(ability.relatedEffects.find(({ effectRowId }) => effectRowId.endsWith("_Branch")).group, "EEffectGroup::Conditional_Branch");
});

test("refuses build and schema mismatches", () => {
  const input = fixture();
  input.effectTable.gameBuild = "999";
  assert.throws(() => buildCombatEffectLinks(input), /does not match requested build/);
  input.effectTable.gameBuild = BUILD;
  input.abilityArtifact.schema = "other";
  assert.throws(() => buildCombatEffectLinks(input), /schema is unsupported/);
});

test("writes a build-scoped report", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tl-effect-links-"));
  try {
    const decoded = path.join(root, "decoded", BUILD, "tables");
    const reports = path.join(root, "reports", BUILD);
    mkdirSync(decoded, { recursive: true });
    mkdirSync(reports, { recursive: true });
    const input = fixture();
    writeFileSync(path.join(decoded, "TLEffectProperty.json"), JSON.stringify(input.effectTable), "utf8");
    writeFileSync(path.join(reports, "combat-abilities.json"), JSON.stringify(input.abilityArtifact), "utf8");
    const result = buildCombatEffectLinkFiles({ build: BUILD, dataRoot: root });
    assert.deepEqual(JSON.parse(readFileSync(result.outputFile, "utf8")), result.result);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
