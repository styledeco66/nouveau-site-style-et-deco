import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sitesite-template");
const SOURCE = readFileSync(path.join(SITE, "assets/js/audience.js"), "utf8");
const ID = "00000000-0000-4000-8000-000000000000";
const withId = (id) => SOURCE.replace(/const WEBSITE_ID = "[^"]*";/, `const WEBSITE_ID = "${id}";`);

// Exécute audience.js dans une page factice et retourne ce qu'il a chargé.
const run = ({ id = ID, url = "https://styleetdeco.fr/", optOut = false } = {}) => {
  const scripts = [];
  const store = new Map(optOut ? [["umami.disabled", "1"]] : []);
  const status = { textContent: "" };
  let click;
  const button = { hidden: true, textContent: "", addEventListener: (_, handler) => { click = handler; } };
  const window = {
    location: new URL(url),
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
    addEventListener() {},
    setTimeout() {},
  };
  const document = {
    querySelector: () => status,
    querySelectorAll: (selector) => (selector === "[data-audience-choix]" ? [button] : []),
    addEventListener() {},
    createElement: () => ({ attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, addEventListener() {} }),
    head: { append: (script) => scripts.push(script) },
  };
  vm.runInNewContext(withId(id), { window, document, URL, URLSearchParams });
  return { window, scripts, store, status, button, click: () => click() };
};

test("audience : rien n'est chargé sans identifiant, hors du site publié ou après un refus", () => {
  assert.equal(run({ id: "" }).scripts.length, 0, "identifiant vide");
  assert.equal(run({ url: "http://127.0.0.1:8000/" }).scripts.length, 0, "poste local");
  assert.equal(run({ url: "https://deploy-preview-1--styleetdeco.netlify.app/" }).scripts.length, 0, "aperçu Netlify");
  assert.equal(run({ optOut: true }).scripts.length, 0, "refus");
});

test("audience : sur le site publié, un seul script Umami, limité au domaine", () => {
  const { scripts } = run();
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, "https://cloud.umami.is/script.js");
  assert.equal(scripts[0].attributes["data-website-id"], ID);
  assert.equal(scripts[0].attributes["data-domains"], "styleetdeco.fr,www.styleetdeco.fr");
  assert.equal(scripts[0].attributes["data-before-send"], "styleDecoAudienceFiltre");
});

test("audience : les identifiants de clic et paramètres libres sont retirés, l'annonce reste reconnaissable", () => {
  const filter = run().window.styleDecoAudienceFiltre;
  const ad = filter("event", { url: "https://styleetdeco.fr/perpignan.html?gclid=ABC123456&email=a%40b.fr#contact", referrer: "https://www.google.com/search?q=peintre" });
  assert.equal(ad.url, "https://styleetdeco.fr/perpignan.html?utm_source=google&utm_medium=cpc");
  assert.equal(ad.referrer, "https://www.google.com/search");
  const campaign = filter("event", { url: "/?utm_source=flyer&utm_campaign=printemps&s=30&wbraid=XYZ", referrer: "" });
  assert.equal(campaign.url, "https://styleetdeco.fr/?utm_source=flyer&utm_campaign=printemps");
});

test("audience : le bouton de la politique de confidentialité enregistre puis annule le refus", () => {
  const page = run({ url: "https://styleetdeco.fr/legal/politique-confidentialite.html" });
  assert.equal(page.button.hidden, false);
  page.click();
  assert.equal(page.store.get("umami.disabled"), "1");
  assert.equal(page.button.textContent, "Compter à nouveau mes visites");
  page.click();
  assert.equal(page.store.has("umami.disabled"), false);
  assert.equal(page.button.textContent, "Ne plus compter mes visites");
});

test("audience : le script est présent une seule fois sur chaque page du site", () => {
  const pages = readdirSync(SITE, { recursive: true }).filter((file) => file.endsWith(".html") && !/^google[0-9a-f]+\.html$/.test(file));
  for (const page of pages) {
    const html = readFileSync(path.join(SITE, page), "utf8");
    assert.equal(html.match(/assets\/js\/audience\.js\?v=/g)?.length, 1, page);
  }
});
