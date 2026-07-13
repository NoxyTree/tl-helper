import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const pages = [
  ["index.html", "./index.html", "Armory"],
  ["tracker.html", "./tracker.html", "Tracker"],
  ["achievements.html", "./achievements.html", "Achievements"],
  ["combat-lab.html", "./combat-lab.html", "Combat Lab"],
  ["gear-viewer.html", "./gear-viewer.html", "Gear Viewer"],
  ["full-build-optimizer.html", "./full-build-optimizer.html", "Build Optimizer"],
  ["build-from-scratch.html", "./build-from-scratch.html", "Build Optimizer"],
  ["privacy.html", "./privacy.html", "Privacy"],
];

const expectedNavigation = [
  ["./index.html", "Armory"],
  ["./tracker.html", "Tracker"],
  ["./achievements.html", "Achievements"],
  ["./combat-lab.html", "Combat Lab"],
  ["./gear-viewer.html", "Gear Viewer"],
  ["./full-build-optimizer.html", "Build Optimizer"],
  ["./privacy.html", "Privacy"],
];

const load = (page) => readFile(new URL(`../../web/${page}`, import.meta.url), "utf8");

test("every public page uses one cohesive branded application header", async () => {
  for (const [page, activeHref, activeLabel] of pages) {
    const html = await load(page);
    const header = html.match(/<header class="tl-app-header(?: [^"]+)?">[\s\S]*?<\/header>/i)?.[0] ?? "";
    const nav = header.match(/<nav class="tl-app-nav"[^>]*>[\s\S]*?<\/nav>/i)?.[0] ?? "";
    const links = [...nav.matchAll(/<a class="tl-app-nav-item(?: is-active)?" href="([^"]+)"(?: aria-current="page")?>([^<]+)<\/a>/gi)]
      .map((match) => [match[1], match[2].trim()]);

    assert.ok(header, `${page} has the shared header`);
    assert.doesNotMatch(header.match(/^<header[^>]*>/i)?.[0] ?? "", /style=/i, `${page} does not fork header layout inline`);
    assert.match(header, /<a class="tl-app-brand" href="\.\/index\.html"[^>]*>/i, `${page} links the brand to Armory`);
    assert.match(header, /class="tl-app-brand-mark"/i, `${page} uses the shared image mark`);
    assert.match(header, /class="tl-app-brand-title">TL HELPER</i, `${page} keeps the common brand title`);
    assert.match(header, /class="tl-app-header-end(?: [^"]+)?"/i, `${page} reserves the shared end slot`);
    assert.deepEqual(links, expectedNavigation.map(([href, label]) => page === "build-from-scratch.html" && label === "Build Optimizer" ? [activeHref, label] : [href, label]), `${page} keeps navigation order and destinations`);

    const activeLinks = [...nav.matchAll(/<a class="tl-app-nav-item is-active" href="([^"]+)" aria-current="page">([^<]+)<\/a>/gi)];
    assert.equal(activeLinks.length, 1, `${page} has exactly one active navigation item`);
    assert.equal(activeLinks[0][1], activeHref, `${page} active navigation destination is correct`);
    assert.equal(activeLinks[0][2].trim(), activeLabel, `${page} active navigation label is correct`);
    assert.match(html, /<link rel="icon" href="\.\/tl-logo\.png" type="image\/png">/i, `${page} uses the TL monogram favicon`);
  }
});

test("shared shell owns the logo and responsive header behaviour", async () => {
  const css = await load("tl-shell.css");
  assert.match(css, /background:\s*url\("\.\/tl-logo\.png"\) center \/ contain no-repeat/);
  assert.match(css, /@media \(max-width: 1000px\)[\s\S]*?\.tl-app-nav\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?overflow-x:\s*auto;/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.tl-app-header-end\s*\{[\s\S]*?grid-row:\s*2;/);
  await access(new URL("../../web/tl-logo.png", import.meta.url));
});
