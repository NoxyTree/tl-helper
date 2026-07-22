import assert from "node:assert/strict";
import test from "node:test";

import { paretoTuneFrontier, selectLinkedTuneCandidate, tuneRanges } from "../../web/optimizer/tl-build-tuner.js";

const candidates = [
  { id: "guard", score: 3, goalValues: { endurance: 4400, hit: 700, cooldown: 48 } },
  { id: "balanced", score: 2, goalValues: { endurance: 4250, hit: 920, cooldown: 54 } },
  { id: "striker", score: 1, goalValues: { endurance: 3880, hit: 1420, cooldown: 47 } },
  { id: "worse", score: 0, goalValues: { endurance: 3800, hit: 600, cooldown: 40 } },
];

test("tuner keeps real non-dominated builds and exposes their ranges", () => {
  const frontier = paretoTuneFrontier(candidates, ["endurance", "hit", "cooldown"]);
  assert.deepEqual(frontier.map((row) => row.id), ["guard", "balanced", "striker"]);
  assert.deepEqual(tuneRanges(frontier, ["endurance", "hit"]), { endurance: { minimum: 3880, maximum: 4400 }, hit: { minimum: 700, maximum: 1420 } });
});

test("moving one linked slider snaps every stat to a real feasible build", () => {
  const frontier = paretoTuneFrontier(candidates, ["endurance", "hit", "cooldown"]);
  assert.equal(selectLinkedTuneCandidate(frontier, ["endurance", "hit", "cooldown"], "endurance", 4200, { endurance: 4000 }).id, "balanced");
  assert.equal(selectLinkedTuneCandidate(frontier, ["endurance", "hit", "cooldown"], "hit", 1400, { endurance: 4000 }).id, "balanced");
});

test("target caps prevent excess from dominating a better at-target tradeoff", () => {
  const rows = [
    { id: "excess", score: 2, goalValues: { endurance: 100, cooldown: 92.9 } },
    { id: "target", score: 3, goalValues: { endurance: 110, cooldown: 80 } },
  ];
  const frontier = paretoTuneFrontier(rows, ["endurance", "cooldown"], 48, { cooldown: 80 });
  assert.deepEqual(frontier.map((row) => row.id), ["target"]);
});
