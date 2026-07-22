import assert from "node:assert/strict";
import test from "node:test";

import { importQuestlogBuild, initCore } from "../../web/tl-core.js";

test("Questlog imports infer the minimum Overall Mastery level required by selected nodes", async () => {
  await initCore({
    items: [],
    itemSets: [],
    runes: [],
    skills: [],
    skillTraits: [],
    masteries: [
      { id: "WM_Common_SKILL_007", name: "Potential", requiredLevel: 520 },
      { id: "WM_Common_SKILL_016", name: "Survival Enhancement", requiredLevel: 1040 },
    ],
  });

  const { build } = importQuestlogBuild({
    character: { name: "Cooldown and Buff Duration Benchmark" },
    build: { id: "8176015", name: "T4 HIT/END/WEAKEN/BUFF", equipment: {} },
    masteryBuild: {
      unified: {
        1: "WM_Common_SKILL_016",
        2: "WM_Common_SKILL_007",
      },
    },
  });

  assert.deepEqual(build.unifiedMasteries, ["WM_Common_SKILL_016", "WM_Common_SKILL_007"]);
  assert.equal(build.overallMasteryLevel, 1040);
  assert.equal(build.overallMasteryLevelSource, "questlog_selected_nodes_minimum");
});
