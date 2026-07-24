import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "out", "questlog-public");
const procedures = Object.freeze([
  "characterBuilder.getAttributeStats",
  "characterBuilder.getEquipmentItemSets",
  "characterBuilder.getEquipmentItems",
  "characterBuilder.getEquipmentRunes",
  "characterBuilder.getRuneSynergies",
  "skillBuilder.getSkillSets",
  "skillBuilder.getSkillTraits",
  "weaponSpecialization.getWeaponSpecializations",
]);

const TIMEOUT_MS = 12_000;
// The equipment catalogue is legitimately larger than the importer's 8 MB
// character-package ceiling. Keep the same bounded-response policy with enough
// headroom for this known public catalogue.
const MAX_RESPONSE_BYTES = 32_000_000;
const POLITENESS_DELAY_MS = 250;

await mkdir(destination, { recursive: true });
const staging = path.join(destination, `.refresh-${process.pid}-${Date.now()}`);
await mkdir(staging);

try {
  for (const [index, procedure] of procedures.entries()) {
    if (index) await delay(POLITENESS_DELAY_MS);
    const data = await fetchProcedure(procedure);
    const serialized = `${JSON.stringify(data)}\n`;
    const bytes = Buffer.byteLength(serialized);
    if (bytes > MAX_RESPONSE_BYTES) {
      throw new Error(`Questlog ${procedure} inner data exceeded the ${MAX_RESPONSE_BYTES} byte safety limit.`);
    }
    await writeFile(path.join(staging, `${procedure}.json`), serialized, "utf8");
    console.log(`${procedure}: ${bytes.toLocaleString("en")} bytes`);
  }

  // Nothing in the live mirror changes until every endpoint has fetched,
  // parsed, passed its size guard, and been staged successfully.
  for (const procedure of procedures) {
    const filename = `${procedure}.json`;
    const target = path.join(destination, filename);
    const replacement = path.join(staging, filename);
    await rm(target, { force: true });
    await rename(replacement, target);
  }
  console.log(`Refreshed ${procedures.length} Questlog public mirrors.`);
} finally {
  await rm(staging, { recursive: true, force: true });
}

async function fetchProcedure(procedure) {
  const input = encodeURIComponent(JSON.stringify({ 0: { language: "en" } }));
  const url = `https://questlog.gg/throne-and-liberty/api/trpc/${procedure}?batch=1&input=${input}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "TL Helper public-data refresher",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Questlog ${procedure} failed (${response.status}).`);

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Questlog ${procedure} exceeded the ${MAX_RESPONSE_BYTES} byte safety limit.`);
  }

  const raw = await readBoundedBody(response, MAX_RESPONSE_BYTES);
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`Questlog ${procedure} returned invalid JSON.`);
  }
  const data = payload?.[0]?.result?.data?.json ?? payload?.[0]?.result?.data;
  if (!data || typeof data !== "object") {
    throw new Error(`Questlog ${procedure} returned an invalid tRPC payload.`);
  }
  return data;
}

async function readBoundedBody(response, maximumBytes) {
  if (!response.body) throw new Error("Questlog returned an empty response body.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > maximumBytes) {
      await response.body.cancel().catch(() => {});
      throw new Error(`Questlog response exceeded the ${maximumBytes} byte safety limit.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
