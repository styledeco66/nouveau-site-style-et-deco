// Lot 4 (commit isolé) : rappel en un clic. Si ce commit est écarté, supprimer aussi ce fichier de test.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const SITE = fileURLToPath(new URL("../sitesite-template", import.meta.url));
const read = (p) => readFileSync(join(SITE, p), "utf8");
const HOME = "index.html";

test("rappel en un clic : tous les boutons de rappel mènent directement au formulaire (#contact), en mode rappel", () => {
  const html = read(HOME);
  const links = [...html.matchAll(/<a\b[^>]*data-form-mode-intent="callback"[^>]*>/g)].map((m) => m[0]);
  assert.equal(links.length, 3, "héros, section de rappel, barre mobile");
  for (const a of links) {
    assert.match(a, /href="#contact"/, a);
    assert.match(a, /data-rappel-intent="true"/, a);
  }
  assert.doesNotMatch(html, /href="#rappel30"/, "plus de détour par #rappel30");
  assert.match(html, /<section class="callback30" id="rappel30"/, "la section d'invitation au rappel est conservée");
  const app = read("assets/js/app.js");
  assert.match(app, /\[data-rappel-intent="true"\]\[href="#contact"\]/);
  assert.match(app, /sessionStorage\.setItem\(FORM_MODE_KEY, "callback"\);\s*applyModeToAllForms\("callback"\)/);
});

test("rappel en un clic : le bouton d'envoi reste au-dessus de la barre fixe (décalage calculé selon la barre)", () => {
  const app = read("assets/js/app.js");
  assert.match(app, /const callbackFormOffset = \(formRect, submitRect\) =>/);
  assert.match(app, /Math\.min\(MOBILE_CONTACT_OFFSET, visibleBottom - QUICK_BAR_GAP - submitBottomInForm\)/);
  assert.match(app, /const offset = callbackFormOffset\(rect, submitButton\.getBoundingClientRect\(\)\);/);
});

