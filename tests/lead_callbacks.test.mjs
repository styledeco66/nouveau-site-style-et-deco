import assert from "node:assert/strict";
import { test } from "node:test";

import { handleLead } from "../netlify/functions/lead.mjs";
import hours from "../sitesite-template/assets/js/business-hours.js";

// Rappels intelligents, confirmations clients et rappels internes programmés — avec un FAUX Resend (aucun envoi réel).
// Toutes les valeurs sont factices.
const ENV = {
  RESEND_API_KEY: "re_test_fake_key",
  LEAD_TO_EMAIL: "dirigeant@example.test",
  LEAD_FROM_EMAIL: "Style & Déco <no-reply@example.test>",
  LEAD_ALLOWED_ORIGINS: "https://styleetdeco.fr",
  LEAD_QUARANTINE_EMAIL: "tri+verif@example.test",
};
const ENV_ON = { ...ENV, LEAD_CLIENT_CONFIRMATIONS: "on", LEAD_SCHEDULED_REMINDERS: "on" };
const ORIGIN = "https://styleetdeco.fr";
const at = (date, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return () => hours.parisInstant(date, h * 60 + m);
};
// Semaine de référence : lundi 19 octobre 2026 (heure d'été en vigueur), vendredi 23, dimanche 25.
const MON_NOON = at("2026-10-19", "12:00");
const MON_EVENING = at("2026-10-19", "20:00");

const callback = (o = {}) => ({ "form-name": "lead_hero", submission_id: "cb-0001-aaaa-bbbb", name: "Marie Durand", phone: "06 12 34 56 78", email: "marie@example.test", lead_priority: "RAPPEL_30_MIN", "bot-field": "", ...o });
const devis = (o = {}) => ({ "form-name": "lead_contact", submission_id: "dv-0001-aaaa-bbbb", name: "Paul Martin", phone: "0612345678", email: "paul@example.test", city: "Perpignan", details: "Peinture salon 25 m²", lead_priority: "STANDARD", "bot-field": "", ...o });
const req = (body, { headers = {} } = {}) =>
  new Request("https://styleetdeco.fr/.netlify/functions/lead", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: JSON.stringify(body) });

// Faux Resend : reproduit l'idempotence documentée (même clé + même contenu → même réponse sans nouvel envoi ;
// même clé + contenu différent → 409 invalid_idempotent_request), et peut simuler des pannes ciblées.
const fakeResend = ({ fail = () => null } = {}) => {
  const store = new Map();
  const calls = [];
  const sent = [];
  let n = 0;
  const fn = async (url, init) => {
    const body = JSON.parse(init.body);
    const key = init.headers["Idempotency-Key"];
    const kind = key.split("-")[0];
    calls.push({ key, kind, body });
    const forced = fail({ key, kind, body });
    if (forced === "network") throw Object.assign(new Error("boom"), { name: "TimeoutError" });
    if (forced) return new Response(JSON.stringify({ name: "internal_server_error", message: "x" }), { status: forced });
    const digest = JSON.stringify(body);
    if (store.has(key)) {
      const previous = store.get(key);
      if (previous.digest !== digest) return new Response(JSON.stringify({ name: "invalid_idempotent_request" }), { status: 409 });
      return new Response(JSON.stringify({ id: previous.id }), { status: 200 });
    }
    const id = `email_${++n}`;
    store.set(key, { digest, id });
    sent.push({ key, kind, body, id });
    return new Response(JSON.stringify({ id }), { status: 200 });
  };
  fn.calls = calls;
  fn.sent = sent;
  return fn;
};

// Contexte « production » par défaut (les envois secondaires ne sont actifs qu'en production explicite) ; sleep instantané ;
// context.waitUntil simulé : les promesses prolongées sont attendues avant les vérifications.
const run = async (body, { env = ENV_ON, now = MON_NOON, fetchImpl = fakeResend(), deploy = { context: "production" } } = {}) => {
  const pending = [];
  const response = await handleLead(req(body), { env, fetchImpl, now, deploy, sleep: async () => {}, waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
  return { response, fetchImpl, json: await response.clone().json().catch(() => null) };
};
const byKind = (f, kind) => f.sent.filter((m) => m.kind === kind);

test("1. devis normal : notification interne + confirmation client (e-mail obligatoire), page /merci.html", async () => {
  const { response, json, fetchImpl } = await run(devis());
  assert.equal(response.status, 200);
  assert.deepEqual(json, { ok: true, kind: "devis", next: "/merci.html" });
  assert.equal(fetchImpl.sent.length, 2);
  const [main, confirm] = [byKind(fetchImpl, "lead")[0], byKind(fetchImpl, "confirm")[0]];
  assert.deepEqual(main.body.to, ["dirigeant@example.test"]);
  assert.deepEqual(confirm.body.to, ["paul@example.test"]);
  assert.equal(confirm.body.subject, "Votre demande de devis a bien été reçue — Style & Déco");
  assert.equal(confirm.body.reply_to, "style.deco66@gmail.com");
  assert.equal(confirm.body.from, ENV.LEAD_FROM_EMAIL);
  assert.ok(confirm.body.text.includes("reviendrons vers vous sous 24 heures"));
  assert.ok(confirm.body.html.includes("sous 24 heures"));
  for (const forbidden of ["devis est établi", "chantier est programmé", "date d'intervention"]) assert.ok(!confirm.body.text.includes(forbidden));
  assert.ok(!confirm.body.text.includes("Paul Martin"), "aucune donnée saisie n'est recopiée dans la confirmation");
});

test("2. rappel avec e-mail, en journée : alerte immédiate + confirmation « sous 30 minutes », aucun rappel programmé", async () => {
  const { json, fetchImpl } = await run(callback());
  assert.deepEqual(json, { ok: true, kind: "callback", next: "/merci-rappel.html?s=30" });
  assert.deepEqual(fetchImpl.sent.map((m) => m.kind).sort(), ["confirm", "lead"]);
  const alert = byKind(fetchImpl, "lead")[0].body;
  assert.equal(alert.subject, "[RAPPEL CLIENT] Nouveau rappel à effectuer");
  assert.ok(alert.text.includes("Rappeler ce client sous 30 minutes."));
  assert.ok(alert.html.includes('href="tel:0612345678"'), "numéro cliquable");
  assert.ok(alert.text.includes("Page d'accueil") || alert.text.includes("Accueil"), "origine du formulaire");
  assert.equal(alert.scheduled_at, undefined);
  assert.ok(byKind(fetchImpl, "confirm")[0].body.text.includes("Nous vous rappelons sous 30 minutes."));
  assert.equal(byKind(fetchImpl, "confirm")[0].body.subject, "Votre demande de rappel — Style & Déco");
});

test("3. rappel sans e-mail : demande enregistrée normalement, aucune confirmation, aucun blocage", async () => {
  const { response, json, fetchImpl } = await run(callback({ email: undefined }));
  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.deepEqual(fetchImpl.sent.map((m) => m.kind), ["lead"]);
});

test("4. rappel en soirée : alerte immédiate, confirmation « demain », rappel programmé demain 7 h 30 (UTC exact), sans pièce jointe", async () => {
  const { json, fetchImpl } = await run(callback(), { now: MON_EVENING });
  assert.equal(json.next, "/merci-rappel.html?s=20261020");
  assert.deepEqual(fetchImpl.sent.map((m) => m.kind).sort(), ["confirm", "lead", "remind"]);
  const reminder = byKind(fetchImpl, "remind")[0].body;
  assert.equal(reminder.scheduled_at, "2026-10-20T05:30:00.000Z", "7 h 30 à Paris (UTC+2) = 05:30 UTC");
  assert.equal(reminder.subject, "[RAPPEL À EFFECTUER] Client à contacter dès 8 h");
  assert.equal(reminder.attachments, undefined, "pas de pièce jointe sur un e-mail programmé");
  assert.deepEqual(reminder.to, ["dirigeant@example.test"]);
  assert.ok(reminder.text.includes("Un client attend votre rappel à partir de 8 h."));
  assert.ok(reminder.html.includes("tel:0612345678"));
  assert.ok(byKind(fetchImpl, "confirm")[0].body.text.includes("Nous vous recontacterons demain à partir de 8 h."));
  const keys = fetchImpl.sent.map((m) => m.key);
  assert.equal(new Set(keys).size, 3, "trois clés d'idempotence distinctes");
  assert.ok(keys.some((k) => k.startsWith("lead-")) && keys.some((k) => k.startsWith("confirm-")) && keys.some((k) => k.startsWith("remind-")));
  assert.ok(byKind(fetchImpl, "lead")[0].body.text.includes("Rappeler ce client demain dès 8 h."));
});

test("5. vendredi soir et dimanche : rappel programmé lundi 7 h 30, confirmation « lundi à partir de 8 h »", async () => {
  for (const when of [at("2026-10-23", "19:00"), at("2026-10-25", "15:00")]) {
    const { fetchImpl } = await run(callback(), { now: when });
    assert.equal(byKind(fetchImpl, "remind")[0].body.scheduled_at, "2026-10-26T06:30:00.000Z", "lundi 26 octobre : heure d'hiver (UTC+1) → 06:30 UTC");
    assert.ok(byKind(fetchImpl, "confirm")[0].body.text.includes("Nous vous recontacterons lundi à partir de 8 h."));
  }
});

test("6. avant 8 h : 7 h 00 → rappel programmé 7 h 30 le jour même ; 7 h 45 → alerte immédiate seulement", async () => {
  const early = await run(callback(), { now: at("2026-10-20", "07:00") });
  assert.equal(byKind(early.fetchImpl, "remind")[0].body.scheduled_at, "2026-10-20T05:30:00.000Z");
  assert.ok(byKind(early.fetchImpl, "confirm")[0].body.text.includes("aujourd'hui à partir de 8 h"));
  for (const t of ["07:30", "07:45"]) {
    const late = await run(callback(), { now: at("2026-10-20", t) });
    assert.equal(byKind(late.fetchImpl, "remind").length, 0, `${t} : aucun rappel programmé dans le passé`);
    assert.equal(byKind(late.fetchImpl, "lead").length, 1, `${t} : signalée immédiatement`);
  }
});

test("7. jour férié : dimanche avant le lundi de Pâques → mardi 7 h 30 ; jamais un jour fermé", async () => {
  const { fetchImpl } = await run(callback(), { now: at("2026-04-05", "15:00") });
  assert.equal(byKind(fetchImpl, "remind")[0].body.scheduled_at, "2026-04-07T05:30:00.000Z");
  assert.ok(byKind(fetchImpl, "confirm")[0].body.text.includes("mardi à partir de 8 h"));
});

test("8. quarantaine : aucune confirmation, aucun rappel programmé, message conservé et envoyé à l'adresse de vérification", async () => {
  const spam = "Agence web : création de site et SEO, référencement première page Google, audit gratuit https://seo-boost.example";
  const { response, fetchImpl } = await run(callback({ details: spam }), { now: MON_EVENING });
  assert.equal(response.status, 200);
  assert.deepEqual(fetchImpl.sent.map((m) => m.kind), ["lead"]);
  assert.deepEqual(fetchImpl.sent[0].body.to, ["tri+verif@example.test"]);
  assert.ok(fetchImpl.sent[0].body.subject.startsWith("[À VÉRIFIER] "));
  const devisSpam = await run(devis({ details: spam, city: "Paris", name: "Jean" }));
  assert.deepEqual(devisSpam.fetchImpl.sent.map((m) => m.kind), ["lead"]);
});

test("9. honeypot rempli ou e-mail invalide : refus, aucun e-mail d'aucune sorte", async () => {
  for (const bad of [callback({ "bot-field": "robot" }), callback({ email: "pas-un-email" }), devis({ email: "nope" }), devis({ "bot-field": "x" })]) {
    const { response, fetchImpl } = await run(bad);
    assert.equal(response.status, 400);
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test("10. double clic : deux requêtes identiques → un seul e-mail interne, une seule confirmation, un seul rappel", async () => {
  const fetchImpl = fakeResend();
  const a = await run(callback(), { now: MON_EVENING, fetchImpl });
  const b = await run(callback(), { now: MON_EVENING, fetchImpl });
  assert.equal(a.response.status, 200);
  assert.equal(b.response.status, 200);
  assert.equal(byKind(fetchImpl, "lead").length, 1);
  assert.equal(byKind(fetchImpl, "confirm").length, 1);
  assert.equal(byKind(fetchImpl, "remind").length, 1);
});

test("11. nouvelle tentative plus tard (heure de réception différente) : demande déjà reçue, aucun doublon, aucune seconde confirmation", async () => {
  const fetchImpl = fakeResend();
  await run(callback(), { now: MON_EVENING, fetchImpl });
  const retry = await run(callback(), { now: at("2026-10-19", "20:03"), fetchImpl });
  assert.equal(retry.response.status, 200, "pas de faux échec : la demande a déjà été reçue sous cette clé");
  assert.equal(byKind(fetchImpl, "lead").length, 1, "pas de doublon de notification");
  assert.equal(byKind(fetchImpl, "confirm").length, 1);
  assert.equal(byKind(fetchImpl, "remind").length, 1);
});

test("12. timeout transitoire absorbé par une nouvelle tentative (même clé, même contenu) ; échec définitif → erreur visible", async () => {
  let first = true;
  const transient = fakeResend({ fail: ({ kind }) => (kind === "lead" && first ? ((first = false), "network") : null) });
  const a = await run(callback(), { fetchImpl: transient });
  assert.equal(a.response.status, 200);
  assert.equal(transient.calls.filter((c) => c.kind === "lead").length, 2, "une nouvelle tentative, même clé");
  assert.equal(new Set(transient.calls.filter((c) => c.kind === "lead").map((c) => c.key)).size, 1);
  assert.equal(byKind(transient, "lead").length, 1);
  assert.equal(byKind(transient, "confirm").length, 1);
  const dead = fakeResend({ fail: ({ kind }) => (kind === "lead" ? "network" : null) });
  const b = await run(callback(), { fetchImpl: dead });
  assert.equal(b.response.status, 502);
  assert.equal(dead.sent.length, 0, "échec de la notification principale : ni confirmation ni rappel");
});

test("13. échec de la confirmation client : la demande reste reçue, réponse de succès", async () => {
  const fetchImpl = fakeResend({ fail: ({ kind }) => (kind === "confirm" ? 500 : null) });
  const { response, json } = await run(devis(), { fetchImpl });
  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(byKind(fetchImpl, "lead").length, 1);
  assert.equal(byKind(fetchImpl, "confirm").length, 0);
});

test("14. échec de la programmation : alerte principale conservée, message de secours immédiat, aucun doublon de demande", async () => {
  const fetchImpl = fakeResend({ fail: ({ key, body }) => (key.startsWith("remind-") && !key.startsWith("remind-fallback") && body.scheduled_at ? 500 : null) });
  const { response } = await run(callback(), { now: MON_EVENING, fetchImpl });
  assert.equal(response.status, 200);
  assert.equal(byKind(fetchImpl, "lead").length, 1);
  const fallback = fetchImpl.sent.filter((m) => m.key.startsWith("remind-fallback-"));
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].body.scheduled_at, undefined, "message de secours immédiat");
  assert.ok(fallback[0].body.text.includes("n'a pas pu être programmé"));
});

test("15. échec de la notification interne : erreur visible, aucun envoi secondaire", async () => {
  const fetchImpl = fakeResend({ fail: ({ kind }) => (kind === "lead" ? 500 : null) });
  const { response } = await run(devis(), { fetchImpl });
  assert.equal(response.status, 502);
  assert.equal(fetchImpl.sent.length, 0);
});

test("16. même identifiant avec un contenu différent : traité comme déjà reçu (pas de doublon) ; le navigateur change d'identifiant si la saisie change", async () => {
  const fetchImpl = fakeResend();
  await run(callback({ phone: "0611111111" }), { fetchImpl });
  const { response } = await run(callback({ phone: "0622222222" }), { fetchImpl, now: at("2026-10-19", "12:01") });
  assert.equal(response.status, 200);
  assert.equal(byKind(fetchImpl, "lead").length, 1);
  // avec un nouvel identifiant (ce que fait lead-form.js après une modification), la nouvelle demande part normalement
  const fresh = await run(callback({ phone: "0622222222", submission_id: "cb-0002-cccc-dddd" }), { fetchImpl, now: at("2026-10-19", "12:02") });
  assert.equal(fresh.response.status, 200);
  assert.equal(byKind(fetchImpl, "lead").length, 2);
  assert.ok(byKind(fetchImpl, "lead")[1].body.text.includes("0622222222"));
  assert.equal(byKind(fetchImpl, "confirm").length, 2, "chaque demande distincte a sa confirmation");
});

test("17. activation explicite : sans variables, aucun envoi secondaire ; une seule variable activée n'active que sa fonction", async () => {
  const off = await run(callback(), { env: ENV, now: MON_EVENING });
  assert.deepEqual(off.fetchImpl.sent.map((m) => m.kind), ["lead"]);
  const onlyConfirm = await run(callback(), { env: { ...ENV, LEAD_CLIENT_CONFIRMATIONS: "on" }, now: MON_EVENING });
  assert.deepEqual(onlyConfirm.fetchImpl.sent.map((m) => m.kind).sort(), ["confirm", "lead"]);
  const onlyRemind = await run(callback(), { env: { ...ENV, LEAD_SCHEDULED_REMINDERS: "on" }, now: MON_EVENING });
  assert.deepEqual(onlyRemind.fetchImpl.sent.map((m) => m.kind).sort(), ["lead", "remind"]);
});

test("18. deux demandes légitimes distinctes le même jour avec la même adresse : chacune reçoit sa confirmation", async () => {
  const fetchImpl = fakeResend();
  for (let i = 0; i < 3; i++) await run(devis({ submission_id: `dv-multi-${i}-aaaaaaaa`, details: `Projet ${i}` }), { fetchImpl, now: at("2026-10-19", `12:0${i}`) });
  assert.equal(byKind(fetchImpl, "confirm").length, 3);
  assert.equal(new Set(byKind(fetchImpl, "confirm").map((m) => m.key)).size, 3, "clé = identifiant stable de la demande");
});

test("19. logo : image intégrée (CID) nommée, ou repli HTTPS sur notre domaine (LEAD_EMAIL_LOGO_MODE=https)", async () => {
  const cid = byKind((await run(devis())).fetchImpl, "confirm")[0].body;
  assert.equal(cid.attachments.length, 1);
  assert.equal(cid.attachments[0].filename, "logo-style-deco.png");
  assert.equal(cid.attachments[0].content_id, "logo-style-deco");
  assert.equal(cid.attachments[0].content_type, "image/png");
  assert.ok(cid.html.includes('src="cid:logo-style-deco"'));
  assert.ok(!/noname/i.test(JSON.stringify(cid.attachments[0])));
  const https = byKind((await run(devis(), { env: { ...ENV_ON, LEAD_EMAIL_LOGO_MODE: "https" } })).fetchImpl, "confirm")[0].body;
  assert.equal(https.attachments, undefined);
  assert.ok(https.html.includes('src="https://styleetdeco.fr/assets/images/email/logo-style-deco-email.png"'));
});

test("20. contenu saisi échappé dans les e-mails HTML ; journaux sans donnée personnelle", async () => {
  const logs = [];
  const originals = { error: console.error, warn: console.warn };
  console.error = (...a) => logs.push(a.join(" "));
  console.warn = (...a) => logs.push(a.join(" "));
  try {
    const fetchImpl = fakeResend({ fail: ({ kind }) => (kind === "confirm" ? 500 : null) });
    const { fetchImpl: f } = await run(callback({ name: '<img src=x onerror=alert(1)> Zoé', phone: "06 99 88 77 66", email: "zoe.secret@example.test", city: "<b>Ville</b>" }), { fetchImpl, now: MON_EVENING });
    const html = byKind(f, "lead")[0].body.html;
    assert.ok(!html.includes("<img src=x"));
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt; Zoé"));
    assert.ok(!html.includes("<b>Ville</b>"));
  } finally {
    console.error = originals.error;
    console.warn = originals.warn;
  }
  const joined = logs.join("\n");
  assert.ok(logs.length > 0);
  for (const secret of ["Zoé", "0699887766", "06 99 88 77 66", "zoe.secret", "Ville"]) assert.ok(!joined.includes(secret), `le journal ne contient pas ${secret}`);
});

test("21. visiteur dans un autre fuseau / horloge du navigateur erronée : seul l'instant du serveur décide", async () => {
  const { json } = await run(callback({ client_time: "2026-10-19T03:00:00-08:00", timezone: "America/Los_Angeles" }), { now: at("2026-10-24", "11:00") });
  assert.equal(json.next, "/merci-rappel.html?s=20261026", "samedi à Paris → lundi, quoi que dise le navigateur");
});

test("22. sans JavaScript : redirection 303 vers la page de confirmation adaptée", async () => {
  const form = (body) => new Request("https://styleetdeco.fr/.netlify/functions/lead", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN }, body: new URLSearchParams(body).toString() });
  const cb = await handleLead(form({ "form-name": "lead_hero", name: "Marie", phone: "0612345678", lead_priority: "RAPPEL_30_MIN" }), { env: ENV, fetchImpl: fakeResend(), now: MON_EVENING });
  assert.equal(cb.status, 303);
  assert.equal(cb.headers.get("location"), "/merci-rappel.html?s=20261020");
  const dv = await handleLead(form({ "form-name": "lead_contact", name: "Paul", phone: "0612345678", email: "p@example.test", city: "Perpignan", details: "x", lead_priority: "STANDARD" }), { env: ENV, fetchImpl: fakeResend(), now: MON_EVENING });
  assert.equal(dv.headers.get("location"), "/merci.html");
});

test("23. la ville de Perpignan reste transmise ; origine identifiable (lead_hero / lead_contact / lead_perpignan)", async () => {
  const { fetchImpl } = await run(devis({ "form-name": "lead_perpignan", city: "Perpignan" }));
  assert.equal(byKind(fetchImpl, "lead")[0].body.subject, "📩 DEMANDE DE DEVIS - Perpignan");
  assert.ok(byKind(fetchImpl, "lead")[0].body.text.includes("lead_perpignan"));
  const cb = await run(callback({ "form-name": "lead_perpignan", city: "Perpignan" }));
  assert.ok(byKind(cb.fetchImpl, "lead")[0].body.text.includes("Perpignan"));
  assert.ok(byKind(cb.fetchImpl, "lead")[0].body.text.includes("Page Perpignan"));
});
