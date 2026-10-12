import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fingerprint, HASH_LENGTH, run } from "../scripts/asset-versions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "sitesite-template");

// Copie du site sans les images (inutiles ici) pour pouvoir modifier librement.
const copySite = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "asset-versions-"));
  const site = path.join(dir, "site");
  cpSync(SITE, site, { recursive: true, filter: (source) => !source.includes(`${path.sep}assets${path.sep}images`) });
  return { dir, site };
};
const withSite = (callback) => {
  const { dir, site } = copySite();
  try {
    return callback(site);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const htmlFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(full);
    return entry.name.endsWith(".html") ? [full] : [];
  });
const read = (file) => readFileSync(file, "utf8");

test("le site publié est à jour : toutes les références portent l'empreinte actuelle", () => {
  const result = run({ siteRoot: SITE });
  assert.deepEqual(result.problems, []);
  assert.ok(result.references >= 14, "les références CSS/JS des pages doivent être vérifiées");
  assert.deepEqual(result.unreferenced, [], "aucun fichier CSS/JS ne doit rester sans référence");
});

test("chaque page qui charge du CSS/JS le fait avec ?v=<empreinte du fichier>", () => {
  const pattern = /(?:href|src)=["']([^"']*assets\/(?:css|js)\/[^"'?#]+)\?v=([0-9a-f]+)["']/g;
  const bare = /(?:href|src)=["'][^"'?#]*assets\/(?:css|js)\/[^"'?#]+["']/;
  for (const page of htmlFiles(SITE)) {
    const html = read(page);
    assert.doesNotMatch(html, bare, `${path.relative(SITE, page)} : référence CSS/JS sans empreinte`);
    for (const [, reference, hash] of html.matchAll(pattern)) {
      const file = reference.startsWith("/") ? path.join(SITE, reference) : path.resolve(path.dirname(page), reference);
      assert.equal(hash, fingerprint(file), `${path.relative(SITE, page)} : ${reference}`);
      assert.equal(hash.length, HASH_LENGTH);
    }
  }
});

test("les ressources des formulaires sont couvertes (lead-form.js et app.js)", () => {
  for (const page of ["index.html", "perpignan.html"]) {
    const html = read(path.join(SITE, page));
    assert.match(html, /assets\/js\/lead-form\.js\?v=[0-9a-f]{10}/);
    assert.match(html, /assets\/js\/app\.js\?v=[0-9a-f]{10}/);
    assert.ok(html.indexOf("lead-form.js") < html.indexOf("app.js"), "ordre de chargement conservé");
  }
});

test("l'empreinte est stable sans changement de contenu, même si la date du fichier change", () => {
  withSite((site) => {
    const css = path.join(site, "assets", "css", "style.css");
    const before = fingerprint(css);
    const later = new Date(Date.now() + 86_400_000);
    utimesSync(css, later, later);
    assert.equal(fingerprint(css), before);

    const first = run({ siteRoot: site, write: true });
    assert.deepEqual(first.problems, []);
    assert.deepEqual(first.changed, [], "site déjà à jour : aucune page réécrite");
    const snapshot = htmlFiles(site).map((file) => read(file));
    run({ siteRoot: site, write: true });
    assert.deepEqual(htmlFiles(site).map((file) => read(file)), snapshot, "deuxième exécution identique");
  });
});

test("l'empreinte change quand le contenu change, et seules les pages concernées sont mises à jour", () => {
  withSite((site) => {
    const lead = path.join(site, "assets", "js", "lead-form.js");
    const css = path.join(site, "assets", "css", "style.css");
    const cssBefore = fingerprint(css);
    const leadBefore = fingerprint(lead);

    writeFileSync(lead, `${read(lead)}\n// modification\n`);
    assert.notEqual(fingerprint(lead), leadBefore);
    assert.equal(fingerprint(css), cssBefore, "un fichier inchangé garde son empreinte");

    const stale = run({ siteRoot: site });
    assert.ok(stale.problems.length > 0, "le contrôle doit échouer tant que les pages ne sont pas mises à jour");
    assert.ok(stale.problems.every((problem) => problem.includes("lead-form.js")));

    const updated = run({ siteRoot: site, write: true });
    assert.deepEqual(updated.problems, []);
    assert.deepEqual(updated.changed.sort(), ["index.html", "perpignan.html"]);
    assert.match(read(path.join(site, "index.html")), new RegExp(`lead-form\\.js\\?v=${fingerprint(lead)}`));
    assert.match(read(path.join(site, "index.html")), new RegExp(`style\\.css\\?v=${cssBefore}`));
    assert.deepEqual(run({ siteRoot: site }).problems, []);
  });
});

test("une modification de la page elle-même ne modifie pas l'empreinte des ressources", () => {
  withSite((site) => {
    const page = path.join(site, "index.html");
    const before = fingerprint(path.join(site, "assets", "js", "app.js"));
    writeFileSync(page, `${read(page)}\n<!-- note -->\n`);
    assert.equal(fingerprint(path.join(site, "assets", "js", "app.js")), before);
    assert.deepEqual(run({ siteRoot: site }).problems, []);
  });
});

test("un ancien paramètre de version (merci.html : ?v=20260604) est remplacé par l'empreinte", () => {
  withSite((site) => {
    const merci = path.join(site, "merci.html");
    writeFileSync(merci, read(merci).replace(/style\.css\?v=[0-9a-f]+/, "style.css?v=20260604"));
    assert.equal(run({ siteRoot: site }).problems.length, 1);
    run({ siteRoot: site, write: true });
    assert.match(read(merci), new RegExp(`style\\.css\\?v=${fingerprint(path.join(site, "assets", "css", "style.css"))}`));
  });
});

test("les références cassées, hors dossier ou avec un paramètre inconnu sont refusées", () => {
  withSite((site) => {
    const page = path.join(site, "index.html");
    const original = read(page);

    writeFileSync(page, original.replace("lead-form.js?v=", "absent.js?v="));
    assert.ok(run({ siteRoot: site }).problems.some((problem) => problem.includes("aucun fichier")));

    writeFileSync(page, original.replace(/style\.css\?v=[0-9a-f]+/, "style.css?autre=1"));
    assert.ok(run({ siteRoot: site }).problems.some((problem) => problem.includes("paramètre inattendu")));

    writeFileSync(page, original.replace("./assets/css/style.css", "./assets/css/../images/x.css"));
    assert.ok(run({ siteRoot: site }).problems.length > 0);
  });
});

test("les préchargements sont versionnés comme les autres références", () => {
  withSite((site) => {
    const page = path.join(site, "index.html");
    writeFileSync(page, read(page).replace("</head>", '<link rel="preload" href="./assets/css/style.css" as="style" /></head>'));
    const stale = run({ siteRoot: site });
    assert.equal(stale.problems.length, 1);
    run({ siteRoot: site, write: true });
    assert.deepEqual(run({ siteRoot: site }).problems, []);
    assert.equal((read(page).match(/style\.css\?v=/g) || []).length, 2);
  });
});

test("les imports internes à une ressource (non versionnables) sont signalés", () => {
  withSite((site) => {
    writeFileSync(path.join(site, "assets", "css", "extra.css"), '@import "style.css";\n');
    writeFileSync(path.join(site, "assets", "js", "extra.js"), 'import { x } from "./lead-form.js";\n');
    const labels = run({ siteRoot: site }).problems.join("\n");
    assert.match(labels, /extra\.css : @import/);
    assert.match(labels, /extra\.js : import … from/);
  });
});

test("le cache long ne concerne que /assets/* : les pages HTML restent revalidées", () => {
  const blocks = read(path.join(SITE, "_headers")).split(/\n(?=\S)/);
  const cacheFor = (pattern) => {
    const block = blocks.find((candidate) => candidate.split("\n")[0].trim() === pattern);
    const line = block && block.split("\n").find((entry) => /^\s*Cache-Control:/i.test(entry));
    return line ? line.split(":").slice(1).join(":").trim() : null;
  };
  assert.equal(cacheFor("/assets/*"), "public, max-age=31536000, immutable");
  assert.equal(cacheFor("/*.html"), "public, max-age=0, must-revalidate");
  assert.equal(cacheFor("/"), "public, max-age=0, must-revalidate");
  assert.equal(cacheFor("/*"), null, "la règle générale ne doit pas donner de cache long aux pages");
});
