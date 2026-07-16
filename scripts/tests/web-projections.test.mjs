import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";
import { assembleWebDataManifest, loadWebData } from "../../web/tl-data-loader.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(root, "web", "data", "app-data.json");

test("generated web projections have matching provenance and hashes", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.schema, "tl-helper.web-data-manifest");
  assert.match(manifest.gameBuild, /^\d+$/);
  assert.equal(new Set(manifest.projections.map((entry) => entry.id)).size, manifest.projections.length);
  for (const descriptor of manifest.projections) {
    const raw = await readFile(path.join(path.dirname(manifestPath), descriptor.file), "utf8");
    assert.equal(Buffer.byteLength(raw), descriptor.bytes, `${descriptor.id} byte count`);
    assert.equal(createHash("sha256").update(raw).digest("hex"), descriptor.sha256, `${descriptor.id} hash`);
    const value = JSON.parse(raw);
    assert.equal(value.gameBuild, manifest.gameBuild, `${descriptor.id} gameBuild`);
    assert.equal(value.generatedAtUtc, manifest.generatedAtUtc, `${descriptor.id} generatedAtUtc`);
    assert.equal(value.schemaVersion, manifest.dataSchemaVersion, `${descriptor.id} schemaVersion`);
  }
});

test("assembled projections contain no dangling core relationships", async () => {
  const data = await loadWebDataFromFile(manifestPath);
  assert.equal(data.schema, "tl-helper.web-data");
  const itemIds = new Set(data.items.map((item) => item.id));
  const skillIds = new Set(data.skills.map((skill) => skill.id));
  const traitIds = new Set(data.skillTraits.map((trait) => trait.id));
  assert.deepEqual(data.skillTraits.filter((trait) => trait.skillSetId && !skillIds.has(trait.skillSetId)), []);
  assert.deepEqual(data.artifactSets.flatMap((set) => set.memberItemIds.filter((id) => !itemIds.has(id))), []);
  assert.deepEqual(Object.values(data.traitsBySkillId).flat().filter((id) => !traitIds.has(id)), []);
  assert.deepEqual(Object.values(data.skillsByWeapon).flat().filter((id) => !skillIds.has(id)), []);
});

test("manifest assembly rejects projection provenance mismatch", async () => {
  const manifest = {
    schema: "tl-helper.web-data-manifest",
    schemaVersion: 1,
    dataSchemaVersion: 1,
    gameBuild: "123",
    generatedAtUtc: "2026-01-01T00:00:00.000Z",
    projections: [{ id: "example", file: "example.json", keys: ["items"] }],
  };
  await assert.rejects(() => assembleWebDataManifest(manifest, async () => ({
    schema: "tl-helper.web-data",
    schemaVersion: 1,
    gameBuild: "different",
    generatedAtUtc: manifest.generatedAtUtc,
    projection: "example",
    data: { items: [] },
  })), /gameBuild differs/);
});

test("manifest assembly rejects unsupported wire schema versions", async () => {
  await assert.rejects(() => assembleWebDataManifest({
    schema: "tl-helper.web-data-manifest",
    schemaVersion: 1,
    dataSchemaVersion: 999,
    gameBuild: "123",
    generatedAtUtc: "2026-01-01T00:00:00.000Z",
    projections: [{ id: "equipment", file: "equipment.json", keys: ["items"] }],
  }, async () => ({
    schema: "tl-helper.web-data",
    schemaVersion: 999,
    gameBuild: "123",
    generatedAtUtc: "2026-01-01T00:00:00.000Z",
    projection: "equipment",
    data: { items: [] },
  })), /dataSchemaVersion 999 is unsupported/);
});

test("browser loader revalidates the manifest but permits projection caching", async () => {
  const manifestUrl = "https://tlhelper.test/data/app-data.json";
  const manifest = {
    schema: "tl-helper.web-data-manifest",
    schemaVersion: 1,
    dataSchemaVersion: 1,
    gameBuild: "123",
    generatedAtUtc: "2026-01-01T00:00:00.000Z",
    projections: [{ id: "example", file: "projections/example.json", sha256: "abc123", keys: ["items"] }],
  };
  const projection = {
    schema: "tl-helper.web-data",
    schemaVersion: 1,
    gameBuild: manifest.gameBuild,
    generatedAtUtc: manifest.generatedAtUtc,
    projection: "example",
    data: { items: [] },
  };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const body = url === manifestUrl ? manifest : projection;
    return { ok: true, url, json: async () => body };
  };

  await loadWebData(manifestUrl, { fetchImpl });

  assert.deepEqual(calls, [
    { url: manifestUrl, options: { cache: "no-store" } },
    { url: "https://tlhelper.test/data/projections/example.json?v=abc123", options: undefined },
  ]);
});

test("browser loader preserves stable projection URLs for legacy hashless manifests", async () => {
  const manifest = {
    schema: "tl-helper.web-data-manifest",
    schemaVersion: 1,
    dataSchemaVersion: 1,
    gameBuild: "123",
    generatedAtUtc: "2026-01-01T00:00:00.000Z",
    projections: [{ id: "example", file: "projections/example.json", keys: ["items"] }],
  };
  let projectionUrl;
  await loadWebData(manifest, {
    baseUrl: "https://tlhelper.test/data/app-data.json",
    fetchImpl: async (url) => {
      projectionUrl = url;
      return {
        ok: true,
        json: async () => ({
          schema: "tl-helper.web-data",
          schemaVersion: 1,
          gameBuild: manifest.gameBuild,
          generatedAtUtc: manifest.generatedAtUtc,
          projection: "example",
          data: { items: [] },
        }),
      };
    },
  });

  assert.equal(projectionUrl, "https://tlhelper.test/data/projections/example.json");
});
