import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { handleLead } from "../netlify/functions/lead.mjs";
import hours from "../sitesite-template/assets/js/business-hours.js";

// Notification interne d'une demande de DEVIS (design B) : remplace l'ancien tableau, une seule notification, protections conservées.
// Resend simulé : aucun envoi réel, données fictives.
const ENV = {
  RESEND_API_KEY: "re_test_fake_key",
  LEAD_TO_EMAIL: "dirigeant@example.test",
  LEAD_FROM_EMAIL: "Style & Déco <no-reply@example.test>",
  LEAD_ALLOWED_ORIGINS: "https://styleetdeco.fr",
  LEAD_QUARANTINE_EMAIL: "tri+verif@example.test",
  LEAD_CLIENT_CONFIRMATIONS: "on",
};
const NOW = () => hours.parisInstant("2026-10-19", 11 * 60 + 20);
const LOGO = "https://styleetdeco.fr/assets/images/email/logo-style-deco-email.png";
const request = (body) => new Request("https://styleetdeco.fr/.netlify/functions/lead", { method: "POST", headers: { "content-type": "application/json", origin: "https://styleetdeco.fr" }, body: JSON.stringify(body) });
const lead = (o = {}) => ({ "form-name": "lead_contact", submission_id: "dvn-0001-aaaa-bbbb", name: "Marie Exemple-Durand", phone: "06 12 34 56 78", email: "marie.exemple@example.com", city: "Perpignan", details: "Bonjour,\nsalon-séjour de 38 m²\n\n- murs et plafonds\n- fissures", lead_priority: "STANDARD", "bot-field": "", ...o });
const run = async (body, env = ENV) => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ key: init.headers["Idempotency-Key"], body: JSON.parse(init.body) }); return new Response(JSON.stringify({ id: `e${sent.length}` }), { status: 200 }); };
  const pending = [];
  const response = await handleLead(request(body), { env, fetchImpl, now: NOW, deploy: { context: "production" }, sleep: async () => {}, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return { response, sent, main: sent.find((m) => m.key.startsWith("lead-")), confirm: sent.find((m) => m.key.startsWith("confirm-")) };
};
const SUBJECTS = { lead_hero: "📩 DEMANDE DE DEVIS - Style & Deco", lead_contact: "📩 DEMANDE DE DEVIS - Style & Deco", lead_perpignan: "📩 DEMANDE DE DEVIS - Perpignan" };
const ORIGINS = { lead_hero: "Accueil (formulaire du haut de page)", lead_contact: "Accueil (formulaire de contact)", lead_perpignan: "Page Perpignan" };

test("les trois formulaires (accueil, contact, Perpignan) : notification premium, objet inchangé, Reply-To et destinataire conservés, une seule notification", async () => {
  for (const form of ["lead_hero", "lead_contact", "lead_perpignan"]) {
    const { response, sent, main, confirm } = await run(lead({ "form-name": form, submission_id: `dvn-${form}-0001` }));
    assert.equal(response.status, 200, form);
    assert.equal(sent.filter((m) => m.key.startsWith("lead-")).length, 1, `${form} : une seule notification`);
    assert.equal(sent.length, 2, `${form} : notification + confirmation client (déjà activée), rien d'autre`);
    assert.equal(main.body.subject, SUBJECTS[form], `${form} : objet inchangé`);
    assert.deepEqual(main.body.to, ["dirigeant@example.test"]);
    assert.equal(main.body.reply_to, "marie.exemple@example.com");
    assert.equal(main.body.from, ENV.LEAD_FROM_EMAIL);
    assert.equal(main.body.attachments, undefined);
    assert.ok(main.body.html.includes(`>${ORIGINS[form]}<`), `${form} : origine lisible`);
    assert.ok(main.body.text.includes(`Formulaire : ${form}`), `${form} : code du formulaire en texte brut`);
    assert.deepEqual(confirm.body.to, ["marie.exemple@example.com"]);
  }
});

test("nom complet très lisible, téléphone et e-mail cliquables, boutons « Appeler le client » et « Répondre par e-mail »", async () => {
  const { main } = await run(lead());
  const { html } = main.body;
  assert.match(html, /font-size:26px;font-weight:600;color:#ffffff;line-height:1\.25[^>]*>Marie Exemple-Durand</, "nom du client à 26 px");
  assert.match(html, />Perpignan</, "commune");
  assert.match(html, /font-size:28px;font-weight:600[^"]*"><a href="tel:0612345678"[^>]*>06 12 34 56 78<\/a>/, "téléphone 28 px, cliquable");
  assert.match(html, /<a href="mailto:marie\.exemple@example\.com"[^>]*>marie\.exemple@example\.com<\/a>/, "e-mail cliquable");
  assert.match(html, /<a href="tel:0612345678"[^>]*>Appeler le client<\/a>/);
  assert.match(html, /<a href="mailto:marie\.exemple@example\.com"[^>]*>Répondre par e-mail<\/a>/);
  assert.match(html, /background:#d7b56d[^>]*>\s*<a href="tel:0612345678"/, "bouton d'appel doré");
  const order = ["Nouvelle demande de devis", "Marie Exemple-Durand", "tel:0612345678", "mailto:marie.exemple@example.com", "Appeler le client", "Répondre par e-mail", "Description des travaux", "Informations de suivi"].map((v) => html.indexOf(v));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `ordre de présentation : ${order}`);
});

test("message intégral : retours à la ligne conservés, jamais tronqué (HTML et texte brut)", async () => {
  const { main } = await run(lead());
  assert.ok(main.body.html.includes("Bonjour,<br>salon-séjour de 38 m²<br><br>- murs et plafonds<br>- fissures"));
  assert.ok(main.body.text.includes("Détails : Bonjour,\nsalon-séjour de 38 m²\n\n- murs et plafonds\n- fissures"));
  const long = Array.from({ length: 60 }, (_, i) => `Ligne ${i + 1} : peinture des murs de la pièce numéro ${i + 1}, avec reprise des fissures.`).join("\n").slice(0, 2990).trimEnd();
  const { main: big } = await run(lead({ details: long, submission_id: "dvn-long-0001-xxxx" }));
  const flat = (v) => v.replace(/<br>/g, "\n");
  assert.ok(flat(big.body.html).includes(long), "message de ~3000 caractères intégralement dans le HTML");
  assert.ok(big.body.text.includes(long), "et dans le texte brut");
  assert.ok(!/…|\.\.\.\s*<\/td>/.test(big.body.html.slice(big.body.html.indexOf("Description des travaux"), big.body.html.indexOf("Informations de suivi"))), "aucun point de suspension ajouté");
});

test("origine, date et heure (Europe/Paris) et référence de suivi", async () => {
  const { main } = await run(lead({ submission_id: "dvn-ref-0001-abcd" }));
  const ref = createHash("sha256").update("dvn-ref-0001-abcd").digest("hex").slice(0, 8).toUpperCase();
  assert.ok(main.body.html.includes(`>${ref}<`) && main.body.text.includes(`Référence : ${ref}`));
  assert.ok(main.body.html.includes("lundi 19 octobre 2026 à 11") && main.body.text.includes("Reçu le : lundi 19 octobre 2026 à 11 h 20"));
  assert.ok(main.body.html.includes("Informations de suivi"));
});

test("injection HTML : nom, commune, message, e-mail échappés ; aucune balise ni attribut injecté", async () => {
  const evil = lead({
    name: '<img src=x onerror=alert(1)> "Zoé"',
    city: "<script>alert(2)</script>",
    details: '</td><script>alert(3)</script>\n<a href="javascript:alert(4)">piège</a> & "guillemets"',
    email: "a&b'c@example.test",
    submission_id: "dvn-evil-0001-abcd",
  });
  const { main, response } = await run(evil);
  assert.equal(response.status, 200);
  const { html } = main.body;
  for (const forbidden of ["<img src=x", "<script", 'href="javascript:', "</td><script", "onerror=alert(1)>"]) assert.ok(!html.includes(forbidden), `non échappé : ${forbidden}`);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;") && html.includes("&lt;script&gt;alert(2)&lt;/script&gt;") && html.includes("&lt;a href=&quot;javascript:alert(4)&quot;&gt;"));
  assert.ok(html.includes('href="mailto:a&amp;b&#39;c@example.test"'), "adresse échappée dans l'attribut");
  assert.ok(main.body.text.includes("<script>alert(2)</script>"), "texte brut : valeurs d'origine, sans HTML interprété");
});

test("logo officiel en HTTPS, aucune pièce jointe, aucun CID, structure compatible messageries, texte alternatif", async () => {
  const { sent, main } = await run(lead());
  const { html } = main.body;
  assert.ok(html.includes(`<img src="${LOGO}" width="150" alt="Style &amp; Déco — Le Reflet de vos Envies"`));
  assert.equal((html.match(/<img\b/g) || []).length, 1);
  for (const m of sent) { assert.equal(m.body.attachments, undefined); assert.ok(!/cid:|base64|data:image|noname/i.test(JSON.stringify(m.body))); }
  assert.match(html, /<html lang="fr" dir="ltr">/);
  assert.match(html, /<div lang="fr" dir="ltr">/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  for (const table of html.match(/<table\b[^>]*>/g)) assert.match(table, /role="presentation"/);
  assert.doesNotMatch(html, /<script|position:|float:|background-image|calc\(|var\(|rgba?\(|grid|flex|<svg|<form/i);
  assert.ok(Buffer.byteLength(html) < 100 * 1024);
  assert.doesNotMatch(html, /background(?:-color)?:\s*(?:#fff\b|#ffffff|white)/i, "aucun fond blanc");
  assert.doesNotMatch(html, /font-weight:(7|8|9)00|text-transform:uppercase/i);
  for (const href of html.match(/href="[^"]+"/g)) assert.match(href, /^href="(tel:\d+|mailto:[^"]+)"$/, "liens : téléphone et e-mail du client uniquement");
});

test("aucune coordonnée de Style & Déco répétée dans la notification interne", async () => {
  const { main } = await run(lead());
  for (const v of ["18 rue Madame", "style.deco66@gmail.com", "06 50 75 62 42", "Adresse administrative"]) assert.ok(!main.body.html.includes(v) && !main.body.text.includes(v), v);
});

test("demande suspecte : quarantaine intacte (destinataire, préfixe [À VÉRIFIER], statut affiché), aucune confirmation au prospect, objet et Reply-To conservés", async () => {
  const spam = lead({ name: "Agence Web", details: "Agence web : création de site et SEO, référencement première page Google, audit gratuit https://seo-boost.example", submission_id: "dvn-spam-0001-abcd" });
  const { response, sent, main } = await run(spam);
  assert.equal(response.status, 200);
  assert.equal(sent.length, 1, "une seule notification, aucune confirmation");
  assert.deepEqual(main.body.to, ["tri+verif@example.test"]);
  assert.equal(main.body.subject, `[À VÉRIFIER] ${SUBJECTS.lead_contact}`);
  assert.equal(main.body.reply_to, "marie.exemple@example.com");
  assert.ok(main.body.html.includes("Demande suspecte placée en quarantaine : à vérifier avant de répondre"), "statut suspect clair dans la notification");
  assert.ok(main.body.text.includes("Contrôle antispam : QUARANTAINE — à vérifier (indices :"));
  assert.ok(main.body.html.includes("Agence web : création de site"), "contenu intact : rien n'est perdu");
  // sans adresse de quarantaine dédiée : boîte principale, préfixe seul
  const { main: fallback } = await run(spam, { ...ENV, LEAD_QUARANTINE_EMAIL: "" });
  assert.deepEqual(fallback.body.to, ["dirigeant@example.test"]);
  assert.ok(fallback.body.subject.startsWith("[À VÉRIFIER] "));
  // une demande normale ne porte aucun statut suspect
  const { main: normal } = await run(lead());
  assert.ok(!normal.body.html.includes("quarantaine") && !normal.body.text.includes("Contrôle antispam"));
});

test("pas de régression des rappels : alerte de rappel inchangée (design B, bouton Appeler), aucune section devis", async () => {
  const { main } = await run({ "form-name": "lead_hero", submission_id: "dvn-cb-0001-abcd", name: "Paul Martin", phone: "0612345678", lead_priority: "RAPPEL_30_MIN", "bot-field": "" });
  assert.equal(main.body.subject.startsWith("[RAPPEL CLIENT] Nouveau rappel à effectuer"), true);
  assert.ok(main.body.html.includes("Nouvelle demande de rappel") && main.body.html.includes(">Appeler</a>"));
  assert.ok(!main.body.html.includes("Description des travaux") && !main.body.html.includes("Appeler le client"));
});

test("idempotence et reprise : une même demande renvoyée ne produit pas de seconde notification (même clé)", async () => {
  const keys = [];
  const fetchImpl = async (url, init) => { keys.push(init.headers["Idempotency-Key"]); return new Response(JSON.stringify({ id: "e1" }), { status: 200 }); };
  for (let i = 0; i < 2; i++) await handleLead(request(lead({ submission_id: "dvn-idem-0001-abcd" })), { env: { ...ENV, LEAD_CLIENT_CONFIRMATIONS: "" }, fetchImpl, now: NOW, sleep: async () => {} });
  assert.deepEqual(keys, ["lead-dvn-idem-0001-abcd", "lead-dvn-idem-0001-abcd"], "même clé d'idempotence : Resend dédoublonne");
});
