import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const SOURCE = new URL("../sitesite-template/assets/js/lead-form.js", import.meta.url);
const ERROR_MESSAGE =
  "Votre demande n’a pas pu être envoyée. Réessayez dans quelques minutes ou appelez le 06 50 75 62 42.";

const loadModule = () => {
  const window = {};
  vm.runInNewContext(readFileSync(SOURCE, "utf8"), { window, crypto: globalThis.crypto, AbortSignal });
  return window.StyleDecoLeadForm;
};

// Faux formulaire minimal : pas de DOM disponible sans dépendance.
const makeForm = (fields, { priority } = {}) => {
  const listeners = {};
  const status = { hidden: true, textContent: "" };
  const button = { disabled: false, attrs: {}, setAttribute(name, value) { this.attrs[name] = value; }, removeAttribute(name) { delete this.attrs[name]; } };
  const form = {
    dataset: {},
    addEventListener: (type, fn) => { listeners[type] = fn; },
    querySelector: (selector) => ({ ".js-form-status": status, '[type="submit"]': button })[selector] || null,
    fields: { ...fields, ...(priority ? { lead_priority: priority } : {}) },
    submit: async () => {
      const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      await listeners.submit(event);
      return event;
    },
    status,
    button,
  };
  return form;
};

const baseFields = { "form-name": "lead_contact", name: "Marie", phone: "0612345678", city: "Perpignan", details: "Salon", lead_priority: "STANDARD", "bot-field": "" };

const makeDeps = (fetchImpl) => {
  const deps = {
    fetchImpl,
    redirected: [],
    dataLayer: [],
    formData: (form) => Object.entries(form.fields),
  };
  deps.redirect = (url) => deps.redirected.push(url);
  return deps;
};

// Les objets créés dans le contexte vm ont d'autres prototypes : on compare des copies JSON.
const plain = (value) => JSON.parse(JSON.stringify(value));

const okFetch = () => async () => new Response(JSON.stringify({ ok: true }), { status: 200 });

test("succès : POST JSON vers la function, puis redirection vers /merci.html et événement dataLayer", async () => {
  const { bindLeadForm } = loadModule();
  const form = makeForm(baseFields);
  const calls = [];
  const deps = makeDeps(async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); });
  bindLeadForm(form, deps);

  const event = await form.submit();

  assert.equal(event.defaultPrevented, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/.netlify/functions/lead");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.headers.Accept, "application/json");
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.name, "Marie");
  assert.equal(sent["form-name"], "lead_contact");
  assert.match(sent.submission_id, /^[A-Za-z0-9_-]{8,64}$/);
  assert.deepEqual(deps.redirected, ["/merci.html"]);
  assert.deepEqual(plain(deps.dataLayer), [{ event: "form_submit_devis", lead_priority: "STANDARD" }]);
  assert.equal(form.status.hidden, true);
});

test("rappel : événement form_submit_callback", async () => {
  const { bindLeadForm } = loadModule();
  const form = makeForm(baseFields, { priority: "RAPPEL_30_MIN" });
  const deps = makeDeps(okFetch());
  bindLeadForm(form, deps);
  await form.submit();
  assert.deepEqual(plain(deps.dataLayer), [{ event: "form_submit_callback", lead_priority: "RAPPEL_30_MIN" }]);
});

const failures = {
  "HTTP 502": async () => new Response(JSON.stringify({ ok: false }), { status: 502 }),
  "HTTP 400": async () => new Response(JSON.stringify({ ok: false }), { status: 400 }),
  "HTTP 403": async () => new Response("{}", { status: 403 }),
  "HTTP 429 (limitation Netlify)": async () => new Response("{}", { status: 429 }),
  "200 avec ok:false": async () => new Response(JSON.stringify({ ok: false }), { status: 200 }),
  "200 sans JSON": async () => new Response("<html>ok</html>", { status: 200 }),
  "200 avec {}": async () => new Response("{}", { status: 200 }),
  "erreur réseau": async () => { throw new TypeError("Failed to fetch"); },
};

for (const [label, fetchImpl] of Object.entries(failures)) {
  test(`échec (${label}) : message exact, aucune redirection, aucun événement de conversion`, async () => {
    const { bindLeadForm } = loadModule();
    const form = makeForm(baseFields);
    const deps = makeDeps(fetchImpl);
    bindLeadForm(form, deps);

    await form.submit();

    assert.equal(form.status.textContent, ERROR_MESSAGE);
    assert.equal(form.status.hidden, false);
    assert.deepEqual(deps.redirected, []);
    assert.deepEqual(deps.dataLayer, []);
    assert.equal(form.button.disabled, false, "le bouton est réactivé pour réessayer");
  });
}

test("le message d'erreur exporté est exactement celui demandé", () => {
  assert.equal(loadModule().ERROR_MESSAGE, ERROR_MESSAGE);
});

test("nouvelle tentative après échec : même submission_id (idempotence) et message effacé pendant l'envoi", async () => {
  const { bindLeadForm } = loadModule();
  const form = makeForm(baseFields);
  const bodies = [];
  let attempt = 0;
  let statusDuringSecondAttempt;
  const deps = makeDeps(async (url, init) => {
    bodies.push(JSON.parse(init.body));
    attempt += 1;
    if (attempt === 2) statusDuringSecondAttempt = form.status.hidden;
    return attempt === 1 ? new Response("{}", { status: 502 }) : new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  bindLeadForm(form, deps);

  await form.submit();
  assert.equal(form.status.hidden, false);
  await form.submit();

  assert.equal(bodies[0].submission_id, bodies[1].submission_id);
  assert.equal(statusDuringSecondAttempt, true);
  assert.deepEqual(deps.redirected, ["/merci.html"]);
});

test("double soumission pendant l'envoi ignorée ; bouton désactivé et aria-busy pendant l'envoi", async () => {
  const { bindLeadForm } = loadModule();
  const form = makeForm(baseFields);
  let release;
  let calls = 0;
  let disabledDuring;
  const deps = makeDeps(() => {
    calls += 1;
    disabledDuring = [form.button.disabled, form.button.attrs["aria-busy"]];
    return new Promise((resolve) => { release = () => resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })); });
  });
  bindLeadForm(form, deps);

  const first = form.submit();
  const second = await form.submit();
  release();
  await first;

  assert.equal(calls, 1);
  assert.equal(second.defaultPrevented, true);
  assert.deepEqual(disabledDuring, [true, "true"]);
});

test("le honeypot rempli est transmis tel quel : le serveur décide (pas de faux succès côté client)", async () => {
  const { bindLeadForm } = loadModule();
  const form = makeForm({ ...baseFields, "bot-field": "spam" });
  let sent;
  const deps = makeDeps(async (url, init) => { sent = JSON.parse(init.body); return new Response("{}", { status: 400 }); });
  bindLeadForm(form, deps);
  await form.submit();
  assert.equal(sent["bot-field"], "spam");
  assert.equal(form.status.textContent, ERROR_MESSAGE);
  assert.deepEqual(deps.redirected, []);
});
