import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

import hours from "../sitesite-template/assets/js/business-hours.js";

// Textes de rappel dynamiques (boutons, pastilles, formulaires), champ e-mail facultatif en mode rappel, pages de confirmation.
const SITE = new URL("../sitesite-template/", import.meta.url);
const read = (file) => readFileSync(new URL(file, SITE), "utf8");
const APP = read("assets/js/app.js");

const classList = () => {
  const set = new Set();
  return { toggle: (n, f) => (f ? set.add(n) : set.delete(n)), add: (n) => set.add(n), remove: (n) => set.delete(n), contains: (n) => set.has(n), set };
};
const control = (required, value = "") => ({ required, disabled: false, dataset: {}, value });
const block = (controls, extra = {}) => ({ classList: classList(), querySelectorAll: () => controls, querySelector: () => extra.label || null });

// Simulation minimale de la page : un formulaire, des éléments data-callback-text, une horloge pilotée par le test.
const runPage = ({ now, mode = "devis" }) => {
  const controls = { name: control(true), phone: control(true), email: control(true), city: control(true, "Perpignan"), details: control(true) };
  const label = { textContent: "E-mail", dataset: { labelDevis: "E-mail", labelCallback: "E-mail (facultatif)" } };
  const title = { textContent: "Demander un devis en 1 minute", dataset: { titleDevis: "Demander un devis en 1 minute", titleCallback: "Demande de rappel" } };
  const intro = { textContent: "", dataset: { introDevis: "Réponse sous 24 h. Sans engagement.", introCallback: "repli" } };
  const submit = { textContent: "Recevoir mon devis", dataset: { labelDevis: "Recevoir mon devis", labelCallback: "Recevoir mon rappel" } };
  const devisOnly = [block([controls.details])];
  const devisRequired = [block([controls.city])];
  const emailBlocks = [block([controls.email], { label })];
  const priority = { value: "STANDARD" };
  const formClasses = classList();
  const form = {
    classList: formClasses,
    querySelector: (s) => ({ 'input[name="lead_priority"]': priority, ".js-form-title": title, ".js-form-intro": intro, ".js-form-submit": submit })[s] || null,
    querySelectorAll: (s) => ({ ".js-devis-only": devisOnly, ".js-devis-required": devisRequired, ".js-email-field": emailBlocks })[s] || [],
  };
  const texts = ["button", "pill", "heading"].map((key) => ({ key, textContent: "repli", getAttribute: () => key }));
  let onReady;
  const listeners = {};
  const timers = [];
  let clock = now;
  const document = {
    hidden: false,
    addEventListener: (type, cb) => { if (type === "DOMContentLoaded") onReady = cb; else listeners[type] = cb; },
    querySelectorAll: (s) => (s === ".js-lead-form" ? [form] : s === "[data-callback-text]" ? texts : []),
    querySelector: () => null,
  };
  const window = {
    StyleDecoHours: hours,
    addEventListener: (type, cb) => { listeners[type] = cb; },
    location: { hash: mode === "callback" ? "#contact" : "" },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (cb) => cb(),
    setTimeout: (cb, ms) => { timers.push({ cb, ms }); return timers.length; },
    clearTimeout: () => {},
  };
  const sessionStorage = { getItem: () => (mode === "callback" ? "callback" : null), removeItem() {}, setItem() {} };
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock.getTime(); } }
  vm.runInNewContext(APP, { document, window, sessionStorage, Date: FakeDate });
  onReady();
  return { controls, label, title, intro, submit, texts, form, formClasses, timers, listeners, advance: (d) => { clock = d; } };
};
const at = (date, hhmm) => hours.parisInstant(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));

test("boutons et pastilles de rappel : texte calculé sur l'heure de Paris (jour, soir, week-end)", () => {
  const cases = [
    [at("2026-10-19", "12:00"), "Être rappelé sous 30 min", "Rappel sous 30 min"],
    [at("2026-10-19", "20:00"), "Être rappelé demain dès 8 h", "Rappel demain dès 8 h"],
    [at("2026-10-23", "18:30"), "Être rappelé lundi dès 8 h", "Rappel lundi dès 8 h"],
    [at("2026-10-25", "11:00"), "Être rappelé lundi dès 8 h", "Rappel lundi dès 8 h"],
    [at("2026-10-19", "06:50"), "Être rappelé dès 8 h", "Rappel dès 8 h"],
  ];
  for (const [now, button, pill] of cases) {
    const page = runPage({ now });
    assert.equal(page.texts[0].textContent, button);
    assert.equal(page.texts[1].textContent, pill);
    assert.ok(page.texts[2].textContent.startsWith("Nous vous rappelons"));
  }
});

test("actualisation : un seul minuteur, calé sur le prochain changement de créneau (pas de rafraîchissement à la seconde), puis mise à jour au retour sur l'onglet", () => {
  const page = runPage({ now: at("2026-10-19", "17:20") });
  assert.equal(page.texts[0].textContent, "Être rappelé sous 30 min");
  assert.ok(page.timers.length >= 1);
  const delay = page.timers[page.timers.length - 1].ms;
  assert.ok(delay > 9 * 60 * 1000 && delay < 11 * 60 * 1000, `prochain changement à 17 h 30 (≈ 10 min), obtenu ${delay} ms`);
  page.advance(at("2026-10-19", "17:31"));
  page.listeners.visibilitychange();
  assert.equal(page.texts[0].textContent, "Être rappelé demain dès 8 h", "retour sur l'onglet : texte actualisé");
});

test("mode rappel : e-mail visible et FACULTATIF, ville conservée (non désactivée), détails désactivés ; retour au devis : tout redevient obligatoire", () => {
  const page = runPage({ now: at("2026-10-19", "12:00"), mode: "callback" });
  assert.equal(page.controls.email.disabled, false);
  assert.equal(page.controls.email.required, false);
  assert.equal(page.label.textContent, "E-mail (facultatif)");
  assert.equal(page.controls.city.disabled, false, "la ville prérenseignée (Perpignan) reste envoyée");
  assert.equal(page.controls.city.value, "Perpignan");
  assert.equal(page.controls.city.required, false);
  assert.equal(page.controls.details.disabled, true);
  assert.equal(page.controls.name.required, true);
  assert.equal(page.title.textContent, "Demande de rappel sous 30 min");
  assert.ok(page.intro.textContent.includes("nous vous rappelons sous 30 minutes"));
});

test("mode devis : e-mail, ville et détails obligatoires", () => {
  const page = runPage({ now: at("2026-10-19", "12:00") });
  for (const f of ["email", "city", "details"]) assert.equal(page.controls[f].required, true, f);
  assert.equal(page.label.textContent, "E-mail");
});

test("HTML : tous les boutons de rappel sont dynamiques, aucune promesse « 30 min » statique, aucun bouton de devis transformé", () => {
  const home = read("index.html");
  const callbackLinks = [...home.matchAll(/<a [^>]*data-form-mode-intent="callback"[^>]*>([^<]*)<\/a>/g)];
  assert.equal(callbackLinks.length, 3, "hero, section rappel, barre mobile");
  for (const [tag, text] of callbackLinks) {
    assert.match(tag, /data-callback-text="button"/);
    assert.equal(text.trim(), "Demander un rappel", "texte de repli sans JavaScript");
  }
  assert.doesNotMatch(home, /en moins de 30 min|Rappel &lt; 30 min|Priorité rappel 30 min|rappel 30 min/i);
  assert.match(home, /<span data-callback-text="pill">/);
  for (const devisLink of home.matchAll(/<a [^>]*data-form-mode-intent="devis"[^>]*>/g)) assert.doesNotMatch(devisLink[0], /data-callback-text/);
  const perpignan = read("perpignan.html");
  assert.doesNotMatch(perpignan, /30 min|Priorité rappel/);
  assert.match(perpignan, /js-email-field/);
  assert.match(perpignan, /name="city" value="Perpignan"/);
  assert.ok((perpignan.match(/js-devis-required/g) || []).length === 1);
  for (const file of ["index.html", "perpignan.html"]) {
    assert.match(read(file), /business-hours\.js\?v=[0-9a-f]{10}"><\/script>\s*<script src="\.\/assets\/js\/app\.js/, `${file} : le calcul horaire est chargé avant app.js`);
  }
});

test("pages de confirmation : devis et rappel distinctes, au pluriel, non indexables, repli sans JavaScript", () => {
  for (const [file, h1] of [["merci.html", "Votre demande de devis a bien été reçue."], ["merci-rappel.html", "Votre demande de rappel a bien été reçue."]]) {
    const html = read(file);
    assert.match(html, /<meta name="robots" content="noindex,follow" \/>/, file);
    assert.ok(html.includes(h1), file);
    assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /\b(Je|je|j'|J'|m'|moi|Appelez-moi)\b/, `${file} : pas de première personne du singulier`);
  }
  const rappel = read("merci-rappel.html");
  assert.match(rappel, /data-slot="sentence">Nous vous recontacterons dans le créneau annoncé/, "texte de repli compréhensible sans JavaScript");
  assert.match(read("merci.html"), /sous 24&nbsp;h/);
});

test("merci.js : affiche le créneau validé à partir du code ; code falsifié → texte de repli conservé", () => {
  const run = (search, nowIso) => {
    const el = { textContent: "repli" };
    const FakeDate = class extends Date { constructor(...a) { super(...(a.length ? a : [nowIso])); } };
    vm.runInNewContext(read("assets/js/merci.js"), {
      window: { StyleDecoHours: hours, location: { search } },
      document: { querySelectorAll: () => [el] },
      URLSearchParams,
      Date: FakeDate,
    });
    return el.textContent;
  };
  const friday = "2026-10-23T17:00:00.000Z";
  assert.equal(run("?s=20261026", friday), "Nous vous recontacterons lundi à partir de 8 h.");
  assert.equal(run("?s=30", friday), "Nous vous rappelons sous 30 minutes.");
  assert.equal(run("?s=%3Cscript%3E", friday), "repli");
  assert.equal(run("?s=20200101", friday), "repli");
  assert.equal(run("", friday), "repli");
});
