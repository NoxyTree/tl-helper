import assert from "node:assert/strict";
import test from "node:test";
import { fetchQuestlogCharacterPackage, parseQuestlogCharacterUrl } from "../lib/questlog-character-import.mjs";

test("parses locale-independent Questlog character links and exact build IDs", () => {
  assert.deepEqual(parseQuestlogCharacterUrl("https://questlog.gg/throne-and-liberty/en-nc/character-builder/TestSlug/combat-simulator?buildId=123"), {
    sourceUrl: "https://questlog.gg/throne-and-liberty/en-nc/character-builder/TestSlug/combat-simulator?buildId=123",
    characterSlug: "TestSlug",
    buildId: "123",
  });
});

test("accepts Questlog's own build-id parameter spelling", () => {
  assert.equal(parseQuestlogCharacterUrl("https://questlog.gg/throne-and-liberty/en/character-builder/TestSlug?build-id=8215841").buildId, "8215841");
  assert.throws(() => parseQuestlogCharacterUrl("https://questlog.gg/throne-and-liberty/en/character-builder/Test?build-id=nope"), /numeric/);
});

test("rejects arbitrary proxy hosts and malformed build IDs", () => {
  assert.throws(() => parseQuestlogCharacterUrl("https://example.com/character-builder/Test"), /questlog\.gg/);
  assert.throws(() => parseQuestlogCharacterUrl("https://questlog.gg/throne-and-liberty/en/character-builder/Test?buildId=nope"), /numeric/);
});

test("fetches the three fixed public Questlog packages", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const data = url.includes("getCharacter")
      ? { character: { user: { slug: "owner" } }, builds: [{ id: 7 }] }
      : { builds: [] };
    return { ok: true, headers: { get: () => null }, json: async () => ({ result: { data } }) };
  };
  const result = await fetchQuestlogCharacterPackage({ sourceUrl: "https://questlog.gg/throne-and-liberty/en/character-builder/Test?buildId=7", fetchImpl });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.buildId, "7");
  assert.equal(calls.length, 3);
  assert.ok(calls.every((url) => url.startsWith("https://questlog.gg/throne-and-liberty/api/trpc/")));
});
