import assert from "node:assert/strict";
import { test } from "node:test";

import leadHandler, { handleLead } from "../netlify/functions/lead.mjs";
import hours from "../sitesite-template/assets/js/business-hours.js";

// Fiabilité des envois (lot 2, corrections) : conflits d'idempotence Resend, simultanéité, lenteurs, context.waitUntil,
// activation strictement en production. FAUX Resend uniquement : aucun e-mail réel.
const ENV = {
  RESEND_API_KEY: "re_test_fake_key",
  LEAD_TO_EMAIL: "dirigeant@example.test",
  LEAD_FROM_EMAIL: "Style & Déco <no-reply@example.test>",
  LEAD_ALLOWED_ORIGINS: "https://styleetdeco.fr",
  LEAD_QUARANTINE_EMAIL: "tri+verif@example.test",
  LEAD_CLIENT_CONFIRMATIONS: "on",
  LEAD_SCHEDULED_REMINDERS: "on",
};
const PROD = { context: "production" };
const at = (date, hhmm) => { const [h, m] = hhmm.split(":").map(Number); return () => hours.parisInstant(date, h * 60 + m); };
const EVENING = at("2026-10-19", "20:00");
const callback = (o = {}) => ({ "form-name": "lead_hero", submission_id: "rel-0001-aaaa-bbbb", name: "Marie Durand", phone: "0612345678", email: "marie@example.test", lead_priority: "RAPPEL_30_MIN", "bot-field": "", ...o });
const devis = (o = {}) => ({ "form-name": "lead_contact", submission_id: "rel-dv-0001-aaaa", name: "Paul Martin", phone: "0612345678", email: "paul@example.test", city: "Perpignan", details: "Peinture salon", lead_priority: "STANDARD", "bot-field": "", ...o });
const req = (body) => new Request("https://styleetdeco.fr/.netlify/functions/lead", { method: "POST", headers: { "content-type": "application/json", origin: "https://styleetdeco.fr" }, body: JSON.stringify(body) });

// Faux Resend asynchrone : idempotence documentée (même clé + même contenu → même réponse ; contenu différent → 409
// invalid_idempotent_request ; clé en cours de traitement → 409 concurrent_idempotent_requests), latence et verrous par type d'envoi.
const fakeResend = ({ script = () => null, gate = () => null } = {}) => {
  const done = new Map();
  const inflight = new Set();
  const calls = [];
  const sent = [];
  let n = 0;
  const fn = async (url, init) => {
    const body = JSON.parse(init.body);
    const key = init.headers["Idempotency-Key"];
    const kind = key.split("-")[0];
    const attempt = calls.filter((c) => c.key === key).length + 1;
    calls.push({ key, kind, body, attempt });
    const forced = script({ key, kind, body, attempt });
    if (forced === "network") throw Object.assign(new Error("boom"), { name: "TimeoutError" });
    if (typeof forced === "number") return new Response(JSON.stringify({ name: forced === 409 ? "concurrent_idempotent_requests" : "internal_server_error" }), { status: forced });
    if (forced === "invalid") return new Response(JSON.stringify({ name: "invalid_idempotent_request" }), { status: 409 });
    const digest = JSON.stringify(body);
    if (done.has(key)) {
      return done.get(key).digest !== digest
        ? new Response(JSON.stringify({ name: "invalid_idempotent_request" }), { status: 409 })
        : new Response(JSON.stringify({ id: done.get(key).id }), { status: 200 });
    }
    if (inflight.has(key)) return new Response(JSON.stringify({ name: "concurrent_idempotent_requests" }), { status: 409 });
    inflight.add(key);
    try {
      await gate({ key, kind, body });
      const id = `email_${++n}`;
      done.set(key, { digest, id });
      sent.push({ key, kind, body, id });
      return new Response(JSON.stringify({ id }), { status: 200 });
    } finally {
      inflight.delete(key);
    }
  };
  fn.calls = calls;
  fn.sent = sent;
  return fn;
};
const kinds = (f) => f.sent.map((m) => m.kind).sort().join(",");
const byKind = (f, k) => f.sent.filter((m) => m.kind === k);

// Exécute une requête ; renvoie la réponse AVANT la fin des envois secondaires (context.waitUntil simulé), puis permet de les attendre.
const start = (body, { env = ENV, now = EVENING, fetchImpl = fakeResend(), deploy = PROD, waitUntil = true, sleeps = [] } = {}) => {
  const pending = [];
  const sleep = async (ms) => { sleeps.push(ms); };
  const responded = handleLead(req(body), { env, fetchImpl, now, deploy, sleep, waitUntil: waitUntil ? (p) => pending.push(p) : null });
  return { responded, pending, fetchImpl, sleeps, settle: async () => { const response = await responded; await Promise.all(pending); return response; } };
};
const run = async (body, options) => { const r = start(body, options); const response = await r.settle(); return { response, ...r }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------- 1. confirmations : par demande, jamais par adresse
test("deux devis distincts le même jour avec la même adresse : deux confirmations (clés liées à l'identifiant de chaque demande)", async () => {
  const f = fakeResend();
  await run(devis({ submission_id: "dv-aaaa-0001-xxxx", details: "Salon" }), { fetchImpl: f });
  await run(devis({ submission_id: "dv-aaaa-0002-yyyy", details: "Chambre" }), { fetchImpl: f, now: at("2026-10-19", "20:30") });
  assert.equal(byKind(f, "lead").length, 2);
  assert.equal(byKind(f, "confirm").length, 2);
  assert.deepEqual(byKind(f, "confirm").map((m) => m.key), ["confirm-devis-dv-aaaa-0001-xxxx", "confirm-devis-dv-aaaa-0002-yyyy"]);
});

test("une même soumission répétée (double clic, rechargement, tentative tardive) : une seule notification, une seule confirmation, un seul rappel", async () => {
  const f = fakeResend();
  await run(callback(), { fetchImpl: f });
  await run(callback(), { fetchImpl: f }); // double clic : même contenu
  await run(callback(), { fetchImpl: f, now: at("2026-10-19", "20:07") }); // plus tard : contenu différent (heure)
  assert.equal(kinds(f), "confirm,lead,remind");
});

// ---------------------------------------------------------------- 2. conflits 409
test("deux appels simultanés : un seul envoi, aucun succès prématuré (le second attend la fin du premier)", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const f = fakeResend({ gate: ({ kind }) => (kind === "lead" ? gate : null) });
  const sleeps = [];
  const sleep = async (ms) => { sleeps.push(ms); await tick(); release(); await tick(); }; // le premier envoi se termine pendant l'attente
  const a = handleLead(req(callback()), { env: ENV, fetchImpl: f, now: EVENING, deploy: PROD, sleep, waitUntil: () => {} });
  await tick();
  const b = handleLead(req(callback()), { env: ENV, fetchImpl: f, now: EVENING, deploy: PROD, sleep, waitUntil: () => {} });
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.status, 200);
  assert.equal(rb.status, 200);
  assert.equal(byKind(f, "lead").length, 1, "un seul e-mail interne");
  assert.ok(f.calls.filter((c) => c.kind === "lead").some((c) => c.attempt >= 2), "le second appel a bien dû réessayer après un 409");
  assert.ok(sleeps.length >= 1, "attente avant la nouvelle tentative");
});

test("conflit 409 temporaire (concurrent) : nouvelles tentatives avec la MÊME clé et le même contenu, puis succès — notification, confirmation et rappel", async () => {
  for (const kind of ["lead", "confirm", "remind"]) {
    const f = fakeResend({ script: ({ kind: k, attempt }) => (k === kind && attempt <= 2 ? 409 : null) });
    const { response, sleeps } = await run(callback(), { fetchImpl: f });
    assert.equal(response.status, 200, kind);
    assert.equal(kinds(f), "confirm,lead,remind", `${kind} : finalement envoyé une seule fois`);
    const attempts = f.calls.filter((c) => c.kind === kind);
    assert.equal(attempts.length, 3, kind);
    assert.equal(new Set(attempts.map((c) => c.key)).size, 1, `${kind} : même clé`);
    assert.equal(new Set(attempts.map((c) => JSON.stringify(c.body))).size, 1, `${kind} : même contenu`);
    assert.ok(sleeps.length >= 2);
  }
});

test("conflit 409 définitif (concurrent jamais résolu) : jamais compté comme un succès ; nombre de tentatives borné ; aucun doublon", async () => {
  const main = fakeResend({ script: ({ kind }) => (kind === "lead" ? 409 : null) });
  const a = await run(callback(), { fetchImpl: main });
  assert.equal(a.response.status, 502, "une notification encore « en cours » n'est pas un succès");
  assert.equal(main.sent.length, 0, "aucun envoi secondaire sans notification principale acceptée");
  assert.ok(main.calls.length <= 4);
  assert.equal(new Set(main.calls.map((c) => c.key)).size, 1);

  const secondary = fakeResend({ script: ({ kind }) => (kind !== "lead" ? 409 : null) });
  const b = await run(callback(), { fetchImpl: secondary });
  assert.equal(b.response.status, 200, "la demande est reçue : aucun faux échec");
  assert.equal(kinds(secondary), "lead", "confirmation et rappel non comptés comme envoyés");
  assert.ok(secondary.calls.filter((c) => c.kind === "confirm").length <= 4);
});

test("409 invalid_idempotent_request (clé déjà utilisée avec un autre contenu) : jamais rejoué ; notification = déjà reçue, confirmation et rappel = déjà traités, pas de secours", async () => {
  const f = fakeResend({ script: ({ kind }) => (kind === "lead" || kind === "confirm" || kind === "remind" ? "invalid" : null) });
  const { response } = await run(callback(), { fetchImpl: f });
  assert.equal(response.status, 200);
  assert.equal(f.sent.length, 0, "rien n'est renvoyé");
  assert.equal(f.calls.length, 1, "demande déjà traitée : un seul appel, pas de secondaires");
  const g = fakeResend({ script: ({ kind }) => (kind === "confirm" || kind === "remind" ? "invalid" : null) });
  await run(callback(), { fetchImpl: g });
  assert.equal(g.calls.filter((c) => c.kind === "remind").length, 1);
  assert.equal(g.calls.filter((c) => c.key.startsWith("remind-fallback")).length, 0, "pas d'e-mail de secours : le rappel existe déjà");
  assert.equal(g.calls.filter((c) => c.kind === "confirm").length, 1, "jamais rejoué");
});

test("erreurs transitoires (timeout réseau, 500, 429) : nouvelle tentative idempotente ; refus définitif (422) : aucune nouvelle tentative", async () => {
  for (const fault of ["network", 500, 429]) {
    let first = true;
    const f = fakeResend({ script: ({ kind }) => (kind === "confirm" && first ? ((first = false), fault) : null) });
    const { response } = await run(devis(), { fetchImpl: f });
    assert.equal(response.status, 200);
    assert.equal(byKind(f, "confirm").length, 1, String(fault));
    assert.equal(f.calls.filter((c) => c.kind === "confirm").length, 2, String(fault));
  }
  const refused = fakeResend({ script: ({ kind }) => (kind === "confirm" ? 422 : null) });
  const { response } = await run(devis(), { fetchImpl: refused });
  assert.equal(response.status, 200);
  assert.equal(refused.calls.filter((c) => c.kind === "confirm").length, 1, "422 : définitif");
});

// ---------------------------------------------------------------- 3. temps de réponse, context.waitUntil
const gated = (which) => {
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  return { release, gate: ({ kind }) => (kind === which ? hold : null) };
};

test("confirmation client lente : le visiteur reçoit sa confirmation dès que la notification principale est acceptée", async () => {
  const slow = gated("confirm");
  const f = fakeResend({ gate: slow.gate });
  const r = start(devis(), { fetchImpl: f });
  const response = await r.responded; // ne dépend pas de la confirmation, encore bloquée
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, kind: "devis", next: "/merci.html" });
  assert.equal(byKind(f, "lead").length, 1);
  assert.equal(byKind(f, "confirm").length, 0, "la confirmation est encore en cours");
  assert.equal(r.pending.length, 1, "le travail secondaire est confié à context.waitUntil (promesse non abandonnée)");
  slow.release();
  await Promise.all(r.pending);
  assert.equal(byKind(f, "confirm").length, 1, "elle part après la réponse");
});

test("programmation du rappel lente : même principe, aucun faux échec", async () => {
  const slow = gated("remind");
  const f = fakeResend({ gate: slow.gate });
  const r = start(callback(), { fetchImpl: f });
  const response = await r.responded;
  assert.equal(response.status, 200);
  assert.equal(byKind(f, "remind").length, 0);
  slow.release();
  await Promise.all(r.pending);
  assert.equal(kinds(f), "confirm,lead,remind");
});

test("notification principale lente : la réponse attend uniquement la notification principale, jamais les envois secondaires", async () => {
  const slow = gated("lead");
  const f = fakeResend({ gate: slow.gate });
  const r = start(callback(), { fetchImpl: f });
  let answered = false;
  r.responded.then(() => { answered = true; });
  await tick(); await tick();
  assert.equal(answered, false, "tant que Resend n'a pas accepté la notification, pas de confirmation de soumission");
  assert.equal(f.calls.filter((c) => c.kind !== "lead").length, 0, "aucun envoi secondaire avant l'acceptation");
  slow.release();
  assert.equal((await r.responded).status, 200);
  await Promise.all(r.pending);
  assert.equal(kinds(f), "confirm,lead,remind");
});

test("timeout navigateur (15 s) : les nouvelles tentatives de la notification principale sont bornées, les secondaires n'allongent jamais la réponse", async () => {
  const f = fakeResend({ script: ({ kind }) => (kind === "lead" ? 500 : null) });
  const sleeps = [];
  const { response } = await run(callback(), { fetchImpl: f, sleeps });
  assert.equal(response.status, 502);
  assert.ok(f.calls.length <= 4, `tentatives bornées (${f.calls.length})`);
  assert.ok(sleeps.reduce((a, b) => a + b, 0) <= 3000, "attentes cumulées bornées (≤ 3 s ; budget total < 15 s)");
  const slow = gated("confirm");
  const g = fakeResend({ gate: slow.gate });
  const r = start(devis(), { fetchImpl: g });
  assert.equal((await r.responded).status, 200, "confirmation bloquée : la réponse est déjà partie");
  slow.release();
  await Promise.all(r.pending);
});

test("échec d'une opération secondaire : les autres continuent, la demande reste reçue, aucune erreur visible", async () => {
  const f = fakeResend({ script: ({ kind }) => (kind === "confirm" ? 500 : null) });
  const { response } = await run(callback(), { fetchImpl: f });
  assert.equal(response.status, 200);
  assert.equal(kinds(f), "lead,remind");
});

test("sans context.waitUntil : les envois secondaires sont attendus (jamais de promesse abandonnée), réponse inchangée", async () => {
  const { response, fetchImpl } = await run(callback(), { waitUntil: false });
  assert.equal(response.status, 200);
  assert.equal(kinds(fetchImpl), "confirm,lead,remind");
});

test("le gestionnaire Netlify transmet context.waitUntil à la fonction (promesse prolongée, réponse immédiate)", async () => {
  const saved = { fetch: globalThis.fetch, env: { ...process.env } };
  const f = fakeResend();
  const extended = [];
  Object.assign(process.env, ENV);
  globalThis.fetch = f;
  try {
    const response = await leadHandler(req(callback()), { deploy: PROD, waitUntil: (p) => extended.push(p) });
    assert.equal(response.status, 200);
    assert.equal(extended.length, 1);
    await Promise.all(extended);
    assert.equal(kinds(f), "confirm,lead,remind");
  } finally {
    globalThis.fetch = saved.fetch;
    for (const k of Object.keys(ENV)) { if (k in saved.env) process.env[k] = saved.env[k]; else delete process.env[k]; }
  }
});

test("journaux : codes seulement, aucune donnée personnelle, même en cas de conflit ou d'échec", async () => {
  const logs = [];
  const saved = { error: console.error, warn: console.warn };
  console.error = (...a) => logs.push(a.join(" "));
  console.warn = (...a) => logs.push(a.join(" "));
  try {
    const f = fakeResend({ script: ({ kind, attempt }) => (kind === "confirm" ? 500 : kind === "remind" ? "invalid" : kind === "lead" && attempt === 1 ? "network" : null) });
    await run(callback({ name: "Zoé Secrète", phone: "06 99 88 77 66", email: "zoe.secret@example.test", city: "Villeneuve" }), { fetchImpl: f });
  } finally { console.error = saved.error; console.warn = saved.warn; }
  const joined = logs.join("\n");
  assert.ok(logs.length >= 3);
  for (const secret of ["Zoé", "Secrète", "0699887766", "06 99 88 77 66", "zoe.secret", "Villeneuve"]) assert.ok(!joined.includes(secret), secret);
});

// ---------------------------------------------------------------- 4. activation strictement en production
test("envois secondaires : uniquement si le contexte est explicitement « production »", async () => {
  const cases = [
    ["production (contexte d'exécution)", ENV, { context: "production" }, true],
    ["production (variable CONTEXT)", { ...ENV, CONTEXT: "production" }, null, true],
    ["Deploy Preview", ENV, { context: "deploy-preview" }, false],
    ["Deploy Preview (variable CONTEXT)", { ...ENV, CONTEXT: "deploy-preview" }, { context: "production" }, false],
    ["Branch Deploy", ENV, { context: "branch-deploy" }, false],
    ["contexte absent", ENV, null, false],
    ["contexte absent (objet vide)", ENV, {}, false],
    ["contexte vide", { ...ENV, CONTEXT: "  " }, { context: "" }, false],
    ["contexte inconnu", ENV, { context: "staging" }, false],
    ["contexte inconnu (variable)", { ...ENV, CONTEXT: "dev" }, null, false],
    ["contexte ambigu (variable et exécution en désaccord)", { ...ENV, CONTEXT: "production" }, { context: "deploy-preview" }, false],
    ["casse différente", ENV, { context: "Production" }, false],
  ];
  for (const [label, env, deploy, enabled] of cases) {
    const { response, fetchImpl } = await run(callback(), { env, deploy });
    assert.equal(response.status, 200, label);
    assert.equal(kinds(fetchImpl), enabled ? "confirm,lead,remind" : "lead", label);
  }
});

test("variables activées globalement + Deploy Preview : jamais de confirmation client, la notification principale reste envoyée", async () => {
  const { response, fetchImpl } = await run(devis(), { env: { ...ENV, CONTEXT: "deploy-preview" }, deploy: { context: "deploy-preview" } });
  assert.equal(response.status, 200);
  assert.equal(kinds(fetchImpl), "lead");
  assert.ok(!fetchImpl.calls.some((c) => c.body.to.includes("paul@example.test")), "aucun e-mail vers le client");
});

// ---------------------------------------------------------------- quarantaine préservée
test("quarantaine préservée en production avec les envois activés : ni confirmation, ni rappel, message conservé", async () => {
  const spam = "Agence web : création de site et SEO, référencement première page Google, audit gratuit https://seo-boost.example";
  for (const body of [callback({ details: spam }), devis({ details: spam, city: "Paris", name: "Jean" })]) {
    const { response, fetchImpl } = await run(body);
    assert.equal(response.status, 200);
    assert.equal(kinds(fetchImpl), "lead");
    assert.deepEqual(fetchImpl.sent[0].body.to, ["tri+verif@example.test"]);
    assert.ok(fetchImpl.sent[0].body.subject.startsWith("[À VÉRIFIER] "));
  }
});
