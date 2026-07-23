import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const pages = [
  ["index.html", "./index.html", "Armory", "Armory | TL Helper"],
  ["tracker.html", "./tracker.html", "Tracker", "Tracker | TL Helper"],
  ["achievements.html", "./achievements.html", "Achievements", "Achievements | TL Helper"],
  // combat-lab.html is intentionally unlisted: it keeps the shared header but
  // has no navigation entry, so combat-lab-navigation.test.mjs covers it.
  ["gear-viewer.html", "./gear-viewer.html", "Gear Viewer", "Gear Viewer | TL Helper"],
  ["full-build-optimizer.html", "./full-build-optimizer.html", "Build Optimizer", "Build Optimizer | TL Helper"],
  ["build-from-scratch.html", "./full-build-optimizer.html", "Build Optimizer", "Build Optimizer: Build from Scratch | TL Helper"],
  ["privacy.html", null, null, "Privacy | TL Helper"],
];

const assetVersion = "20260713";

const socialTitles = new Map([
  ["index.html", "Armory | TL Helper"],
  ["tracker.html", "Tracker | TL Helper"],
  ["achievements.html", "Achievements | TL Helper"],
  ["gear-viewer.html", "Gear Viewer | TL Helper"],
  ["privacy.html", "Privacy | TL Helper"],
]);

const expectedNavigation = [
  ["./index.html", "Armory"],
  ["./tracker.html", "Tracker"],
  ["./achievements.html", "Achievements"],
  ["./gear-viewer.html", "Gear Viewer"],
  ["./full-build-optimizer.html", "Build Optimizer"],
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
    if (activeHref) {
      assert.equal(activeLinks.length, 1, `${page} has exactly one active navigation item`);
      assert.equal(activeLinks[0][1], activeHref, `${page} active navigation destination is correct`);
      assert.equal(activeLinks[0][2], page === "build-from-scratch.html" ? "location" : "page", `${page} uses the correct aria-current semantics`);
      assert.equal(activeLinks[0][3].trim(), activeLabel, `${page} active navigation label is correct`);
    } else {
      assert.equal(activeLinks.length, 0, `${page} does not promote a utility page in product navigation`);
    }
    assert.match(html, /<link rel="icon" href="\.\/tl-logo\.png" type="image\/png">/i, `${page} uses the TL monogram favicon`);
    assert.ok(html.includes(`<title>${title}</title>`), `${page} aligns its document title with the product navigation`);
    if (socialTitles.has(page)) {
      assert.ok(html.includes(`<meta property="og:title" content="${socialTitles.get(page)}">`), `${page} aligns its social title with the product navigation`);
      assert.ok(html.includes('<meta property="og:image" content="https://tlhelper.org/tl-logo.png">'), `${page} publishes the shared Open Graph preview image`);
      assert.ok(html.includes('<meta name="twitter:image" content="https://tlhelper.org/tl-logo.png">'), `${page} publishes the shared Twitter preview image`);
    }
    assert.match(html, new RegExp(`<link\\b[^>]*href=["']\\./tl-shell\\.css\\?v=${assetVersion}["'][^>]*>`, "i"), `${page} uses the shared asset release version`);
  }
});

test("privacy is available in the shared footer instead of primary navigation", async () => {
  for (const page of [...pages.map(([name]) => name), "combat-lab.html"]) {
    const html = await load(page);
    const header = html.match(/<header class="tl-app-header(?: [^"]+)?">[\s\S]*?<\/header>/i)?.[0] ?? "";
    const footer = html.match(/<footer class="tl-app-footer">[\s\S]*?<\/footer>/i)?.[0] ?? "";

    assert.doesNotMatch(header, /href="\.\/privacy\.html"/i, `${page} keeps Privacy out of primary navigation`);
    assert.ok(footer, `${page} includes the shared utility footer`);
    assert.match(footer, /TL Helper is an independent fan project/i, `${page} identifies the project in its footer`);
    if (page === "privacy.html") {
      assert.match(footer, /class="tl-app-footer-current" aria-current="page">Privacy<\/span>/i, "Privacy marks its footer destination as current");
    } else {
      assert.match(footer, /<a href="\.\/privacy\.html">Privacy<\/a>/i, `${page} links to Privacy from the footer`);
    }
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

test("design-component runtime prefers same-origin vendored React and falls back to the pinned CDN", async () => {
  const runtime = await load("support.js");
  for (const vendored of ["./vendor/react/react.production.min.js", "./vendor/react/react-dom.production.min.js", "./vendor/babel/babel.min.js"]) {
    assert.ok(runtime.includes(`"${vendored}"`), `support.js loads the vendored ${vendored}`);
    await access(new URL(`../../web/${vendored.slice(2)}`, import.meta.url));
  }
  const pinnedSri = [
    "sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z",
    "sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1",
    "sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y",
  ];
  for (const sri of pinnedSri) assert.ok(runtime.includes(sri), "pinned CDN fallbacks keep their SRI hashes");
  assert.match(runtime, /unpkg\.com\/react@18\.3\.1/, "support.js keeps the pinned CDN fallback for React");
  assert.match(runtime, /renderBootFailure/, "support.js surfaces a visible boot failure instead of a blank page");
});

test("shared shell owns the logo and responsive header behaviour", async () => {
  const css = await load("tl-shell.css");
  assert.match(css, /background:\s*url\("\.\/tl-logo\.png"\) center \/ contain no-repeat/);
  assert.match(css, /\.tl-app-footer\s*\{[\s\S]*?border-top:/, "shared shell styles the utility footer");
  assert.match(css, /\.tl-app-footer-inner\s*\{[\s\S]*?justify-content:\s*space-between;/, "shared footer separates project context from utility navigation");
  assert.match(css, /@media \(max-width: 1000px\)[\s\S]*?\.tl-app-nav\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?overflow-x:\s*auto;/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.tl-app-header-end\s*\{[\s\S]*?grid-row:\s*2;/);
  await access(new URL("../../web/tl-logo.png", import.meta.url));
});
