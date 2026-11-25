// Cohérence des formulaires du site refondu : mêmes champs, mêmes intitulés, mêmes mécanismes (devis / rappel) et même
// protection invisible sur toutes les pages ; seule l'origine (nom du formulaire) change.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const SITE = fileURLToPath(new URL("../sitesite-template", import.meta.url));
const read = (p) => readFileSync(join(SITE, p), "utf8");
const forms = (html) => [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]);
const PAGES = ["index.html", "peintre-saint-cyprien/index.html", "facade-saint-cyprien/index.html", "perpignan.html", "realisations/index.html"];

// Empreinte structurelle d'un formulaire : champs (type, nom, exemple, saisie automatique, obligatoire) et mécanismes de mode.
const shape = (f) => ({
  controls: [...f.matchAll(/<(input|textarea|button)\b([^>]*)>/g)]
    .map((m) => {
      const g = (n) => (m[2].match(new RegExp(`\\b${n}="([^"]*)"`)) || [])[1] || "";
      return [m[1], g("type"), g("name"), g("placeholder"), g("autocomplete"), /\brequired\b/.test(m[2]) ? "req" : ""].join("|");
    })
    .filter((c) => !/form-name|name\|city\|/.test(c)),
  hooks: [...new Set([...f.matchAll(/\b(js-[a-z0-9-]+)/g)].map((m) => m[1]))].sort(),
  labels: [...f.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]),
});

test("le formulaire de contact est identique sur toutes les pages (champs, intitulés, modes rappel/devis)", () => {
  const reference = shape(forms(read("index.html")).find((f) => /name="lead_contact"/.test(f)));
  for (const page of PAGES.slice(1)) {
    const contact = forms(read(page)).find((f) => /class="js-lead-form"(?![^>]*data-fixed-mode)/.test(f));
    assert.ok(contact, `${page} : formulaire de contact`);
    assert.deepEqual(shape(contact), reference, page);
  }
});

test("les formulaires de rappel (carte du héros, fenêtre d'appel) restent en mode rappel avec nom et téléphone seulement", () => {
  for (const page of PAGES) {
    const fixed = forms(read(page)).filter((f) => /data-fixed-mode="callback"/.test(f));
    assert.ok(fixed.length >= 2, `${page} : carte de rappel et fenêtre`);
    for (const f of fixed) {
      assert.match(f, /name="lead_priority" value="RAPPEL_30_MIN"/);
      assert.deepEqual(
        [...f.matchAll(/<input\b[^>]*name="([a-z_-]+)"/g)].map((m) => m[1]).filter((n) => !["form-name", "subject", "lead_priority", "bot-field"].includes(n)),
        ["name", "phone"]
      );
    }
  }
});

test("Perpignan : ville préremplie « Perpignan », modifiable ; pas de champ « Type de travaux »", () => {
  const html = read("perpignan.html");
  const city = html.match(/<input[^>]*name="city"[^>]*>/)[0];
  assert.match(city, /value="Perpignan"/);
  assert.ok(!/readonly|disabled/.test(city));
  assert.ok(!html.includes("Type de travaux"));
  assert.match(html, /name="lead_perpignan"/);
});

test("même champ piège invisible partout (hors écran, aria-hidden, hors tabulation, nom bot-field) ; une seule implémentation d'envoi", () => {
  for (const page of PAGES) {
    for (const f of forms(read(page))) {
      assert.match(f, /<p class="hp-field" aria-hidden="true">[\s\S]*?<input name="bot-field" tabindex="-1" autocomplete="off">/);
      assert.ok(!f.includes("display:none"));
      assert.match(f, /method="POST" action="\/\.netlify\/functions\/lead"/);
    }
  }
  assert.match(read("assets/css/style.css"), /\.hp-field\{[^}]*left:-9999px/);
  assert.ok(!read("assets/js/lead-form.js").includes("form_started"), "aucun critère de vitesse");
  assert.ok(!/fetch\(/.test(read("assets/js/app.js")), "app.js ne contient aucun envoi : tout passe par lead-form.js");
});
