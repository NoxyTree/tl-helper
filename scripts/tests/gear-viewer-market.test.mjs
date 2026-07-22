import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("Gear Viewer presents optional TLDB prices as last-known data", async () => {
  const html = await read("web/gear-viewer.html");
  assert.match(html, /\/api\/market\/prices\?region=eu/);
  assert.match(html, /Last known from TLDB\./);
  assert.match(html, /snapshotGeneratedAtUtc/);
  assert.match(html, /marketByItemKey/);
  assert.match(html, /Market prices are optional enhancement data/);
});
