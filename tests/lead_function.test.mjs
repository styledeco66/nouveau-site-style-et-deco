import assert from "node:assert/strict";
import { test } from "node:test";

import { config, handleLead } from "../netlify/functions/lead.mjs";

// Toutes les valeurs ci-dessous sont factices : aucune vraie clé ni adresse.
const ENV = {
  RESEND_API_KEY: "re_test_fake_key",
  LEAD_TO_EMAIL: "destinataire@example.test",
  LEAD_FROM_EMAIL: "Site <no-reply@example.test>",
  LEAD_ALLOWED_ORIGINS: "https://styleetdeco.fr",
};
const ORIGIN = "https://styleetdeco.fr";
const NOW = () => new Date("2026-09-20T10:00:00.000Z");

const validDevis = (overrides = {}) => ({
  "form-name": "lead_contact",
  submission_id: "3f2b8c1e-6a4d-4c55-9a51-0d5e2f7a9b10",
  name: "Marie Durand",
  phone: "06 12 34 56 78",
  city: "Perpignan",
  details: "Peinture salon 25 m²",
  lead_priority: "STANDARD",
  subject: "sujet fourni par le client, ignoré",
  "bot-field": "",
  ...overrides,
});

const jsonRequest = (body, { origin = ORIGIN, method = "POST", headers = {} } = {}) =>
  new Request("https://styleetdeco.fr/.netlify/functions/lead", {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(origin ? { origin } : {}),
      ...headers,
    },
    body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

const makeFetch = (response = () => new Response(JSON.stringify({ id: "email_1" }), { status: 200 })) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return response();
  };
  fn.calls = calls;
  return fn;
};

const run = (request, { env = ENV, fetchImpl = makeFetch() } = {}) =>
  handleLead(request, { env, fetchImpl, now: NOW }).then((response) => ({ response, fetchImpl }));

test("succès : envoie un e-mail via Resend et répond ok", async () => {
  const { response, fetchImpl } = await run(jsonRequest(validDevis()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(fetchImpl.calls.length, 1);
  const { url, init, body } = fetchImpl.calls[0];
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer re_test_fake_key");
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.equal(body.from, "Site <no-reply@example.test>");
  assert.deepEqual(body.to, ["destinataire@example.test"]);
  assert.equal(body.subject, "📩 DEMANDE DE DEVIS - Style & Deco");
  for (const value of ["Marie Durand", "06 12 34 56 78", "Perpignan", "Peinture salon 25 m²", "lead_contact"]) {
    assert.ok(body.text.includes(value), `text contient ${value}`);
    assert.ok(body.html.includes(value.replace("²", "²")), `html contient ${value}`);
  }
});

test("le sujet est fixé côté serveur : le champ subject du client est ignoré (hero/contact)", async () => {
  const { fetchImpl } = await run(jsonRequest(validDevis({ subject: "Injection\r\nBcc: x@example.test" })));
  assert.equal(fetchImpl.calls[0].body.subject, "📩 DEMANDE DE DEVIS - Style & Deco");
  assert.ok(!fetchImpl.calls[0].body.text.includes("Bcc:"));
});

test("rappel 30 min : nom et ville/détails optionnels, sujet prioritaire", async () => {
  const payload = validDevis({ lead_priority: "RAPPEL_30_MIN", name: "", city: undefined, details: undefined });
  const { response, fetchImpl } = await run(jsonRequest(payload));
  assert.equal(response.status, 200);
  assert.equal(fetchImpl.calls[0].body.subject, "🚨 RAPPEL 30 MIN - Style & Deco");
});

test("devis : nom, ville et détails obligatoires", async () => {
  for (const field of ["name", "city", "details", "phone"]) {
    const { response, fetchImpl } = await run(jsonRequest(validDevis({ [field]: "   " })));
    assert.equal(response.status, 400, field);
    assert.equal((await response.json()).ok, false);
    assert.equal(fetchImpl.calls.length, 0, `aucun envoi si ${field} manque`);
  }
});

test("rappel : le téléphone reste obligatoire", async () => {
  const { response, fetchImpl } = await run(jsonRequest(validDevis({ lead_priority: "RAPPEL_30_MIN", phone: "" })));
  assert.equal(response.status, 400);
  assert.equal(fetchImpl.calls.length, 0);
});

test("téléphone invalide rejeté, formats français courants acceptés", async () => {
  for (const phone of ["abc", "12", "06 12 34 56 78 <script>", "0".repeat(40)]) {
    const { response } = await run(jsonRequest(validDevis({ phone })));
    assert.equal(response.status, 400, phone);
  }
  for (const phone of ["06 50 75 62 42", "0650756242", "+33 6 50 75 62 42", "06.50.75.62.42", "06-50-75-62-42"]) {
    const { response } = await run(jsonRequest(validDevis({ phone })));
    assert.equal(response.status, 200, phone);
  }
});

test("longueurs maximales imposées", async () => {
  for (const [field, length] of [["name", 101], ["city", 101], ["details", 3001]]) {
    const { response } = await run(jsonRequest(validDevis({ [field]: "a".repeat(length) })));
    assert.equal(response.status, 400, field);
  }
});

test("formulaire inconnu rejeté", async () => {
  const { response, fetchImpl } = await run(jsonRequest(validDevis({ "form-name": "autre" })));
  assert.equal(response.status, 400);
  assert.equal(fetchImpl.calls.length, 0);
});

test("lead_perpignan : subject = type de travaux saisi, requis, repris dans le sujet et le corps", async () => {
  const payload = { ...validDevis({ "form-name": "lead_perpignan", subject: "Ravalement façade" }), city: undefined, lead_priority: undefined };
  const { response, fetchImpl } = await run(jsonRequest(payload));
  assert.equal(response.status, 200);
  assert.ok(fetchImpl.calls[0].body.text.includes("Ravalement façade"));
  assert.ok(fetchImpl.calls[0].body.subject.includes("Perpignan"));

  const missing = await run(jsonRequest({ ...payload, subject: "" }));
  assert.equal(missing.response.status, 400);
});

test("honeypot rempli : rien n'est envoyé et la réponse n'est pas un succès", async () => {
  const { response, fetchImpl } = await run(jsonRequest(validDevis({ "bot-field": "http://spam.example" })));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).ok, false);
  assert.equal(fetchImpl.calls.length, 0);
});

test("origine : refus si Origin absent, étranger ou lookalike", async () => {
  for (const origin of [null, "https://evil.example", "https://styleetdeco.fr.evil.example", "http://styleetdeco.fr", "null"]) {
    const { response, fetchImpl } = await run(jsonRequest(validDevis(), { origin }));
    assert.equal(response.status, 403, String(origin));
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test("origine : repli sur Referer si Origin absent ; plusieurs origines configurables", async () => {
  const viaReferer = await run(jsonRequest(validDevis(), { origin: null, headers: { referer: "https://styleetdeco.fr/perpignan.html" } }));
  assert.equal(viaReferer.response.status, 200);

  const env = { ...ENV, LEAD_ALLOWED_ORIGINS: "https://styleetdeco.fr, https://preview.example.test" };
  const preview = await run(jsonRequest(validDevis(), { origin: "https://preview.example.test" }), { env });
  assert.equal(preview.response.status, 200);
});

test("origine autorisée par défaut si LEAD_ALLOWED_ORIGINS absent : domaine canonique uniquement", async () => {
  const env = { ...ENV };
  delete env.LEAD_ALLOWED_ORIGINS;
  const ok = await run(jsonRequest(validDevis()), { env });
  assert.equal(ok.response.status, 200);
  const ko = await run(jsonRequest(validDevis(), { origin: "https://evil.example" }), { env });
  assert.equal(ko.response.status, 403);
});

test("méthodes autres que POST refusées (405)", async () => {
  const { response } = await run(jsonRequest(null, { method: "GET" }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("corps mal formé, type non supporté ou trop gros", async () => {
  const bad = await run(jsonRequest("{pas du json"));
  assert.equal(bad.response.status, 400);

  const wrongType = await run(jsonRequest("x", { headers: { "content-type": "text/plain" } }));
  assert.equal(wrongType.response.status, 415);

  const huge = await run(jsonRequest(validDevis({ details: "a".repeat(30000) })));
  assert.equal(huge.response.status, 413);
  assert.equal(huge.fetchImpl.calls.length, 0);
});

test("accepte application/x-www-form-urlencoded (formulaire sans JavaScript)", async () => {
  const body = new URLSearchParams({ ...validDevis(), "bot-field": "" }).toString();
  const request = new Request("https://styleetdeco.fr/.netlify/functions/lead", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN },
    body,
  });
  const { response, fetchImpl } = await run(request);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/merci.html");
  assert.equal(fetchImpl.calls.length, 1);
});

test("sans JavaScript, un échec renvoie une page HTML avec le message d'erreur exact (jamais de redirection succès)", async () => {
  const body = new URLSearchParams(validDevis()).toString();
  const request = new Request("https://styleetdeco.fr/.netlify/functions/lead", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN },
    body,
  });
  const fetchImpl = makeFetch(() => new Response("{}", { status: 500 }));
  const { response } = await run(request, { fetchImpl });
  assert.equal(response.status, 502);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.equal(response.headers.get("location"), null);
  assert.ok((await response.text()).includes("Votre demande n’a pas pu être envoyée. Réessayez dans quelques minutes ou appelez le 06 50 75 62 42."));
});

test("échec Resend (5xx, 4xx, réseau) : jamais de succès", async () => {
  for (const response of [() => new Response("{}", { status: 500 }), () => new Response("{}", { status: 422 }), () => new Response("{}", { status: 429 })]) {
    const result = await run(jsonRequest(validDevis()), { fetchImpl: makeFetch(response) });
    assert.equal(result.response.status, 502);
    assert.deepEqual(await result.response.json(), { ok: false, error: "delivery_failed" });
  }
  const network = async () => {
    throw new Error("réseau coupé");
  };
  network.calls = [];
  const result = await run(jsonRequest(validDevis()), { fetchImpl: network });
  assert.equal(result.response.status, 502);
  assert.equal((await result.response.json()).ok, false);
});

test("réponse Resend 200 sans identifiant d'e-mail : considérée comme un échec", async () => {
  const result = await run(jsonRequest(validDevis()), { fetchImpl: makeFetch(() => new Response("{}", { status: 200 })) });
  assert.equal(result.response.status, 502);
});

test("configuration manquante : échec explicite (500), aucun appel Resend", async () => {
  for (const key of ["RESEND_API_KEY", "LEAD_TO_EMAIL", "LEAD_FROM_EMAIL"]) {
    const env = { ...ENV };
    delete env[key];
    const { response, fetchImpl } = await run(jsonRequest(validDevis()), { env });
    assert.equal(response.status, 500, key);
    assert.equal((await response.json()).ok, false);
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test("idempotence : Idempotency-Key dérivée du submission_id, stable entre deux tentatives", async () => {
  const first = await run(jsonRequest(validDevis()));
  const second = await run(jsonRequest(validDevis()));
  const key = first.fetchImpl.calls[0].init.headers["Idempotency-Key"];
  assert.match(key, /^lead-[A-Za-z0-9_-]{8,64}$/);
  assert.equal(key, second.fetchImpl.calls[0].init.headers["Idempotency-Key"]);

  const other = await run(jsonRequest(validDevis({ submission_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" })));
  assert.notEqual(key, other.fetchImpl.calls[0].init.headers["Idempotency-Key"]);
});

test("idempotence : submission_id absent ou invalide → clé dérivée du contenu et d'une fenêtre de 10 min", async () => {
  const payload = validDevis({ submission_id: undefined });
  const a = await run(jsonRequest(payload));
  const b = await run(jsonRequest(payload));
  const keyA = a.fetchImpl.calls[0].init.headers["Idempotency-Key"];
  assert.match(keyA, /^lead-[a-f0-9]{32}$/);
  assert.equal(keyA, b.fetchImpl.calls[0].init.headers["Idempotency-Key"]);

  const invalid = await run(jsonRequest(validDevis({ submission_id: "x\r\ny" })));
  assert.match(invalid.fetchImpl.calls[0].init.headers["Idempotency-Key"], /^lead-[a-f0-9]{32}$/);

  const differentContent = await run(jsonRequest(validDevis({ submission_id: undefined, details: "Autre projet" })));
  assert.notEqual(keyA, differentContent.fetchImpl.calls[0].init.headers["Idempotency-Key"]);

  const later = await handleLead(jsonRequest(payload), { env: ENV, fetchImpl: makeFetch(), now: () => new Date("2026-09-20T10:11:00.000Z") });
  assert.equal(later.status, 200);
});

test("minimisation : champs hors liste blanche non transmis, pas d'IP ni d'User-Agent dans l'e-mail", async () => {
  const request = jsonRequest(validDevis({ email_admin: "x@example.test", password: "secret", extra: "zzz" }), {
    headers: { "user-agent": "UA-SECRET-TEST", "x-forwarded-for": "203.0.113.9", "x-nf-client-connection-ip": "203.0.113.9" },
  });
  const { fetchImpl } = await run(request);
  const serialized = JSON.stringify(fetchImpl.calls[0].body);
  for (const leaked of ["x@example.test", "secret", "zzz", "UA-SECRET-TEST", "203.0.113.9", "3f2b8c1e"]) {
    assert.ok(!serialized.includes(leaked), `ne doit pas contenir ${leaked}`);
  }
});

test("le contenu HTML de l'e-mail est échappé", async () => {
  const { fetchImpl } = await run(jsonRequest(validDevis({ details: '<img src=x onerror="alert(1)"> & "quotes"' })));
  const { html, text } = fetchImpl.calls[0].body;
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("&amp;"));
  assert.ok(text.includes("<img src=x"));
});

test("aucune donnée personnelle ni secret dans les logs", async () => {
  const captured = [];
  const original = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = (...args) => captured.push(args.join(" "));
  try {
    await run(jsonRequest(validDevis()), { fetchImpl: makeFetch(() => new Response("{}", { status: 500 })) });
  } finally {
    Object.assign(console, original);
  }
  const output = captured.join("\n");
  for (const leaked of ["Marie Durand", "06 12 34 56 78", "re_test_fake_key", "destinataire@example.test"]) {
    assert.ok(!output.includes(leaked), `log ne doit pas contenir ${leaked}`);
  }
});

test("les réponses ne sont pas mises en cache", async () => {
  const { response } = await run(jsonRequest(validDevis()));
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("la function limite nativement les POST de demandes par IP", () => {
  assert.deepEqual(config, {
    path: "/.netlify/functions/lead",
    method: "POST",
    rateLimit: {
      action: "rewrite",
      to: "/lead-rate-limited.html",
      windowLimit: 10,
      windowSize: 60,
      aggregateBy: ["ip", "domain"],
    },
  });
});
