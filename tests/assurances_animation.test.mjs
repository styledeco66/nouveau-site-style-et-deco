import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Section Assurances : animations ajoutées par le script, sans toucher au texte des pages.

const SITE = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "sitesite-template");
const read = (f) => readFileSync(path.join(SITE, f), "utf8");

test("le titre des assurances reste du texte simple dans les pages (le surlignage est ajouté par le script)", () => {
  for (const page of ["index.html", "peintre-saint-cyprien/index.html", "facade-saint-cyprien/index.html", "perpignan.html"]) {
    assert.match(read(page), /<h2 class="d" id="titre-assurances">Assurés, et nous vous le prouvons<\/h2>/, page);
  }
});

test("animations : désactivées si mouvement réduit, page Perpignan exclue, pause hors écran", () => {
  const js = read("assets/js/app.js");
  assert.match(js, /if \(assur && !reduit && "IntersectionObserver" in window && !\/\\\/perpignan/);
  assert.match(js, /classList\.toggle\("en-pause", !visible\)/);
  const css = read("assets/css/style.css");
  assert.match(css, /\.dossier\.is-anime \.feuille--rc\{animation:feuille-rc 8s/);
  assert.match(css, /\.dossier\.en-pause[^{]*\{animation-play-state:paused!important\}/);
});

test("le filtre « Perpignan » reconnaît ses adresses et elles seules", () => {
  const motif = /\/perpignan(\.html)?\/?$/;
  for (const oui of ["/perpignan.html", "/perpignan"]) assert.match(oui, motif);
  for (const non of ["/", "/peintre-saint-cyprien/", "/facade-saint-cyprien/", "/realisations/ravalement-facade-immeuble-perpignan/"]) assert.doesNotMatch(non, motif);
});
