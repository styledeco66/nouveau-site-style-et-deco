import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

import { handleLead } from "../netlify/functions/lead.mjs";
import hours from "../sitesite-template/assets/js/business-hours.js";

// Photos jointes à un devis. Resend simulé : aucun envoi réel, données fictives. Règle première : une photo ne fait jamais
// perdre une demande.
const ENV = {
  RESEND_API_KEY: "re_test_fake_key",
  LEAD_TO_EMAIL: "dirigeant@example.test",
  LEAD_FROM_EMAIL: "Style & Déco <no-reply@example.test>",
  LEAD_ALLOWED_ORIGINS: "https://styleetdeco.fr",
  LEAD_CLIENT_CONFIRMATIONS: "on",
};
const NOW = () => hours.parisInstant("2026-10-19", 11 * 60 + 20);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString("base64");
const lead = (o = {}) => ({ "form-name": "lead_perpignan", submission_id: "photo-0001-aaaa", name: "Marie Exemple", phone: "06 12 34 56 78", email: "marie@example.com", city: "Perpignan", details: "Salon à repeindre", lead_priority: "STANDARD", "bot-field": "", ...o });

const run = async (body, { refuse = () => false } = {}) => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    const message = { key: init.headers["Idempotency-Key"], body: JSON.parse(init.body) };
    sent.push(message);
    if (refuse(message)) return new Response(JSON.stringify({ name: "validation_error" }), { status: 422 });
    return new Response(JSON.stringify({ id: `e${sent.length}` }), { status: 200 });
  };
  const pending = [];
  const request = new Request("https://styleetdeco.fr/.netlify/functions/lead", { method: "POST", headers: { "content-type": "application/json", origin: "https://styleetdeco.fr" }, body: JSON.stringify(body) });
  const response = await handleLead(request, { env: ENV, fetchImpl, now: NOW, deploy: { context: "production" }, sleep: async () => {}, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return { response, json: await response.json(), sent, main: sent.filter((m) => m.key.startsWith("lead-")), confirm: sent.find((m) => m.key.startsWith("confirm-")) };
};

test("photos : jointes à la seule notification interne, affichées dans le message", async () => {
  const { response, json, main, confirm } = await run(lead({ photos: [JPEG, JPEG, JPEG] }));
  assert.equal(response.status, 200);
  assert.equal(json.photosLost, undefined);
  assert.equal(main.length, 1);
  const { attachments, html, text } = main[0].body;
  assert.deepEqual(attachments.map((a) => [a.filename, a.content_id, a.content_type]), [1, 2, 3].map((n) => [`photo-${n}.jpg`, `photo-${n}`, "image/jpeg"]));
  assert.equal(attachments[0].content, JPEG);
  for (const n of [1, 2, 3]) assert.match(html, new RegExp(`<img class="sd-photo" src="cid:photo-${n}" width="256" alt="Photo ${n} envoyée par le client"`));
  assert.ok(html.indexOf("Description des travaux") < html.indexOf("Photos du client (3)"), "sous la description");
  assert.ok(html.indexOf("Photos du client (3)") < html.indexOf("Informations de suivi"), "avant le suivi");
  assert.match(text, /Photos : 3 jointes à ce message/);
  assert.equal(confirm.body.attachments, undefined, "aucune photo dans la confirmation au client");
  assert.ok(!confirm.body.html.includes("cid:"));
});

test("photos : un fichier illisible est écarté et signalé, la demande passe", async () => {
  const bad = [JPEG, "aGVsbG8=", "<script>", 42, "/9j/" + "A".repeat(1_300_000)];
  const { response, json, main } = await run(lead({ photos: bad }));
  assert.equal(response.status, 200);
  assert.equal(json.photosLost, 4);
  assert.equal(main[0].body.attachments.length, 1);
  assert.match(main[0].body.text, /Photos non transmises : 4 : à demander au client/);
});

test("photos : au-delà de cinq, les suivantes sont signalées", async () => {
  const { json, main } = await run(lead({ photos: Array(7).fill(JPEG) }));
  assert.equal(main[0].body.attachments.length, 5);
  assert.equal(json.photosLost, 2);
});

test("photos : si le service d'envoi les refuse, la demande repart sans elles avec une autre clé", async () => {
  const { response, json, main } = await run(lead({ photos: [JPEG, JPEG] }), { refuse: (m) => Boolean(m.body.attachments) });
  assert.equal(response.status, 200);
  assert.equal(json.photosLost, 2);
  assert.equal(main.length, 2);
  assert.equal(main[1].key, `${main[0].key}-sans-photos`);
  assert.equal(main[1].body.attachments, undefined);
  assert.ok(!main[1].body.html.includes("cid:"));
  assert.match(main[1].body.html, /Le client a voulu joindre 2 photos qui n&#39;ont pas pu être transmises/);
});

test("photos : signalement par le navigateur quand il n'a pas pu les transmettre", async () => {
  const { json, main } = await run(lead({ photos_lost: 3 }));
  assert.equal(json.photosLost, 3);
  assert.equal(main[0].body.attachments, undefined);
  assert.match(main[0].body.text, /Photos non transmises : 3/);
});

test("photos : ignorées sur une demande de rappel", async () => {
  const { response, json, main } = await run(lead({ lead_priority: "RAPPEL_30_MIN", photos: [JPEG] }));
  assert.equal(response.status, 200);
  assert.equal(json.photosLost, undefined);
  assert.equal(main[0].body.attachments, undefined);
});

test("photos : les limites de taille restent appliquées aux champs texte et à la demande entière", async () => {
  const text = await run(lead({ photos: [JPEG], details: "a".repeat(30000) }));
  assert.equal(text.response.status, 413);
  const huge = await run(lead({ photos: Array(5).fill("/9j/" + "A".repeat(1_150_000)) }));
  assert.equal(huge.response.status, 413);
  assert.equal(huge.sent.length, 0);
});

// ── Navigateur (lead-form.js) ────────────────────────────────────────────────────────────────────
const SOURCE = readFileSync(new URL("../sitesite-template/assets/js/lead-form.js", import.meta.url), "utf8");

const submit = async ({ photos, responses, priority = "STANDARD" }) => {
  const window = {};
  vm.runInNewContext(SOURCE, { window, crypto: globalThis.crypto, AbortSignal });
  const listeners = {};
  const status = { hidden: true, textContent: "" };
  const button = { disabled: false, setAttribute() {}, removeAttribute() {} };
  const form = { dataset: {}, addEventListener: (type, fn) => { listeners[type] = fn; }, querySelector: (s) => ({ ".js-form-status": status, '[type="submit"]': button })[s] || null };
  const result = { calls: [], redirected: [], lost: [], status, button };
  window.StyleDecoLeadForm.bindLeadForm(form, {
    formData: () => Object.entries(lead({ lead_priority: priority })),
    photos: { collect: async () => photos },
    fetchImpl: async (url, init) => {
      result.calls.push(JSON.parse(init.body));
      const next = responses[result.calls.length - 1];
      if (next === "coupure") throw new Error("réseau");
      return new Response(JSON.stringify(next), { status: next.ok ? 200 : 502 });
    },
    redirect: (url) => result.redirected.push(url),
    markPhotosLost: (count) => result.lost.push(count),
    dataLayer: [],
  });
  await listeners.submit({ preventDefault() {} });
  return result;
};
const CHOSEN = [{ id: 1, data: JPEG }, { id: 2, data: JPEG }];

test("navigateur : les photos partent avec la demande", async () => {
  const r = await submit({ photos: CHOSEN, responses: [{ ok: true }] });
  assert.equal(r.calls.length, 1);
  assert.deepEqual(r.calls[0].photos, [JPEG, JPEG]);
  assert.deepEqual(r.lost, []);
  assert.deepEqual(r.redirected, ["/merci.html"]);
});

test("navigateur : si l'envoi avec photos échoue, la demande repart sans elles et le visiteur sera prévenu", async () => {
  const r = await submit({ photos: CHOSEN, responses: ["coupure", { ok: true, photosLost: 2 }] });
  assert.equal(r.calls.length, 2);
  assert.equal(r.calls[1].photos, undefined);
  assert.equal(r.calls[1].photos_lost, 2);
  assert.equal(r.calls[1].submission_id, r.calls[0].submission_id, "même identifiant : pas de doublon");
  assert.deepEqual(r.lost, [2]);
  assert.deepEqual(r.redirected, ["/merci.html"]);
});

test("navigateur : photos écartées par le serveur signalées ; panne complète : message d'erreur habituel", async () => {
  const partial = await submit({ photos: CHOSEN, responses: [{ ok: true, photosLost: 1 }] });
  assert.deepEqual(partial.lost, [1]);
  const down = await submit({ photos: CHOSEN, responses: ["coupure", "coupure"] });
  assert.deepEqual(down.redirected, []);
  assert.match(down.status.textContent, /Votre demande n’a pas pu être envoyée/);
  assert.equal(down.button.disabled, false);
});

test("navigateur : aucune photo envoyée avec une demande de rappel", async () => {
  const r = await submit({ photos: CHOSEN, responses: [{ ok: true }], priority: "RAPPEL_30_MIN" });
  assert.equal(r.calls[0].photos, undefined);
});

test("pages : tout formulaire de devis propose l'ajout de photos", () => {
  const site = new URL("../sitesite-template/", import.meta.url);
  const forms = readdirSync(site, { recursive: true })
    .filter((file) => file.endsWith(".html"))
    .flatMap((file) => (readFileSync(new URL(file, site), "utf8").match(/<form\b[\s\S]*?<\/form>/g) || []).map((html) => ({ file, html })))
    .filter(({ html }) => html.includes('name="details"'));
  assert.equal(forms.length, 11);
  for (const { file, html } of forms) {
    assert.match(html, /data-photos/, file);
    assert.match(html, /class="photos__fichier" type="file" accept="image\/\*" multiple/, file);
  }
});
