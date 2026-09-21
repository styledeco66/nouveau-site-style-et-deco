import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const SOURCE = new URL("../sitesite-template/assets/js/app.js", import.meta.url);

const classList = () => ({ toggle() {}, add() {}, remove() {}, contains() { return false; } });

const runAppForPerpignan = () => {
  let onReady;
  const subject = { value: "", required: true, dataset: {} };
  const form = {
    classList: classList(),
    querySelector(selector) {
      if (selector === 'input[name="subject"]') return subject;
      return null;
    },
    querySelectorAll() { return []; },
  };
  const document = {
    hidden: false,
    addEventListener(type, callback) { if (type === "DOMContentLoaded") onReady = callback; },
    querySelectorAll(selector) { return selector === ".js-lead-form" ? [form] : []; },
    querySelector() { return null; },
  };
  const window = {
    addEventListener() {},
    location: { hash: "" },
    matchMedia() { return { matches: false }; },
    requestAnimationFrame(callback) { callback(); },
    setTimeout() {},
  };
  const sessionStorage = { getItem() { return null; }, removeItem() {}, setItem() {} };
  vm.runInNewContext(readFileSync(SOURCE, "utf8"), { document, window, sessionStorage });
  onReady();
  return subject.value;
};

test("Perpignan conserve le champ Type de travaux vide au chargement", () => {
  assert.equal(runAppForPerpignan(), "");
});

// Formulaire hero/contact simulé : nom et téléphone toujours visibles, e-mail/ville/détails réservés au devis.
const runAppForModeForm = (mode) => {
  let onReady;
  let onHashChange;
  const store = new Map(mode ? [["lead_form_mode_intent", mode]] : []);
  const control = (required) => ({ required, disabled: false, dataset: {}, value: "" });
  const controls = { name: control(true), phone: control(true), email: control(true), city: control(true), details: control(true) };
  const devisBlocks = ["email", "city", "details"].map((field) => ({
    classList: classList(),
    querySelectorAll: () => [controls[field]],
  }));
  const priority = { value: "STANDARD" };
  const form = {
    classList: classList(),
    querySelector(selector) {
      if (selector === 'input[name="lead_priority"]') return priority;
      if (selector === 'input[name="name"]') return controls.name;
      return null;
    },
    querySelectorAll: (selector) => (selector === ".js-devis-only" ? devisBlocks : []),
  };
  const document = {
    hidden: false,
    addEventListener(type, callback) { if (type === "DOMContentLoaded") onReady = callback; },
    querySelectorAll: (selector) => (selector === ".js-lead-form" ? [form] : []),
    querySelector: () => null,
  };
  const window = {
    addEventListener(type, callback) { if (type === "hashchange") onHashChange = callback; },
    location: { hash: mode === "callback" ? "#contact" : "" },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame(callback) { callback(); },
    setTimeout() {},
  };
  const sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    removeItem: (key) => { store.delete(key); },
    setItem: (key, value) => { store.set(key, String(value)); },
  };
  vm.runInNewContext(readFileSync(SOURCE, "utf8"), { document, window, sessionStorage });
  onReady();
  const navigateTo = (hash) => {
    window.location.hash = hash;
    onHashChange();
  };
  return { controls, priority, navigateTo };
};

test("mode devis : l'e-mail est un champ actif et obligatoire", () => {
  const { controls, priority } = runAppForModeForm("devis");
  assert.equal(priority.value, "STANDARD");
  assert.equal(controls.email.disabled, false);
  assert.equal(controls.email.required, true);
  assert.equal(controls.name.required, true);
});

test("mode rappel : e-mail désactivé (jamais envoyé) et non requis ; nom et téléphone obligatoires", () => {
  const { controls, priority } = runAppForModeForm("callback");
  assert.equal(priority.value, "RAPPEL_30_MIN");
  assert.equal(controls.email.disabled, true);
  assert.equal(controls.email.required, false);
  assert.equal(controls.name.required, true);
  assert.equal(controls.phone.required, true);
});

test("retour navigateur rappel → devis : l'e-mail redevient visible, actif et obligatoire", () => {
  const { controls, priority, navigateTo } = runAppForModeForm("callback");
  assert.equal(controls.email.disabled, true);
  assert.equal(controls.email.required, false);

  navigateTo("#contact");

  assert.equal(priority.value, "STANDARD");
  assert.equal(controls.email.disabled, false);
  assert.equal(controls.email.required, true);
  assert.equal(controls.name.required, true);
  assert.equal(controls.phone.required, true);
});
