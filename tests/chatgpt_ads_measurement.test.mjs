import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const read = (file) => readFileSync(new URL(`../sitesite-template/${file}`, import.meta.url), "utf8");
const script = read("assets/js/chatgpt-ads-measurement.js");
const SITE = "https://styleetdeco.fr";
const PIXEL = "7bK57co1StvC56N5EfpoFB";
const REF = "Mock_oppref-Abc123.xyz~=";
const QUERY = `?oppref=${encodeURIComponent(REF)}`;
const PREF = "styledeco-openai-consent-v1";
const VISIT = "styledeco-openai-visit";
const QUOTE = "styledeco-openai-quote";
const EVENT = "styledeco-openai-event";
const GOOGLE_PREF = "styledeco-ads-consent-v2";
const SUBMISSION = "89aadd2b-b71f-461c-8e46-81b5332bc6d4";

const storage = () => {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
    size: () => items.size,
  };
};

const element = (type) => {
  const listeners = {};
  const attributes = {};
  return {
    tagName: type.toUpperCase(),
    style: {},
    dataset: {},
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
  const dismiss = element("button");
  const panel = element("section");
  panel.querySelector = (selector) => selector === "[data-dismiss]" ? dismiss : denied;
  panel.querySelectorAll = () => panel.innerHTML.includes('data-choice="granted"') ? [denied, granted] : [denied];
  const requests = [];
  const listeners = {};
  let settings;
  let rendered = false;
  const document = {
    referrer,
    body: { append(el) {
      if (el.tagName === "BUTTON") settings = el;
      if (el.tagName === "SECTION") rendered = true;
      if (el.tagName === "IMG") requests.push(el);
    } },
    createElement: (type) => type === "section" ? panel : element(type),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const window = {
    location: { hostname, pathname, search, origin: `https://${hostname}`, protocol: "https:" },
    localStorage,
    sessionStorage,
    crypto: globalThis.crypto,
    addEventListener(name, listener) { listeners[name] = listener; },
  };
  vm.runInNewContext(script, { window, document, URLSearchParams });
  return {
    localStorage, sessionStorage, panel, granted, denied, dismiss, settings, rendered, requests, listeners,
    registerQuote: (id = SUBMISSION) => window.StyleDecoChatGPTAds?.registerQuote(id),
  };
}

const json = (items, key) => JSON.parse(items.getItem(key));
const sameTab = (page) => ({ localStorage: page.localStorage, sessionStorage: page.sessionStorage });
const confirmation = (page, pathname = "/merci.html") => load({ ...sameTab(page), pathname, referrer: `${SITE}/perpignan.html` });
const accepted = () => {
  const page = load({ search: QUERY });
  page.granted.click();
  return page;
};

test("mesure ChatGPT : aucun encart, stockage ni envoi sans référence de clic valable ou hors du site", () => {
  for (const options of [
    {}, { search: "?utm_source=chatgpt.com" }, { referrer: "https://chatgpt.com/" },
    { search: "?oppref=" }, { search: "?oppref=avec%20espace" }, { search: `?oppref=${"a".repeat(2049)}` },
    { search: `${QUERY}&oppref=Second123` }, { search: "?gclid=MockClickAbc123" },
    { search: QUERY, hostname: "styledeco-test.netlify.app" },
    { pathname: "/merci.html" },
  ]) {
    const page = load(options);
    page.registerQuote();
    assert.equal(page.rendered, false, JSON.stringify(options));
    assert.equal(page.settings, undefined);
    assert.equal(page.requests.length, 0);
    assert.equal(page.sessionStorage.size(), 0);
  }
});

test("mesure ChatGPT : l’encart nomme OpenAI, rien n’est gardé avant accord ni après refus", () => {
  const landing = load({ search: QUERY });
  assert.equal(landing.panel.hidden, false);
  assert.match(landing.panel.innerHTML, /OpenAI/);
  landing.registerQuote();
  assert.equal(landing.sessionStorage.size(), 0);
  landing.denied.click();
  landing.registerQuote();
  assert.equal(landing.sessionStorage.size(), 0);
  assert.equal(confirmation(landing).requests.length, 0);
  const revisit = load({ search: QUERY, localStorage: landing.localStorage });
  assert.equal(revisit.panel.hidden, true);
  assert.equal(revisit.sessionStorage.size(), 0);
});

test("mesure ChatGPT : l’accord donné à Google ne vaut pas pour OpenAI, et inversement", () => {
  const local = storage();
  local.setItem(GOOGLE_PREF, JSON.stringify({ choice: "granted", expires: Date.now() + 60_000 }));
  const landing = load({ search: QUERY, localStorage: local });
  assert.equal(landing.panel.hidden, false);
  assert.equal(landing.sessionStorage.size(), 0);
  landing.granted.click();
  assert.equal(json(local, GOOGLE_PREF).choice, "granted");
  landing.denied.click();
  assert.equal(json(local, GOOGLE_PREF).choice, "granted");
  assert.equal(json(local, PREF).choice, "denied");
});

test("mesure ChatGPT : un devis confirmé après accord produit exactement une requête, sans rejouer au rechargement", () => {
  for (const pathname of ["/merci.html", "/merci", "/merci/"]) {
    const landing = accepted();
    assert.equal(json(landing.sessionStorage, VISIT).ref, REF);
    const contact = load({ ...sameTab(landing), pathname: "/perpignan.html", referrer: `${SITE}/` });
    assert.equal(contact.panel.hidden, true);
    assert.equal(confirmation(contact, pathname).requests.length, 0, "confirmation sans devis envoyé");
    contact.registerQuote();
    assert.equal(contact.requests.length, 0, "rien ne part avant la page de confirmation");
    const first = confirmation(contact, pathname);
    assert.equal(first.requests.length, 1);
    const url = new URL(first.requests[0].src);
    assert.equal(url.origin + url.pathname, "https://bzr.openai.com/v1/sdk/events");
    assert.deepEqual([...url.searchParams.keys()], ["pid", "event", "event_id", "oppref", "data[type]"]);
    assert.equal(url.searchParams.get("pid"), PIXEL);
    assert.equal(url.searchParams.get("event"), "lead_created");
    assert.equal(url.searchParams.get("oppref"), REF);
    assert.equal(url.searchParams.get("data[type]"), "customer_action");
    assert.match(url.searchParams.get("event_id"), /^devis-[0-9a-f-]{36}$/);
    assert.ok(!url.search.includes(SUBMISSION), "l’identifiant interne de la demande n’est pas transmis");
    assert.equal(confirmation(contact, pathname).requests.length, 0, "rechargement");
  }
});

test("mesure ChatGPT : une demande hors page de confirmation de devis ne part pas", () => {
  const landing = accepted();
  landing.registerQuote();
  assert.equal(load({ ...sameTab(landing), pathname: "/merci-rappel.html", referrer: `${SITE}/` }).requests.length, 0);
});

test("mesure ChatGPT : nouvelles tentatives du même devis avec le même identifiant, autre devis avec un autre", () => {
  const landing = accepted();
  const send = (submission) => {
    landing.registerQuote(submission);
    return new URL(confirmation(landing).requests[0].src).searchParams.get("event_id");
  };
  const first = send(SUBMISSION);
  assert.equal(send(SUBMISSION), first);
  assert.notEqual(send("11111111-2222-3333-4444-555555555555"), first);
});

test("mesure ChatGPT : accès direct ou externe à la confirmation efface la référence et n’envoie rien", () => {
  for (const referrer of ["", "https://www.google.fr/", "https://chatgpt.com/", "https://styleetdeco.fr.example.com/"]) {
    const landing = accepted();
    landing.registerQuote();
    const direct = load({ ...sameTab(landing), pathname: "/merci.html", referrer });
    assert.equal(direct.requests.length, 0);
    assert.equal(direct.sessionStorage.getItem(VISIT), null);
    assert.equal(direct.sessionStorage.getItem(QUOTE), null);
    assert.equal(confirmation(direct).requests.length, 0);
  }
});

test("mesure ChatGPT : le retrait de l’accord efface la référence, y compris après l’envoi du formulaire", () => {
  const landing = accepted();
  landing.registerQuote();
  landing.settings.click();
  landing.denied.click();
  for (const key of [VISIT, QUOTE, EVENT]) assert.equal(landing.sessionStorage.getItem(key), null, key);
  assert.equal(confirmation(landing).requests.length, 0);

  const later = accepted();
  const next = load({ ...sameTab(later), pathname: "/perpignan.html", referrer: `${SITE}/` });
  next.registerQuote();
  next.settings.click();
  assert.equal(next.panel.hidden, false);
  next.denied.click();
  next.granted.click();
  assert.equal(next.sessionStorage.getItem(VISIT), null, "une référence retirée ne revient pas hors de la page d’arrivée");
  assert.equal(confirmation(next).requests.length, 0);
});

test("mesure ChatGPT : retrait dans un autre onglet pris en compte, retrait accessible en visite directe", () => {
  const landing = accepted();
  landing.registerQuote();
  const direct = load({ localStorage: landing.localStorage });
  assert.equal(direct.panel.hidden, true);
  assert.doesNotMatch(direct.panel.innerHTML, /data-choice="granted"/);
  direct.settings.click();
  direct.denied.click();
  landing.listeners.storage({ key: PREF });
  assert.equal(landing.sessionStorage.getItem(VISIT), null);
  assert.equal(confirmation(landing).requests.length, 0);
});

test("mesure ChatGPT : visite ou demande expirée, rien ne part", () => {
  for (const key of [VISIT, QUOTE, PREF]) {
    const landing = accepted();
    landing.registerQuote();
    const items = key === PREF ? landing.localStorage : landing.sessionStorage;
    items.setItem(key, JSON.stringify({ ...json(items, key), expires: Date.now() - 1 }));
    assert.equal(confirmation(landing).requests.length, 0, key);
  }
});

test("mesure ChatGPT : une page directe restaurée coupe la visite publicitaire plus récente", () => {
  const direct = load();
  const ad = load({ ...sameTab(direct), search: QUERY });
  ad.granted.click();
  assert.ok(ad.sessionStorage.getItem(VISIT));
  direct.listeners.pageshow({ persisted: true });
  assert.equal(direct.sessionStorage.getItem(VISIT), null);
});

test("mesure ChatGPT : sur un aperçu Netlify, le choix s’affiche mais rien n’est envoyé", () => {
  const preview = load({ hostname: "deploy-preview-1--styledeco-test.netlify.app", search: QUERY });
  assert.equal(preview.panel.hidden, false);
  preview.granted.click();
  preview.registerQuote();
  assert.equal(preview.sessionStorage.size(), 0);
});

test("mesure ChatGPT : un stockage indisponible ne provoque aucune erreur", () => {
  const broken = { getItem() { throw new Error("bloqué"); }, setItem() { throw new Error("bloqué"); }, removeItem() { throw new Error("bloqué"); } };
  const page = load({ search: QUERY, localStorage: broken, sessionStorage: broken });
  page.granted.click();
  assert.doesNotThrow(() => page.registerQuote());
  assert.equal(page.requests.length, 0);
});

test("formulaire : le devis confirmé est signalé, le rappel et l’échec non, et une panne du suivi ne bloque pas la confirmation", async () => {
  const source = read("assets/js/lead-form.js");
  const ids = [];
  for (const [status, result, expected, tracking] of [
    [502, { ok: false }, 0],
    [200, { ok: true, kind: "callback", next: "/merci-rappel.html?s=30" }, 0],
    [200, { ok: true, kind: "devis", next: "/merci.html" }, 1],
    [200, { ok: true, kind: "devis", next: "/merci.html" }, 0, { registerQuote() { throw new Error("panne"); } }],
  ]) {
    ids.length = 0;
    const window = { StyleDecoChatGPTAds: tracking || { registerQuote: (id) => ids.push(id) } };
    vm.runInNewContext(source, { window, crypto: globalThis.crypto, AbortSignal });
    const listeners = {};
    const redirected = [];
    const form = { dataset: {}, addEventListener: (type, fn) => { listeners[type] = fn; }, querySelector: () => null };
    window.StyleDecoLeadForm.bindLeadForm(form, {
      fetchImpl: async () => new Response(JSON.stringify(result), { status }),
      redirect: (url) => redirected.push(url),
      dataLayer: [],
      formData: () => [["lead_priority", result.kind === "callback" ? "RAPPEL_30_MIN" : "STANDARD"]],
    });
    await listeners.submit({ preventDefault() {} });
    assert.equal(ids.length, expected);
    assert.equal(redirected.length, status === 200 ? 1 : 0);
  }
});

test("site : CSP, pages et politique de confidentialité à jour", () => {
  assert.match(read("_headers"), /img-src [^;]*https:\/\/bzr\.openai\.com[ ;]/);
  assert.doesNotMatch(read("_headers").replace(/img-src [^;]*;/, ""), /openai/, "aucune autre autorisation pour OpenAI");
  for (const page of ["index.html", "merci.html", "perpignan.html"]) assert.match(read(page), /chatgpt-ads-measurement\.js\?v=[0-9a-f]{10}/, page);
  const policy = read("legal/politique-confidentialite.html");
  assert.match(policy, /ChatGPT Ads/);
  assert.match(policy, /data-chatgpt-consent-settings/);
  assert.match(policy, /https:\/\/openai\.com\/policies\/eu-privacy-policy\//);
});
