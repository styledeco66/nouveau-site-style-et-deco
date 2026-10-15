// Lot 3A (corrections visuelles) : en-têtes de section en pile verticale et voile lisible sur le bandeau Façades.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const page = (p) => readFileSync(fileURLToPath(new URL(`../sitesite-template/${p}`, import.meta.url)), "utf8");
const pages = ["facade-saint-cyprien/index.html", "peintre-saint-cyprien/index.html"];

test("pages locales : titre de section au-dessus du paragraphe (plus de colonnes latérales)", () => {
  for (const p of pages) {
    const css = page(p);
    const rule = css.match(/\.local-page \.section__head \{([^}]*)\}/)[1];
    assert.match(rule, /display:\s*block/, p);
    assert.match(rule, /max-width:\s*none/, p);
  }
});

test("bandeau Façades : voile sombre renforcé (la règle globale .section::before ne l'annule plus)", () => {
  const html = page("facade-saint-cyprien/index.html");
  assert.match(html, /\.section\.local-page-hero::before\s*\{[^}]*height:\s*auto;[^}]*transform:\s*none/s);
  assert.match(html, /text-shadow/);
  assert.match(html, /banniere-facade\.webp/, "la photographie n'est pas remplacée");
  assert.match(html, /banniere-facade-900\.webp/);
});

test("pages locales : structure Hn et textes inchangés (1 h1, mêmes h2)", () => {
  for (const p of pages) {
    const html = page(p);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, p);
    assert.ok((html.match(/<h2\b/g) || []).length >= 6, p);
  }
});

test("tablette 721–980 px : menu compact (plus de barre complète qui déborde) et menu ouvert sous l'en-tête", () => {
  const css = readFileSync(fileURLToPath(new URL("../sitesite-template/assets/css/style.css", import.meta.url)), "utf8");
  const block = css.match(/@media \(min-width: 721px\) and \(max-width: 980px\)\{([\s\S]*?)\n\}\n/)[1];
  assert.match(block, /\.header__actions\{ display: none; \}/);
  assert.match(block, /\.mobileMenuToggle\{ display: inline-flex; \}/);
  assert.match(block, /top: var\(--mobile-menu-top, 140px\)/);
  assert.ok(!/top: 58px/.test(css), "plus de position fixe sous l'en-tête");
  const js = readFileSync(fileURLToPath(new URL("../sitesite-template/assets/js/app.js", import.meta.url)), "utf8");
  assert.match(js, /\(max-width: 980px\)/);
});

test("menu mobile : position calculée sur la hauteur réelle de l'en-tête, Échap et clic sur lien conservés", () => {
  const js = readFileSync(fileURLToPath(new URL("../sitesite-template/assets/js/app.js", import.meta.url)), "utf8");
  assert.match(js, /--mobile-menu-top/);
  assert.match(js, /header\.getBoundingClientRect\(\)\.bottom/);
  assert.match(js, /orientationchange/);
  assert.match(js, /event\.key === "Escape"/);
  assert.match(js, /link\.addEventListener\("click", closeMenu\)/);
});
