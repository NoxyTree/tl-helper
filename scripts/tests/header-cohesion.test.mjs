import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const pages = [
  ["index.html", "./index.html", "Armory", "Armory | TL Helper"],
  ["tracker.html", "./tracker.html", "Tracker", "Tracker | TL Helper"],
  ["achievements.html", "./achievements.html", "Achievements", "Achievements | TL Helper"],
  ["combat-lab.html", "./combat-lab.html", "Combat Lab", "Combat Lab | TL Helper"],
  ["gear-viewer.html", "./gear-viewer.html", "Gear Viewer", "Gear Viewer | TL Helper"],
  ["full-build-optimizer.html", "./full-build-optimizer.html", "Build Optimizer", "Build Optimizer | TL Helper"],
  ["build-from-scratch.html", "./full-build-optimizer.html", "Build Optimizer", "Build Optimizer: Build from Scratch | TL Helper"],
  ["privacy.html", "./privacy.html", "Privacy", "Privacy | TL Helper"],
];

const assetVersion = "20260713";

const socialTitles = new Map([
  ["index.html", "Armory | TL Helper"],
  ["tracker.html", "Tracker | TL Helper"],
  ["achievements.html", "Achievements | TL Helper"],
  ["combat-lab.html", "Combat Lab | TL Helper"],
  ["gear-viewer.html", "Gear Viewer | TL Helper"],
  ["privacy.html", "Privacy | TL Helper"],
]);

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
  for (const [page, activeHref, activeLabel, title] of pages) {
    const html = await load(page);
    const header = html.match(/<header class="tl-app-header(?: [^"]+)?">[\s\S]*?<\/header>/i)?.[0] ?? "";
    const nav = header.match(/<nav class="tl-app-nav"[^>]*>[\s\S]*?<\/nav>/i)?.[0] ?? "";
    const links = [...nav.matchAll(/<a class="tl-app-nav-item(?: is-active)?" href="([^"]+)"(?: aria-current="(?:page|location)")?>([^<]+)<\/a>/gi)]
      .map((match) => [match[1], match[2].trim()]);

    assert.ok(header, `${page} has the shared header`);
    assert.doesNotMatch(header.match(/^<header[^>]*>/i)?.[0] ?? "", /style=/i, `${page} does not fork header layout inline`);
    assert.match(header, /<a class="tl-app-brand" href="\.\/index\.html"[^>]*>/i, `${page} links the brand to Armory`);
    assert.match(header, /class="tl-app-brand-mark"/i, `${page} uses the shared image mark`);
    assert.match(header, /class="tl-app-brand-title">TL HELPER</i, `${page} keeps the common brand title`);
    assert.match(header, /class="tl-app-header-end(?: [^"]+)?"/i, `${page} reserves the shared end slot`);
    assert.deepEqual(links, expectedNavigation, `${page} keeps navigation order and destinations`);

    const activeLinks = [...nav.matchAll(/<a class="tl-app-nav-item is-active" href="([^"]+)" aria-current="(page|location)">([^<]+)<\/a>/gi)];
    assert.equal(activeLinks.length, 1, `${page} has exactly one active navigation item`);
    assert.equal(activeLinks[0][1], activeHref, `${page} active navigation destination is correct`);
    assert.equal(activeLinks[0][2], page === "build-from-scratch.html" ? "location" : "page", `${page} uses the correct aria-current semantics`);
    assert.equal(activeLinks[0][3].trim(), activeLabel, `${page} active navigation label is correct`);
    assert.match(html, /<link rel="icon" href="\.\/tl-logo\.png" type="image\/png">/i, `${page} uses the TL monogram favicon`);
    assert.ok(html.includes(`<title>${title}</title>`), `${page} aligns its document title with the product navigation`);
    if (socialTitles.has(page)) {
      assert.ok(html.includes(`<meta property="og:title" content="${socialTitles.get(page)}">`), `${page} aligns its social title with the product navigation`);
    }
    assert.match(html, new RegExp(`<link\\b[^>]*href=["']\\./tl-shell\\.css\\?v=${assetVersion}["'][^>]*>`, "i"), `${page} uses the shared asset release version`);
  }
});

test("versioned local styles and scripts use one release identifier", async () => {
  for (const [page] of pages) {
    const html = await load(page);
    const resources = [...html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)=["'](\.\/(?:tl-shell\.css|support\.js|combat-lab\.(?:css|js))\?v=([^"']+))["'][^>]*>/gi)];
    assert.ok(resources.length > 0, `${page} has at least one versioned local style or script`);
    assert.deepEqual([...new Set(resources.map((match) => match[2]))], [assetVersion], `${page} does not carry one-off cache versions`);
  }
});

test("public pages use one generated design-component runtime", async () => {
  await assert.rejects(access(new URL("../../web/tl-builder-support.js", import.meta.url)));
  for (const page of ["index.html", "tracker.html", "achievements.html", "build-from-scratch.html"]) {
    assert.match(await load(page), /<script src="\.\/support\.js\?v=20260713"><\/script>/i, `${page} uses the canonical runtime`);
  }
});

test("shared shell owns the logo and responsive header behaviour", async () => {
  const css = await load("tl-shell.css");
  assert.match(css, /background:\s*url\("\.\/tl-logo\.png"\) center \/ contain no-repeat/);
  assert.match(css, /@media \(max-width: 1000px\)[\s\S]*?\.tl-app-nav\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?overflow-x:\s*auto;/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.tl-app-header-end\s*\{[\s\S]*?grid-row:\s*2;/);
  await access(new URL("../../web/tl-logo.png", import.meta.url));
});
