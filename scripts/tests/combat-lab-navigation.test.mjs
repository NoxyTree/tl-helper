import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Combat Lab is intentionally unlisted for now: the page stays deployed and
// reachable by direct URL, but no public page links to it and search engines
// are told not to index it.
const pages = [
  "index.html",
  "tracker.html",
  "achievements.html",
  "gear-viewer.html",
  "full-build-optimizer.html",
  "build-from-scratch.html",
  "privacy.html",
  "combat-lab.html",
];

for (const page of pages) {
  test(`${page} does not link to the unlisted Combat Lab from primary navigation`, async () => {
    const html = await readFile(new URL(`../../web/${page}`, import.meta.url), "utf8");
    const nav = html.match(/<nav class="tl-app-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.ok(nav, `${page} keeps the shared navigation`);
    assert.doesNotMatch(nav, /combat-lab\.html/);
  });
}

test("combat-lab.html stays deployed, unindexed, and reachable by direct URL", async () => {
  const html = await readFile(new URL("../../web/combat-lab.html", import.meta.url), "utf8");
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<header class="tl-app-header/);
  assert.match(html, /<nav class="tl-app-nav"/);
});
