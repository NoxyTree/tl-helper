import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("Cloudflare Pages serves the web app and production domain", async () => {
  const config = await read("wrangler.toml");
  assert.match(config, /pages_build_output_dir\s*=\s*"\.\/web"/);
  assert.match(config, /https:\/\/tlhelper\.org/);
});

test("Vercel serves the static web directory without invoking Vite", async () => {
  const config = JSON.parse(await read("vercel.json"));
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, null);
  assert.equal(config.outputDirectory, "web");
  const handler = await read("api/questlog/character.js");
  assert.match(handler, /export default async function handler/);
  assert.match(handler, /ALLOWED_HOSTS/);
  assert.match(handler, /CACHE_TTL_MS = 300_000/);
});

test("hosted Questlog adapter preserves the local adapter safety boundary", async () => {
  const worker = await read("functions/api/questlog/character.js");
  assert.match(worker, /ALLOWED_HOSTS/);
  assert.match(worker, /url\.protocol !== "https:"/);
  assert.match(worker, /MAX_RESPONSE_BYTES = 8_000_000/);
  assert.match(worker, /cacheControl = "no-store"/);
  assert.match(worker, /caches\.default/);
  assert.match(worker, /canonical\.searchParams\.set\("buildId"/);
  assert.doesNotMatch(worker, /service[_-]?role/i);
});

test("both deployment targets expose the bounded market adapter", async () => {
  const vercel = await read("api/market/prices.js");
  const cloudflare = await read("functions/api/market/prices.js");
  const shared = await read("packages/market-data/tldb-market.mjs");
  assert.match(vercel, /createTldbMarketService/);
  assert.match(cloudflare, /createTldbMarketService/);
  assert.match(shared, /MAX_RESPONSE_BYTES = 2_000_000/);
  assert.match(shared, /STALE_TTL_MS/);
  assert.match(shared, /"20005"/);
  assert.match(shared, /"50005"/);
  assert.match(shared, /"60005"/);
  assert.doesNotMatch(shared, /cookie|authorization/i);
});

test("production headers protect documents without freezing stable projection names", async () => {
  const headers = await read("web/_headers");
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /\/data\/projections\/\*/);
  assert.match(headers, /\/data\/projections\/\*[\s\S]*max-age=300, must-revalidate/);
});

test("direct-upload artifact contains every projected icon", async () => {
  const dataRoot = new URL("../../web/data/", import.meta.url);
  const webRoot = new URL("../../web/", import.meta.url);
  const queue = [dataRoot];
  const references = new Set();
  while (queue.length) {
    const directory = queue.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) queue.push(target);
      else if (entry.name.endsWith(".json")) {
        const source = await readFile(target, "utf8");
        for (const match of source.matchAll(/assets\/icons\/[A-Za-z0-9_./-]+\.(?:png|webp)/g)) references.add(match[0]);
      }
    }
  }
  assert.ok(references.size > 2500, `expected the complete icon inventory, got ${references.size}`);
  const missing = [];
  for (const reference of references) {
    try { await access(new URL(reference, webRoot)); }
    catch { missing.push(path.posix.normalize(reference)); }
  }
  assert.deepEqual(missing, []);
});

test("public privacy notice covers local storage, Questlog, and fan-site status", async () => {
  const privacy = await read("web/privacy.html");
  assert.match(privacy, /stored in your browser on your device/i);
  assert.match(privacy, /Questlog/i);
  assert.match(privacy, /unofficial community fan project/i);
});

test("public pages expose production discovery and accessibility metadata", async () => {
  const pages = [
    ["web/index.html", "https://tlhelper.org/"],
    ["web/tracker.html", "https://tlhelper.org/tracker"],
    ["web/achievements.html", "https://tlhelper.org/achievements"],
    ["web/privacy.html", "https://tlhelper.org/privacy"],
  ];
  for (const [file, canonical] of pages) {
    const document = await read(file);
    assert.match(document, /<html lang="en">/i, `${file} declares its language`);
    assert.match(document, /<meta name="description"/i, `${file} has a description`);
    assert.ok(document.includes(`<link rel="canonical" href="${canonical}">`), `${file} has its canonical URL`);
    assert.match(document, /<link rel="icon" href="\.\/tl-logo\.png"/i, `${file} has a favicon`);
    assert.match(document, /class="tl-skip-link"[^>]*href="#main-content"/i, `${file} has a skip link`);
    assert.match(document, /<main[^>]*id="main-content"/i, `${file} exposes the main landmark`);
    assert.match(document, /<h1\b/i, `${file} has a primary heading`);
    assert.match(document, /html\{background:#0c0a07;color-scheme:dark\}/i, `${file} paints a dark canvas before scripts and styles load`);
    assert.match(document, /@view-transition\{navigation:auto\}/i, `${file} opts into seamless cross-page transitions`);
  }
});

test("search discovery files publish only the clean production pages", async () => {
  const robots = await read("web/robots.txt");
  const sitemap = await read("web/sitemap.xml");
  assert.match(robots, /Sitemap: https:\/\/tlhelper\.org\/sitemap\.xml/);
  assert.match(robots, /Disallow: \/api\//);
  for (const route of ["/", "/tracker", "/achievements", "/privacy"]) {
    assert.ok(sitemap.includes(`<loc>https://tlhelper.org${route}</loc>`), `sitemap includes ${route}`);
  }
  assert.ok(!sitemap.includes("/combat-lab"), "sitemap excludes hidden Combat Lab");
  assert.match(robots, /Disallow: \/combat-lab/);
});

test("production routes keep Combat Lab out of the public release surface", async () => {
  const redirects = await read("web/_redirects");
  const headers = await read("web/_headers");
  const vercel = JSON.parse(await read("vercel.json"));
  const combatLab = await read("web/combat-lab.html");
  const cloudflareRoute = await read("functions/combat-lab.js");

  assert.match(redirects, /^\/combat-lab \/ 302$/m);
  assert.match(redirects, /^\/combat-lab\.html \/ 302$/m);
  assert.match(headers, /^\/combat-lab\*\s+[\s\S]*?X-Robots-Tag: noindex, nofollow/m);
  assert.match(combatLab, /<meta name="robots" content="noindex, nofollow">/i);
  assert.match(cloudflareRoute, /Response\.redirect\(new URL\("\/", request\.url\), 302\)/);
  assert.deepEqual(
    vercel.redirects.filter(({ source }) => source.startsWith("/combat-lab")),
    [
      { source: "/combat-lab", destination: "/", permanent: false },
      { source: "/combat-lab.html", destination: "/", permanent: false },
    ],
  );
});

test("standalone pages use the shared application header", async () => {
  for (const file of ["web/tracker.html", "web/achievements.html", "web/combat-lab.html", "web/privacy.html"]) {
    const document = await read(file);
    assert.match(document, /<header class="tl-app-header">/i, `${file} uses the shared header`);
    assert.match(document, /<nav class="tl-app-nav"/i, `${file} uses the shared navigation`);
    assert.match(document, /class="tl-app-brand"/i, `${file} uses the shared brand`);
  }
  const shell = await read("web/tl-shell.css");
  assert.match(shell, /view-transition-name:\s*tl-app-logo/);
  assert.match(shell, /::view-transition-new\(tl-app-logo\)\s*\{\s*opacity:\s*0/);
});
