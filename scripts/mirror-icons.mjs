// Mirrors every icon referenced by web/data/app-data.json into
// web/assets/icons/, fetching missing files from the Questlog CDN.
// Incremental: files already on disk are skipped, so after a game patch the
// flow is `node scripts/build-web-data.mjs` then `node scripts/mirror-icons.mjs`
// and only newly referenced icons are downloaded.
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "web");
const appDataPath = path.join(webDir, "data", "app-data.json");

const CDN_BASE = "https://cdn.questlog.gg/throne-and-liberty/assets/";
const CONCURRENCY = 6;
const RETRIES = 3;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status === 404) return { notFound: true };
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { body: Buffer.from(await response.arrayBuffer()) };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

const raw = JSON.stringify(await loadWebDataFromFile(appDataPath));
const refs = [...new Set(raw.match(/assets\/icons\/[^"\\ ,]+\.webp/g) ?? [])];
if (!refs.length) {
  throw new Error("No assets/icons/ references found in app-data.json — run build-web-data.mjs first.");
}

console.log(`${refs.length} unique icons referenced`);

const pending = [];
for (const ref of refs) {
  const relative = ref.slice("assets/icons/".length);
  const target = path.join(webDir, "assets", "icons", ...relative.split("/"));
  if (!(await exists(target))) pending.push({ ref, relative, target });
}

console.log(`${pending.length} missing, ${refs.length - pending.length} already mirrored`);

const failures = [];
const missing404 = [];
let downloaded = 0;
let cursor = 0;

async function worker() {
  while (cursor < pending.length) {
    const job = pending[cursor];
    cursor += 1;
    const url = CDN_BASE + job.relative;
    try {
      const result = await fetchWithRetry(url);
      if (result.notFound) {
        missing404.push(job.ref);
        continue;
      }
      await mkdir(path.dirname(job.target), { recursive: true });
      await writeFile(job.target, result.body);
      downloaded += 1;
      if (downloaded % 100 === 0) console.log(`  ${downloaded}/${pending.length} downloaded`);
    } catch (error) {
      failures.push({ ref: job.ref, error: String(error) });
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`Done: ${downloaded} downloaded, ${missing404.length} not on CDN (404), ${failures.length} failed`);
for (const ref of missing404.slice(0, 10)) console.log(`  404: ${ref}`);
for (const failure of failures.slice(0, 10)) console.log(`  FAIL: ${failure.ref} (${failure.error})`);
if (failures.length) process.exitCode = 1;
