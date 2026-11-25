import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const SOURCE = new URL("../sitesite-template/assets/js/google-ads-measurement.js", import.meta.url);
const TAG = "AW-123456789";
const QUOTE = "test_quote_label";
const CALL = "test_call_label";
const CAMPAIGN_QUERY = "?gclid=MockClickAbc123";
const LEGACY_PREF = "styledeco-ads-consent-v1";
const CURRENT_PREF = "styledeco-ads-consent-v2";
const PAID_VISIT = "styledeco-ads-paid-visit";
const QUOTE_MARKER = "styledeco-ads-quote-v1";
const SITE = "https://styleetdeco.fr";
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

function load({
  localStorage = storage(), sessionStorage = storage(), hostname = "styleetdeco.fr",
  pathname = "/", search = "", referrer = "",
} = {}) {
  const granted = element("button");
  granted.dataset = { choice: "granted" };
  const denied = element("button");
  denied.dataset = { choice: "denied" };
  const phone = element("a");
  phone.setAttribute("href", ORIGINAL_TEL);
  const phoneText = { nodeValue: ORIGINAL_PHONE };
  const panel = element("section");
  const dismiss = element("button");
  panel.querySelector = (selector) => selector === "[data-dismiss]" ? dismiss : denied;
  panel.querySelectorAll = () => panel.innerHTML.includes('data-choice="granted"') ? [denied, granted] : [denied];
  const scripts = [];
  const changes = {};
  let reloads = 0;
  let settings;
  let rendered = false;
  const document = {
    referrer,
    cookie: "_gcl_aw=sample",
    head: { append(scriptElement) { scripts.push(scriptElement.src); } },
    body: { append(el) {
      if (el.tagName === "BUTTON") settings = el;
      if (el.tagName === "SECTION") rendered = true;
    } },
    createElement: (type) => type === "section" ? panel : element(type),
    querySelector: (selector) => selector.startsWith("a[") ? phone : null,
    querySelectorAll: (selector) => selector.startsWith("a[") ? [phone] : [],
    createTreeWalker() {
      const nodes = [phoneText];
      return { nextNode: () => nodes.shift() };
    },
  };
  const window = {
    location: { hostname, pathname, search, origin: `https://${hostname}`, protocol: "https:", reload() { reloads += 1; } },
    localStorage,
    sessionStorage,
    addEventListener(name, listener) { changes[name] = listener; },
  };
  vm.runInNewContext(script, { window, document, URLSearchParams, NodeFilter: { SHOW_TEXT: 4 } });
  return {
    localStorage, sessionStorage, phone, phoneText, panel, granted, denied, dismiss, settings, scripts, rendered,
    registerQuote: (id) => window.StyleDecoAds?.registerQuote(id),
    changes,
    commands: () => Array.from(window.dataLayer ?? [], (args) => Array.from(args)),
    reloads: () => reloads,
  };
}

const conversions = (page) => page.commands().filter(([type, event]) => type === "event" && event === "conversion");

const savePreference = (items, key, choice) => {
  items.setItem(key, JSON.stringify({ choice, expires: Date.now() + 60_000 }));
};

test("mesure Ads : aucun encart ni script en accès direct, organique, UTM seul ou avec un identifiant mal formé", () => {
  for (const options of [
    {}, { referrer: "https://www.google.fr/search?q=peintre" },
    { referrer: SITE + "/", pathname: "/perpignan.html" },
    { search: "?utm_source=google&utm_medium=cpc" },
    { search: "?gclid=" }, { search: "?gclid=mal%20forme" },
    { search: CAMPAIGN_QUERY + "&gclid=SecondIdentifiant123" },
  ]) {
    const page = load(options);
    assert.equal(page.rendered, false);
    assert.equal(page.settings, undefined);
    assert.deepEqual(page.scripts, []);
    assert.equal(page.sessionStorage.getItem(PAID_VISIT), null);
  }
});

test("mesure Ads : un identifiant d’annonce propose le choix sans enregistrer de visite avant accord", () => {
  for (const key of ["gclid", "gbraid", "wbraid"]) {
    const page = load({ search: `?${key}=Mock_Click-Abc123` });
    page.registerQuote(QUOTE_ID);
    assert.equal(page.rendered, true);
    assert.equal(page.panel.hidden, false);
    assert.deepEqual(page.scripts, []);
    assert.deepEqual(page.commands(), []);
    assert.equal(page.sessionStorage.getItem(PAID_VISIT), null);
    assert.equal(page.sessionStorage.getItem(QUOTE_MARKER), null);
    page.denied.click();
    const revisit = load({ search: CAMPAIGN_QUERY, localStorage: page.localStorage });
    assert.equal(revisit.panel.hidden, true);
    assert.deepEqual(revisit.scripts, []);
    assert.equal(revisit.sessionStorage.getItem(PAID_VISIT), null);
  }

  const preview = load({ hostname: "deploy-preview-0--styledeco-test.netlify.app", search: CAMPAIGN_QUERY });
  assert.equal(preview.panel.hidden, false);
  preview.granted.click();
  preview.registerQuote(QUOTE_ID);
  assert.deepEqual(preview.scripts, []);
  assert.deepEqual(preview.commands(), []);
  assert.equal(preview.sessionStorage.getItem(PAID_VISIT), null);
  const otherDomain = load({ hostname: "styledeco-test.netlify.app", search: CAMPAIGN_QUERY });
  assert.equal(otherDomain.settings, undefined);
  assert.deepEqual(otherDomain.scripts, []);
});

test("mesure Ads : l’ancien accord ne démarre aucune balise et l’ancien refus est conservé", () => {
  const local = storage();
  savePreference(local, LEGACY_PREF, "granted");
  const direct = load({ localStorage: local });
  assert.equal(direct.panel.hidden, true);
  assert.deepEqual(direct.scripts, []);
  direct.settings.click();
  assert.equal(direct.panel.hidden, false);
  assert.doesNotMatch(direct.panel.innerHTML, /data-choice="granted"/);
  direct.dismiss.click();
  assert.equal(direct.panel.hidden, true);

  const paid = load({ localStorage: local, search: CAMPAIGN_QUERY });
  assert.equal(paid.panel.hidden, false);
  assert.deepEqual(paid.scripts, []);
  savePreference(local, LEGACY_PREF, "denied");
  const denied = load({ localStorage: local, search: CAMPAIGN_QUERY });
  assert.equal(denied.panel.hidden, true);
  assert.deepEqual(denied.scripts, []);
  for (const key of [LEGACY_PREF, CURRENT_PREF]) {
    savePreference(local, key, "denied");
    const directAfterRefusal = load({ localStorage: local });
    assert.equal(directAfterRefusal.rendered, false);
    assert.equal(directAfterRefusal.settings, undefined);
  }
});

test("mesure Ads : la visite continue dans le même onglet et un devis confirmé compte une fois", () => {
  const landing = load({ search: CAMPAIGN_QUERY });
  landing.granted.click();
  const command = landing.commands().find(([type, mode]) => type === "consent" && mode === "update");
  assert.equal(command[2].ad_storage, "granted");
  assert.equal(command[2].ad_user_data, "granted");
  assert.equal(command[2].ad_personalization, "denied");
  assert.equal(command[2].analytics_storage, "denied");
  assert.deepEqual(landing.scripts, [`https://www.googletagmanager.com/gtag/js?id=${TAG}`]);
  assert.ok(JSON.parse(landing.sessionStorage.getItem(PAID_VISIT)) > Date.now(), "garde uniquement une date d’expiration");

  const sameTab = { localStorage: landing.localStorage, sessionStorage: landing.sessionStorage };
  const contact = load({ ...sameTab, pathname: "/perpignan.html", referrer: SITE + "/" });
  assert.equal(contact.panel.hidden, true);
  assert.equal(contact.scripts.length, 1);

  for (const pathname of ["/merci.html", "/merci", "/merci/"]) {
    const confirmation = { ...sameTab, pathname, referrer: SITE + "/perpignan.html" };
    assert.equal(conversions(load(confirmation)).length, 0, "page sans confirmation d’envoi");
    contact.registerQuote(QUOTE_ID);
    const received = conversions(load(confirmation));
    assert.equal(received.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(received[0][2])), {
      send_to: `${TAG}/${QUOTE}`, transaction_id: QUOTE_ID, user_data: {},
    });
    assert.equal(conversions(load(confirmation)).length, 0, "actualisation après le premier envoi");
  }
});

test("mesure Ads : une nouvelle arrivée directe ou organique coupe la visite et ne réactive rien à la page suivante", () => {
  for (const referrer of ["", "https://www.google.fr/search?q=peintre", "https://styleetdeco.fr.example.com/"]) {
    const landing = load({ search: CAMPAIGN_QUERY });
    landing.granted.click();
    const current = { localStorage: landing.localStorage, sessionStorage: landing.sessionStorage };
    landing.registerQuote(QUOTE_ID);
    const direct = load({ ...current, pathname: "/merci.html", referrer });
    assert.equal(direct.panel.hidden, true);
    assert.deepEqual(direct.scripts, []);
    assert.equal(conversions(direct).length, 0);
    assert.equal(direct.sessionStorage.getItem(PAID_VISIT), null);
    assert.equal(direct.sessionStorage.getItem(QUOTE_MARKER), null);
    assert.deepEqual(load({ ...current, referrer: SITE + "/merci.html" }).scripts, []);

    // Le retour arrière via le cache du navigateur doit également couper l’ancienne balise.
    landing.changes.pageshow({ persisted: true });
    assert.equal(landing.reloads(), 1);
  }
});

test("mesure Ads : une ancienne page directe restaurée coupe une preuve Ads plus récente", () => {
  const earlierDirect = load();
  const tab = { localStorage: earlierDirect.localStorage, sessionStorage: earlierDirect.sessionStorage };
  const laterAd = load({ ...tab, search: CAMPAIGN_QUERY });
  laterAd.granted.click();
  assert.ok(laterAd.sessionStorage.getItem(PAID_VISIT));
  earlierDirect.changes.pageshow({ persisted: true });
  assert.equal(laterAd.sessionStorage.getItem(PAID_VISIT), null);
  assert.deepEqual(load({ ...tab, referrer: SITE + "/" }).scripts, []);
});

test("mesure Ads : le choix enregistré s’applique à un nouveau clic Ads et son retrait est accessible en visite directe", () => {
  const landing = load({ search: CAMPAIGN_QUERY });
  landing.granted.click();
  const newClick = load({ localStorage: landing.localStorage, search: "?gbraid=AnotherClickAbc123" });
  assert.equal(newClick.panel.hidden, true);
  const call = newClick.commands().find(([type, destination]) => type === "config" && destination === `${TAG}/${CALL}`);
  assert.equal(call[2].phone_conversion_number, ORIGINAL_PHONE);
  call[2].phone_conversion_callback("invalid", "invalid");
  assert.equal(newClick.phone.getAttribute("href"), ORIGINAL_TEL);
  call[2].phone_conversion_callback("01 23 45 67 89", "33123456789");
  assert.equal(newClick.phone.getAttribute("href"), "tel:+33123456789");
  assert.equal(newClick.phoneText.nodeValue, "01 23 45 67 89");
  assert.equal(conversions(newClick).length, 0, "le remplacement du numéro ne compte pas comme appel");

  const direct = load({ localStorage: landing.localStorage });
  direct.settings.click();
  assert.equal(direct.panel.hidden, false);
  direct.denied.click();
  assert.deepEqual(direct.scripts, []);
  assert.equal(direct.reloads(), 0);
  newClick.changes.storage({ key: CURRENT_PREF });
  assert.equal(newClick.reloads(), 1);
  const after = load({ search: CAMPAIGN_QUERY, localStorage: landing.localStorage });
  assert.equal(after.phone.getAttribute("href"), ORIGINAL_TEL);
  assert.deepEqual(after.scripts, []);
});
