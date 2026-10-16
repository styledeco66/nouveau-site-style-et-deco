import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Lot 1 (audit) : en-tête, navigation, menu mobile et pied de page communs à toutes les pages publiques ;
// champs de formulaire lisibles sur iPhone ; logo qui ne rétrécit plus.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sitesite-template");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const css = read("assets/css/style.css");

const PAGES = [
  "index.html",
  "peintre-saint-cyprien/index.html",
  "perpignan.html",
  "facade-saint-cyprien/index.html",
  "realisations/index.html",
  "realisations/ravalement-facade-immeuble-perpignan/index.html",
  "legal/mentions-legales.html",
  "legal/politique-confidentialite.html",
];
const hrefs = (html, re) => [...html.match(re)[0].matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
const labels = (html, re) => [...html.match(re)[0].matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
const NAV = /<nav class="nav"[\s\S]*?<\/nav>/;
const MOBILE = /<nav class="mobileMenu"[\s\S]*?<\/nav>/;
const FOOTER = /<footer[\s\S]*?<\/footer>/;

test("mêmes entrées de navigation (en-tête et menu mobile) sur toutes les pages", () => {
  const expected = ["Services", "Réalisations", "Saint-Cyprien", "Perpignan", "Façades", "FAQ", "Contact"];
  for (const f of PAGES) {
    const html = read(f);
    assert.deepEqual(labels(html, NAV), expected, `${f} (en-tête)`);
    assert.deepEqual(labels(html, MOBILE), expected, `${f} (menu mobile)`);
  }
});

test("« Réalisations » mène à la page /realisations/ et les pages de service à leurs URL canoniques", () => {
  for (const f of PAGES) {
    const h = hrefs(read(f), NAV);
    assert.equal(h[1], "/realisations/", f);
    assert.equal(h[2], "/peintre-saint-cyprien/", f);
    assert.equal(h[3], "/perpignan.html", f);
    assert.equal(h[4], "/facade-saint-cyprien/", f);
  }
});

test("pied de page identique, avec Mentions légales et Confidentialité, sur toutes les pages", () => {
  const norm = (f) => read(f).match(FOOTER)[0].replace(/href="(#contact)"/, 'href="DEVIS"').replace(/href="\/#contact"/, 'href="DEVIS"');
  const ref = norm(PAGES[0]);
  for (const f of PAGES) {
    assert.equal(norm(f), ref, f);
    const h = hrefs(read(f), FOOTER);
    assert.ok(h.includes("/legal/mentions-legales.html") && h.includes("/legal/politique-confidentialite.html"), f);
  }
});

test("chaque page courante est signalée par aria-current dans l'en-tête", () => {
  const cur = (f) => (read(f).match(NAV)[0].match(/<a [^>]*aria-current="page"[^>]*>([^<]+)</) || [])[1];
  assert.equal(cur("index.html"), undefined);
  assert.equal(cur("perpignan.html"), "Perpignan");
  assert.equal(cur("peintre-saint-cyprien/index.html"), "Saint-Cyprien");
  assert.equal(cur("facade-saint-cyprien/index.html"), "Façades");
  assert.equal(cur("realisations/index.html"), "Réalisations");
  assert.equal(cur("legal/mentions-legales.html"), undefined);
});

test("les pages légales chargent le script du menu (menu mobile fonctionnel)", () => {
  for (const f of ["legal/mentions-legales.html", "legal/politique-confidentialite.html"]) {
    assert.match(read(f), /<script src="\.\.\/assets\/js\/app\.js\?v=[0-9a-f]{10}"><\/script>/, f);
  }
});

test("le logo ne peut plus être écrasé par la navigation et la barre complète n'apparaît qu'à partir de 1100 px", () => {
  assert.match(css, /\.brand\{[^}]*flex: 0 0 auto;/);
  assert.match(css, /@media \(min-width: 721px\) and \(max-width: 1099px\)\{\s*\.nav,\s*\.hide-sm,\s*\.header__actions\{ display: none; \}/);
  assert.match(read("assets/js/app.js"), /\(max-width: 1099px\)/);
});

test("champs de formulaire : police du site et taille ≥ 16 px (pas de zoom automatique sur iPhone)", () => {
  const rule = css.match(/\ninput, select, textarea\{([^}]*)\}/)[1];
  assert.match(rule, /font-family: inherit;/);
  assert.match(rule, /font-size: 16px;/);
  assert.match(css, /\.form__grid \+ \.js-form-submit\{ margin-top: 16px; \}/);
});

test("accueil mobile : aucun texte courant sous 13 px dans les blocs corrigés", () => {
  const mobile = css.slice(css.indexOf("@media (max-width: 720px){"));
  for (const sel of ["#services .section__head p", "#services .card p", "#services .list--checks li", ".hero__meta span"]) {
    const m = mobile.match(new RegExp(sel.replace(/[.#]/g, "\\$&") + "\\{[^}]*font-size: ([\\d.]+)px"));
    assert.ok(m && Number(m[1]) >= 12.5, `${sel} : ${m && m[1]} px`);
  }
  assert.match(mobile, /#services \.section__head p\{[^}]*font-size: 14px/);
  assert.match(mobile, /#services \.card p\{[^}]*font-size: 14px/);
});
