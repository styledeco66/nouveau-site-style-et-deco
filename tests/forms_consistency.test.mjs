// Cohérence des formulaires : le formulaire de l'accueil est la référence ; Perpignan reprend les mêmes champs,
// intitulés, exemples, mécanismes (devis / rappel) et la même protection invisible.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const SITE = fileURLToPath(new URL("../sitesite-template", import.meta.url));
const read = (p) => readFileSync(join(SITE, p), "utf8");
const form = (html, name) => html.match(new RegExp(`<form[^>]*name="${name}"[\\s\\S]*?</form>`))[0];
const hero = form(read("index.html"), "lead_hero");
const perpignan = form(read("perpignan.html"), "lead_perpignan");
const contact = form(read("index.html"), "lead_contact");

// Empreinte structurelle : champs (nom, type, placeholder, autocomplete, required), classes de mode et boutons, hors valeur des champs cachés propres à la page.
const shape = (f) => ({
  controls: [...f.matchAll(/<(input|textarea|button)\b([^>]*)>/g)].map((m) => {
    const a = m[2];
    const g = (n) => (a.match(new RegExp(`\\b${n}="([^"]*)"`)) || [])[1] || "";
    return [m[1], g("type"), g("name"), g("placeholder"), g("autocomplete"), /\brequired\b/.test(a) ? "req" : "", g("data-label-devis")].join("|");
  }),
  hooks: [...new Set([...f.matchAll(/\b(js-[a-z0-9-]+)/g)].map((m) => m[1]))].sort(),
  labels: [...f.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]),
  texts: [...f.matchAll(/data-(?:title|intro)-(?:devis|callback)="([^"]+)"/g)].map((m) => m[1]),
});

test("formulaire de Perpignan = formulaire de référence de l'accueil (champs, intitulés, exemples, modes)", () => {
  const a = shape(hero), b = shape(perpignan);
  const strip = (arr) => arr.filter((c) => !/name\|city\|/.test(c) && !c.startsWith("input|hidden|form-name"));
  assert.deepEqual(strip(b.controls), strip(a.controls));
  assert.deepEqual(b.hooks, a.hooks);
  assert.deepEqual(b.labels, a.labels);
  assert.deepEqual(b.texts, a.texts);
});

test("Perpignan : ville préremplie « Perpignan », modifiable ; plus de champ « Type de travaux »", () => {
  assert.match(perpignan, /<input type="text" name="city" value="Perpignan"/);
  assert.ok(!/readonly|disabled/.test(perpignan.match(/<input[^>]*name="city"[^>]*>/)[0]));
  assert.ok(!perpignan.includes("Type de travaux"));
  assert.match(perpignan, /name="lead_priority" value="STANDARD"/);
});

test("les trois formulaires ont le même honeypot invisible : hors écran, aria-hidden, hors tabulation, nom bot-field", () => {
  for (const f of [hero, contact, perpignan]) {
    assert.match(f, /<p class="hp-field" aria-hidden="true">[\s\S]*?<input name="bot-field" tabindex="-1" autocomplete="off" \/>/);
    assert.ok(!f.includes("display:none"));
  }
  const css = read("assets/css/style.css");
  assert.match(css, /\.hp-field\{[^}]*left: -10000px/);
});

test("tous les formulaires s'envoient à la même function, avec le même script (aucune implémentation indépendante)", () => {
  for (const f of [hero, contact, perpignan]) assert.match(f, /method="POST" action="\/\.netlify\/functions\/lead"/);
  for (const page of ["index.html", "perpignan.html"]) assert.match(read(page), /assets\/js\/lead-form\.js\?v=[0-9a-f]{10}|assets\/js\/app\.js/);
  assert.ok(!read("assets/js/lead-form.js").includes("form_started"), "aucun critère de vitesse");
});
