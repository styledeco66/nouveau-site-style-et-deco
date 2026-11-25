import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const SOURCE = new URL("../sitesite-template/assets/js/google-ads-measurement.js", import.meta.url);
const TAG = "AW-123456789";
const QUOTE = "test_quote_label";
const CALL = "test_call_label";
const QUOTE_ID = "89aadd2b-b71f-461c-8e46-81b5332bc6d4";
const ORIGINAL_PHONE = "06 50 75 62 42";
const ORIGINAL_TEL = "tel:+33650756242";
const script = readFileSync(SOURCE, "utf8")
  .replace(/const ADS_TAG_ID = "[^"]*";/, `const ADS_TAG_ID = "${TAG}";`)
  .replace(/const QUOTE_LABEL = "[^"]*";/, `const QUOTE_LABEL = "${QUOTE}";`)
  .replace(/const CALL_LABEL = "[^"]*";/, `const CALL_LABEL = "${CALL}";`);

const storage = () => {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  };
};

const element = (type) => {
  const listeners = {};
  const attributes = {};
  return {
    tagName: type.toUpperCase(),
    addEventListener(name, listener) { listeners[name] = listener; },
    click() { listeners.click?.({ currentTarget: this }); },
    focus() {},
    getAttribute(name) { return attributes[name] ?? null; },
    setAttribute(name, value) { attributes[name] = value; },
  };
};

function load({ localStorage = storage(), sessionStorage = storage(), hostname = "styleetdeco.fr", pathname = "/" } = {}) {
  const granted = element("button");
  granted.dataset = { choice: "granted" };
  const denied = element("button");
  denied.dataset = { choice: "denied" };
  const phone = element("a");
  phone.setAttribute("href", ORIGINAL_TEL);
  const phoneText = { nodeValue: ORIGINAL_PHONE };
  const panel = element("section");
  panel.querySelector = () => denied;
  panel.querySelectorAll = () => [denied, granted];
  const scripts = [];
  const changes = {};
  let reloads = 0;
  let settings;
  const document = {
    cookie: "_gcl_aw=sample",
    head: { append(scriptElement) { scripts.push(scriptElement.src); } },
    body: { append(el) { if (el.tagName === "BUTTON") settings = el; } },
    createElement: (type) => type === "section" ? panel : element(type),
    querySelector: (selector) => selector.startsWith("a[") ? phone : null,
    querySelectorAll: (selector) => selector.startsWith("a[") ? [phone] : [],
    createTreeWalker() {
      const nodes = [phoneText];
      return { nextNode: () => nodes.shift() };
    },
  };
  const window = {
    location: { hostname, pathname, protocol: "https:", reload() { reloads += 1; } },
    localStorage,
    sessionStorage,
    addEventListener(name, listener) { changes[name] = listener; },
  };
  vm.runInNewContext(script, { window, document, NodeFilter: { SHOW_TEXT: 4 } });
  return {
    localStorage, sessionStorage, phone, phoneText, panel, granted, denied, settings, scripts,
    registerQuote: window.StyleDecoAds.registerQuote,
    changes,
    commands: () => Array.from(window.dataLayer ?? [], (args) => Array.from(args)),
    reloads: () => reloads,
  };
}

const conversions = (page) => page.commands().filter(([type, event]) => type === "event" && event === "conversion");

test("mesure Ads : aucune balise avant l’accord ou après le refus, et aucune en prévisualisation", () => {
  const page = load();
  page.registerQuote(QUOTE_ID);
  assert.equal(page.panel.hidden, false);
  assert.deepEqual(page.scripts, []);
  assert.deepEqual(page.commands(), []);
  page.denied.click();
  const revisit = load({ localStorage: page.localStorage });
  assert.equal(revisit.panel.hidden, true);
  assert.deepEqual(revisit.scripts, []);
  assert.deepEqual(revisit.commands(), []);

  const preview = load({ hostname: "deploy-preview-0--styledeco-test.netlify.app" });
  preview.granted.click();
  preview.registerQuote(QUOTE_ID);
  assert.deepEqual(preview.scripts, []);
  assert.deepEqual(preview.commands(), []);

  const otherDomain = load({ hostname: "styledeco-test.netlify.app" });
  assert.equal(otherDomain.settings, undefined);
  assert.deepEqual(otherDomain.scripts, []);
});

test("mesure Ads : consentement limité à la mesure et devis transmis une fois sur la page de confirmation", () => {
  const page = load();
  page.granted.click();
  const command = page.commands().find(([type, mode]) => type === "consent" && mode === "update");
  assert.equal(command[2].ad_storage, "granted");
  assert.equal(command[2].ad_user_data, "granted");
  assert.equal(command[2].ad_personalization, "denied");
  assert.equal(command[2].analytics_storage, "denied");
  assert.deepEqual(page.scripts, [`https://www.googletagmanager.com/gtag/js?id=${TAG}`]);
  const options = { localStorage: page.localStorage, sessionStorage: page.sessionStorage };
  for (const pathname of ["/merci.html", "/merci", "/merci/"]) {
    const landing = { ...options, pathname };
    assert.equal(conversions(load(landing)).length, 0, "visite directe");
    page.registerQuote(QUOTE_ID);
    const received = conversions(load(landing));
    assert.equal(received.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(received[0][2])), {
      send_to: `${TAG}/${QUOTE}`, transaction_id: QUOTE_ID, user_data: {},
    });
    assert.equal(conversions(load(landing)).length, 0, "actualisation après le premier envoi");
  }
});

test("mesure Ads : seul le transfert Google remplace le numéro et le retrait restaure la version sans balise", () => {
  const page = load();
  page.granted.click();
  const call = page.commands().find(([type, destination]) => type === "config" && destination === `${TAG}/${CALL}`);
  assert.equal(call[2].phone_conversion_number, ORIGINAL_PHONE);
  call[2].phone_conversion_callback("invalid", "invalid");
  assert.equal(page.phone.getAttribute("href"), ORIGINAL_TEL);
  call[2].phone_conversion_callback("01 23 45 67 89", "33123456789");
  assert.equal(page.phone.getAttribute("href"), "tel:+33123456789");
  assert.equal(page.phoneText.nodeValue, "01 23 45 67 89");
  assert.equal(conversions(page).length, 0, "le remplacement du numéro ne compte pas comme appel");
  page.settings.click();
  assert.equal(page.panel.hidden, false);
  page.denied.click();
  assert.equal(page.reloads(), 1);
  const after = load({ localStorage: page.localStorage });
  assert.equal(after.phone.getAttribute("href"), ORIGINAL_TEL);
  assert.deepEqual(after.scripts, []);
});
