import { readFile } from "node:fs/promises";
import path from "node:path";
import { assembleWebDataManifest, WEB_DATA_MANIFEST_SCHEMA } from "../../web/tl-data-loader.js";

export async function loadWebDataFromFile(manifestPath) {
  const resolved = path.resolve(manifestPath);
  const value = JSON.parse(await readFile(resolved, "utf8"));
  if (value?.schema !== WEB_DATA_MANIFEST_SCHEMA) return value;
  return assembleWebDataManifest(value, async (descriptor) =>
    JSON.parse(await readFile(path.resolve(path.dirname(resolved), descriptor.file), "utf8")));
}
