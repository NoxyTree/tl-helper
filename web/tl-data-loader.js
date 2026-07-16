// Stable browser loading contract for generated TL-Helper projections.
// Legacy assembled tl-helper.web-data objects remain accepted for direct use.

export const WEB_DATA_SCHEMA = "tl-helper.web-data";
export const WEB_DATA_MANIFEST_SCHEMA = "tl-helper.web-data-manifest";
export const SUPPORTED_WEB_DATA_SCHEMA_VERSIONS = new Set([1, 2]);

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid TL-Helper web data: ${message}`);
}

function validateProvenance(value, expected) {
  assert(value?.schema === WEB_DATA_SCHEMA, `projection schema is ${value?.schema ?? "missing"}`);
  assert(value.schemaVersion === expected.schemaVersion, `projection schemaVersion differs for ${value.projection ?? "unknown"}`);
  assert(value.gameBuild === expected.gameBuild, `projection gameBuild differs for ${value.projection ?? "unknown"}`);
  assert(value.generatedAtUtc === expected.generatedAtUtc, `projection generatedAtUtc differs for ${value.projection ?? "unknown"}`);
}

export async function assembleWebDataManifest(manifest, loadProjection) {
  assert(manifest?.schema === WEB_DATA_MANIFEST_SCHEMA, `manifest schema is ${manifest?.schema ?? "missing"}`);
  assert(Number.isInteger(manifest.schemaVersion), "manifest schemaVersion is missing");
  assert(SUPPORTED_WEB_DATA_SCHEMA_VERSIONS.has(manifest.dataSchemaVersion), `dataSchemaVersion ${manifest.dataSchemaVersion ?? "missing"} is unsupported`);
  assert(/^\d+$/.test(String(manifest.gameBuild ?? "")), "manifest gameBuild is not numeric");
  assert(Array.isArray(manifest.projections) && manifest.projections.length, "manifest has no projections");
  const expected = { schemaVersion: manifest.dataSchemaVersion, gameBuild: manifest.gameBuild, generatedAtUtc: manifest.generatedAtUtc };
  const pieces = await Promise.all(manifest.projections.map(async (descriptor) => {
    assert(descriptor?.id && descriptor?.file, "projection descriptor is incomplete");
    const projection = await loadProjection(descriptor);
    validateProvenance(projection, expected);
    assert(projection.projection === descriptor.id, `projection id differs for ${descriptor.id}`);
    assert(projection.data && typeof projection.data === "object", `projection ${descriptor.id} has no data object`);
    const actualKeys = Object.keys(projection.data).sort();
    const expectedKeys = [...(descriptor.keys ?? [])].sort();
    assert(JSON.stringify(actualKeys) === JSON.stringify(expectedKeys), `projection keys differ for ${descriptor.id}`);
    return projection.data;
  }));
  const data = { schema: WEB_DATA_SCHEMA, schemaVersion: manifest.dataSchemaVersion, gameBuild: manifest.gameBuild, generatedAtUtc: manifest.generatedAtUtc };
  for (const piece of pieces) {
    for (const [key, value] of Object.entries(piece)) {
      assert(!(key in data), `duplicate top-level key ${key}`);
      data[key] = value;
    }
  }
  return data;
}

export async function loadWebData(source, options = {}) {
  if (source && typeof source === "object" && source.schema !== WEB_DATA_MANIFEST_SCHEMA) return source;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  assert(typeof fetchImpl === "function", "fetch is unavailable");
  let manifest = source;
  let baseUrl = options.baseUrl ?? "";
  if (typeof source === "string") {
    const response = await fetchImpl(source, { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load data manifest: ${response.status}`);
    manifest = await response.json();
    baseUrl = response.url || source;
  }
  assert(manifest?.schema === WEB_DATA_MANIFEST_SCHEMA, "manifest schema is missing");
  return assembleWebDataManifest(manifest, async (descriptor) => {
    const url = new URL(descriptor.file, new URL(baseUrl, globalThis.location?.href ?? "http://localhost/"));
    if (descriptor.sha256) url.searchParams.set("v", descriptor.sha256);
    const response = await fetchImpl(url.href);
    if (!response.ok) throw new Error(`Failed to load projection ${descriptor.id}: ${response.status}`);
    return response.json();
  });
}
