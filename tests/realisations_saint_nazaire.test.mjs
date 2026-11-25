import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Fiche « peinture express » d'un local commercial à Saint-Nazaire : référencement, images et liens.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "sitesite-template");
const read = (f) => readFileSync(path.join(SITE, f), "utf8");
const SLUG = "peinture-express-local-commercial-saint-nazaire";
const URL_FICHE = `https://styleetdeco.fr/realisations/${SLUG}/`;
const decode = (t) => t.replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'");

test("Saint-Nazaire : title, description, canonique, un seul H1 et balisage valide", () => {
  const html = read(`realisations/${SLUG}/index.html`);
  const title = decode(html.match(/<title>([\s\S]*?)<\/title>/)[1]);
  const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)[1]);
  assert.ok(title.length >= 30 && title.length <= 70, `title : ${title.length} signes`);
  assert.ok(desc.length >= 80 && desc.length <= 165, `description : ${desc.length} signes`);
  assert.ok(title.includes("Saint-Nazaire") && desc.includes("Saint-Nazaire"));
  assert.equal(html.match(/<link rel="canonical" href="([^"]+)"/)[1], URL_FICHE);
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];
  assert.equal(graph.find((n) => n["@type"] === "WebPage").url, URL_FICHE);
  assert.doesNotMatch(html, /Nicolas|finition nette|coupes? nettes?|impeccable/i);
});

test("Saint-Nazaire : images présentes avec textes alternatifs utiles, paires avant / après complètes", () => {
  const html = read(`realisations/${SLUG}/index.html`);
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((t) => t.includes("/peinture-local-saint-nazaire/"));
  assert.ok(imgs.length >= 16, `${imgs.length} images`);
  for (const tag of imgs) {
    const src = tag.match(/src="([^"]+)"/)[1];
    assert.ok(existsSync(path.join(SITE, "realisations", SLUG, src)), src);
    const alt = tag.match(/alt="([^"]*)"/)[1];
    if (alt) assert.ok(alt.length >= 30 && alt.length <= 200, `alt de ${src} : ${alt.length} signes`);
  }
  const paires = [...html.matchAll(/<figure class="avap__paire">[\s\S]*?<\/figure>/g)].map((m) => m[0]);
  assert.equal(paires.length, 3);
  for (const p of paires) {
    assert.match(p, /avant-\w+-960\.webp[\s\S]*>Avant<[\s\S]*apres-\w+-960\.webp[\s\S]*>Après</);
  }
});

test("Saint-Nazaire : dans le plan du site et la galerie", () => {
  assert.ok(read("sitemap.xml").includes(`<loc>${URL_FICHE}</loc>`));
  assert.ok(read("realisations/index.html").includes(`href="/realisations/${SLUG}/"`));
});

test("la carte « Peinture intérieure » de l'accueil mène au chantier de Saint-Nazaire et garde le lien Saint-Cyprien", () => {
  const home = read("index.html");
  const debut = home.indexOf("<h3>Peinture intérieure</h3>");
  const carte = home.slice(debut, home.indexOf("</article>", debut));
  assert.match(carte, new RegExp(`<a class="lien" href="/realisations/${SLUG}/">Voir un chantier</a>`));
  assert.match(carte, /<a class="lien" href="\/peintre-saint-cyprien\/">Peinture intérieure à Saint-Cyprien<\/a>/);
});

test("défilé de photos : Saint-Nazaire et Estagel y figurent, le grand local une seule fois, avec une copie masquée pour la boucle (Perpignan gelée)", () => {
  for (const page of ["index.html", "peintre-saint-cyprien/index.html", "facade-saint-cyprien/index.html", "realisations/index.html"]) {
    const html = read(page);
    const debut = html.indexOf('<div class="piste piste--longue">');
    assert.ok(debut > 0, page);
    const piste = html.slice(debut, html.indexOf("</div>", debut));
    const figures = [...piste.matchAll(/<figure( aria-hidden="true")?><img[^>]*src="([^"]+)"/g)];
    const visibles = figures.filter((f) => !f[1]).map((f) => f[2]);
    const copies = figures.filter((f) => f[1]).map((f) => f[2]);
    assert.equal(visibles.length, 11, page);
    assert.deepEqual(copies, visibles, `${page} : copie identique`);
    for (const dossier of ["peinture-local-saint-nazaire", "sol-maison-estagel"]) {
      assert.ok(visibles.some((s) => s.includes(dossier)), `${page} : ${dossier}`);
    }
    assert.doesNotMatch(piste, /Sol aspect parquet, Perpignan/, page);
    for (const src of visibles) assert.ok(existsSync(path.join(SITE, path.dirname(page), src)), `${page} : ${src}`);
  }
});
