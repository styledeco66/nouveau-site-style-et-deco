import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { handleLead } from "../netlify/functions/lead.mjs";
import hours from "../sitesite-template/assets/js/business-hours.js";
import { callbackAlert, callbackConfirmation, devisConfirmation, reminderEmail, renderEmail } from "../netlify/lib/emails.mjs";

// Refonte « Black Luxury » des 4 modèles : palette, structure compatible messageries, accessibilité, logo, génération depuis le code réel.
const fri = hours.parisInstant("2026-10-23", 19 * 60 + 5);
const sentence = hours.describe(hours.callbackSlot(fri)).sentence;
const lead = { name: "Marie Exemple", phone: "06 12 34 56 78", email: "marie@exemple.fr", city: "Perpignan" };
const TEMPLATES = {
  devis: () => devisConfirmation({ receivedAt: fri, reference: "A1B2C3D4" }),
  rappel: () => callbackConfirmation({ receivedAt: fri, reference: "A1B2C3D4", sentence }),
  alerte: () => callbackAlert({ lead, receivedAt: fri, reference: "A1B2C3D4", action: "Rappeler ce client lundi dès 8 h.", origin: "Page Perpignan" }),
  programme: () => reminderEmail({ lead, receivedAt: fri, reference: "A1B2C3D4", origin: "Page Perpignan", when: "lundi dès 8 h" }),
};

const PALETTE = { outer: "#0b0d10", card: "#14171c", panel: "#1c2026", line: "#2a2f37", gold: "#d7b56d", goldDim: "#8a7447" };
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test("palette Black Luxury : aucun fond blanc, crème ou beige ; design A (clients) tout noir, design B (internes) noir et anthracites", () => {
  for (const [name, make] of Object.entries(TEMPLATES)) {
    const { html } = make();
    const backgrounds = new Set([...html.matchAll(/(?:background(?:-color)?:|bgcolor=")\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1].toLowerCase()));
    const internal = ["alerte", "programme"].includes(name);
    const allowed = new Set(internal ? Object.values(PALETTE) : [PALETTE.outer, PALETTE.line, PALETTE.gold, PALETTE.goldDim]);
    for (const bg of backgrounds) assert.ok(allowed.has(bg), `${name} : fond non prévu ${bg}`);
    assert.ok(backgrounds.has(PALETTE.outer), `${name} : fond noir profond`);
    if (internal) assert.ok(backgrounds.has(PALETTE.card), `${name} : design B sur anthracite`);
    else assert.ok(!backgrounds.has(PALETTE.card) && !backgrounds.has(PALETTE.panel), `${name} : design A — aucune carte ni encadré`);
    assert.doesNotMatch(html, /background(?:-color)?:\s*(?:#fff\b|#ffffff|white)|bgcolor="(?:#fff|#ffffff|white)"/i, `${name} : aucun fond blanc`);
    for (const beige of ["#f3f1ec", "#f7f5f0", "#f1efea", "#e6e1d6"]) assert.ok(!html.toLowerCase().includes(beige), `${name} : ${beige}`);
  }
});

test("contraste des textes ≥ 4,5:1 sur leurs fonds (blanc doux, gris clair, doré, bouton doré)", () => {
  const pairs = [["#ffffff", PALETTE.card], ["#f5f5f4", PALETTE.card], ["#bfc3ca", PALETTE.card], ["#bfc3ca", PALETTE.panel], ["#f5f5f4", PALETTE.panel], [PALETTE.gold, PALETTE.card], [PALETTE.gold, PALETTE.panel], ["#151515", PALETTE.gold], ["#9aa0a8", PALETTE.outer], [PALETTE.gold, PALETTE.outer], ["#ffffff", PALETTE.outer]];
  for (const [fg, bg] of pairs) assert.ok(contrast(fg, bg) >= 4.5, `${fg} sur ${bg} : ${contrast(fg, bg).toFixed(2)}`);
});

test("structure compatible messageries et accessibilité (Resend email-best-practices) : lang/dir, title, h1 unique, tableaux de présentation", () => {
  for (const [name, make] of Object.entries(TEMPLATES)) {
    const { html } = make();
    assert.match(html, /<html lang="fr" dir="ltr">/, name);
    assert.match(html, /<body[^>]*><div lang="fr" dir="ltr">/, `${name} : lang/dir aussi sur l'enfant direct de body`);
    assert.match(html, /<title>[^<]{5,}<\/title>/, name);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, name);
    for (const table of html.match(/<table\b[^>]*>/g)) assert.match(table, /role="presentation"/, `${name} : ${table}`);
    assert.doesNotMatch(html, /<script|display:\s*(flex|grid)|\brem\b|@import|<link\b|font-face|fonts\.googleapis/i, name);
    assert.match(html, /width="600"[^>]*max-width:600px/, name);
    assert.match(html, /name="color-scheme" content="dark light"/, name);
    for (const a of html.match(/<a\b[^>]*>[^<]+<\/a>/g) || []) assert.match(a, />[^<\s][^<]*</, "lien avec texte");
    assert.doesNotMatch(html, /click here|cliquez ici/i, name);
    for (const img of html.match(/<img\b[^>]*>/g) || []) assert.match(img, /alt="[^"]{3,}"/, `${name} : alt descriptif`);
  }
});

test("tailles de texte lisibles sur téléphone : corps 16 px, titre 28 px (25 px sur petit écran), aucune police inférieure à 13 px", () => {
  for (const [name, make] of Object.entries(TEMPLATES)) {
    const { html } = make();
    const sizes = [...html.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1])).filter((n) => n > 2);
    assert.ok(Math.min(...sizes) >= 13, `${name} : ${Math.min(...sizes)} px`);
    assert.match(html, /font-size:25px;font-weight:600/, `${name} : titre 25 px semi-bold`);
    assert.match(html, /font-size:16px;font-weight:400/, name);
    assert.match(html, /max-width:480px\)\{[^@]*\.sd-h1\{font-size:23px/, name);
    assert.doesNotMatch(html, /font-weight:(7|8|9)00|text-transform:uppercase|letter-spacing:[1-9]/i, `${name} : ni titre extra-gras, ni capitales, ni espacement artificiel`);
    assert.doesNotMatch(html, /Georgia|Times New Roman|(?<!sans-)serif/i, `${name} : aucune police à empattement`);
  }
});

test("logo officiel PNG en HTTPS dans les quatre HTML : 240 px (design A), 150 px (design B), aucun CID, aucun base64, aucune pièce jointe", () => {
  const URL = "https://styleetdeco.fr/assets/images/email/logo-style-deco-email.png";
  const ALT = 'alt="Style &amp; Déco — Le Reflet de vos Envies"';
  const expected = { devis: 240, rappel: 240, alerte: 150, programme: 150 };
  for (const [name, width] of Object.entries(expected)) {
    const { html, text } = TEMPLATES[name]();
    assert.ok(html.includes(`<img src="${URL}" width="${width}" ${ALT}`), `${name} : logo HTTPS à ${width} px`);
    assert.equal((html.match(/<img\b/g) || []).length, 1, name);
    assert.doesNotMatch(html + text, /cid:|data:image|base64|\.svg|noname/i, name);
    assert.match(html, /<img[^>]*color:#f5f5f4/, `${name} : texte alternatif lisible sur fond noir`);
  }
  assert.match(TEMPLATES.devis().html, /text-align:center"><img/, "design A : logo centré");
});

test("le code d'envoi ne contient plus aucun mécanisme de pièce jointe ni de logo intégré (CID, base64, data URI)", () => {
  for (const file of ["../netlify/lib/emails.mjs", "../netlify/functions/lead.mjs"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8").replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(source, /attachments|content_id|contentId|cid:|data:image|base64|logoAttachment|LEAD_EMAIL_LOGO_MODE/, file);
  }
  assert.ok(!existsSync(new URL("../netlify/lib/email-logo.mjs", import.meta.url)), "module base64 supprimé");
  assert.ok(!existsSync(new URL("../scripts/build-email-logo.mjs", import.meta.url)), "script de génération supprimé");
});

test("fichier PNG officiel : 512 × 312 px, léger, sans métadonnées, publié sous assets/images/email/", () => {
  const png = readFileSync(new URL("../sitesite-template/assets/images/email/logo-style-deco-email.png", import.meta.url));
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 312);
  assert.ok(png.length < 60000, `PNG léger (${png.length} octets)`);
  assert.doesNotMatch(png.toString("latin1"), /eXIf|tEXt|iTXt|zTXt/);
});

test("contenu : téléphone cliquable, créneau, référence, version texte brut complète", () => {
  const alerte = TEMPLATES.alerte();
  assert.ok(alerte.html.includes('href="tel:0612345678"'));
  assert.match(alerte.html, />Appeler<\/a>/, "bouton doré « Appeler »");
  assert.match(alerte.html, /font-size:28px;font-weight:600;color:#ffffff[^"]*"><a href="tel:0612345678"[^>]*>06 12 34 56 78</, "numéro très lisible (28 px)");
  assert.match(alerte.html, /font-size:26px;font-weight:600;color:#ffffff;line-height:1\.25[^>]*>Marie Exemple/, "nom du client bien visible");
  assert.ok(alerte.html.includes(">Perpignan<"), "commune");
  assert.ok(alerte.html.includes("Réf. A1B2C3D4"), "référence");
  for (const v of ["Marie Exemple", "06 12 34 56 78", "Perpignan", "A1B2C3D4", "Rappeler ce client lundi dès 8 h.", "Page Perpignan", "marie@exemple.fr", "Demande reçue : vendredi 23 octobre 2026 à 19 h 05"]) assert.ok(alerte.text.includes(v), `texte brut : ${v}`);
  const prog = TEMPLATES.programme();
  assert.ok(prog.html.includes('href="tel:0612345678"') && /Rappel prévu/.test(prog.html) && prog.html.includes("lundi dès"), "créneau de rappel visible");
  for (const v of ["Marie Exemple", "06 12 34 56 78", "Rappel prévu : lundi dès 8 h", "Page Perpignan", "A1B2C3D4", "Un client attend votre rappel à partir de 8 h."]) assert.ok(prog.text.includes(v), v);
  const devis = TEMPLATES.devis();
  assert.ok(devis.html.includes("tel:+33650756242") && devis.text.includes("06 50 75 62 42"));
  for (const v of ["sous 24 heures", "Référence : A1B2C3D4", "Demande reçue : vendredi 23 octobre 2026 à 19 h 05", "Cordialement,", "Adresse administrative : 18 rue Madame de la Fayette, 66750 Saint-Cyprien, France", "style.deco66@gmail.com", "https://styleetdeco.fr"]) assert.ok(devis.text.includes(v), v);
  const rappel = TEMPLATES.rappel();
  assert.ok(rappel.text.includes("Nous vous recontacterons lundi à partir de 8 h.") && rappel.text.includes("Rappel : lundi à partir de 8 h"));
  assert.doesNotMatch(devis.text + rappel.text, /ouvrées/);
});

test("échappement HTML de toutes les données saisies", () => {
  const evil = { name: '<img src=x onerror=alert(1)>', phone: '06 12 34 56 78"><b>', email: "<i>x</i>@a.fr", city: "<script>alert(1)</script>" };
  for (const html of [callbackAlert({ lead: evil, receivedAt: fri, reference: "R", action: "A", origin: "O" }).html, reminderEmail({ lead: evil, receivedAt: fri, reference: "R", origin: "O", when: "<b>x</b>" }).html]) {
    assert.ok(!html.includes("<img src=x") && !html.includes("<script>alert") && !html.includes("<i>x</i>") && !html.includes("<b>x</b>"));
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.ok(!html.includes('"><b>'));
  }
});

test("identité commune aux quatre modèles (palette, famille de police, logo officiel) sans composition identique", () => {
  for (const make of Object.values(TEMPLATES)) {
    const { html } = make();
    for (const v of [PALETTE.gold, PALETTE.line, PALETTE.outer, "logo-style-deco", "-apple-system,BlinkMacSystemFont,'Helvetica Neue'"]) assert.ok(html.includes(v), v);
  }
  assert.ok(TEMPLATES.devis().html.includes("Cordialement") && !TEMPLATES.alerte().html.includes("Cordialement"));
  assert.equal(renderEmail({ title: "T", paragraphs: ["p"] }).html.includes("<h1"), true);
});

// L'aperçu, le modèle source et le HTML transmis à Resend sont les mêmes : on compare avec ce que la fonction envoie réellement.
test("le HTML transmis à Resend est exactement celui du modèle (confirmations, alerte, rappel programmé) ; aucune pièce jointe, logo en HTTPS", async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { const body = JSON.parse(init.body); sent.push({ key: init.headers["Idempotency-Key"], body }); return new Response(JSON.stringify({ id: `e${sent.length}` }), { status: 200 }); };
  const env = { RESEND_API_KEY: "re_test_fake_key", LEAD_TO_EMAIL: "dirigeant@example.test", LEAD_FROM_EMAIL: "S <n@example.test>", LEAD_ALLOWED_ORIGINS: "https://styleetdeco.fr", LEAD_CLIENT_CONFIRMATIONS: "on", LEAD_SCHEDULED_REMINDERS: "on" };
  const body = { "form-name": "lead_perpignan", submission_id: "tpl-0001-aaaa-bbbb", name: "Marie Exemple", phone: "06 12 34 56 78", email: "marie@exemple.fr", city: "Perpignan", lead_priority: "RAPPEL_30_MIN", "bot-field": "" };
  const request = new Request("https://styleetdeco.fr/.netlify/functions/lead", { method: "POST", headers: { "content-type": "application/json", origin: "https://styleetdeco.fr" }, body: JSON.stringify(body) });
  const pending = [];
  const response = await handleLead(request, { env, fetchImpl, now: () => fri, deploy: { context: "production" }, sleep: async () => {}, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  assert.equal(response.status, 200);
  const reference = createHash("sha256").update("tpl-0001-aaaa-bbbb").digest("hex").slice(0, 8).toUpperCase();
  const by = (prefix) => sent.find((m) => m.key.startsWith(prefix)).body;
  const slot = hours.callbackSlot(fri);
  assert.equal(by("confirm-").html, callbackConfirmation({ receivedAt: fri, reference, sentence: hours.describe(slot).sentence }).html);
  assert.equal(by("confirm-").text, callbackConfirmation({ receivedAt: fri, reference, sentence: hours.describe(slot).sentence }).text);
  assert.equal(by("confirm-").attachments, undefined, "aucune pièce jointe pour le logo");
  assert.equal(by("lead-").html, callbackAlert({ lead: { name: "Marie Exemple", phone: "06 12 34 56 78", email: "marie@exemple.fr", city: "Perpignan" }, receivedAt: fri, reference, action: hours.describe(slot).action, origin: "Page Perpignan", reviewNote: "" }).html);
  assert.equal(by("lead-").attachments, undefined);
  const reminder = by("remind-");
  assert.equal(reminder.html, reminderEmail({ lead: { name: "Marie Exemple", phone: "06 12 34 56 78", email: "marie@exemple.fr", city: "Perpignan" }, receivedAt: fri, reference, origin: "Page Perpignan", when: "lundi dès 8 h" }).html);
  assert.equal(reminder.attachments, undefined);
  assert.equal(reminder.scheduled_at, "2026-10-26T06:30:00.000Z");
  assert.ok(reminder.html.includes("tel:0612345678"));
});

test("coordonnées : clients = signature (nom, activité, téléphone, e-mail) + pied (adresse administrative, site) sans répétition ; internes = aucune coordonnée de Style & Déco", () => {
  const source = readFileSync(new URL("../netlify/lib/emails.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/18 rue Madame de la Fayette/g) || []).length, 1, "adresse écrite une seule fois (BRAND)");
  for (const name of ["devis", "rappel"]) {
    const { html, text } = TEMPLATES[name]();
    const count = (re) => (html.match(re) || []).length;
    assert.equal(count(/href="tel:\+33650756242"/g), 1, `${name} : téléphone une seule fois`);
    assert.equal(count(/href="mailto:style\.deco66@gmail\.com"/g), 1, `${name} : e-mail une seule fois`);
    assert.equal(count(/href="https:\/\/styleetdeco\.fr"/g), 1, `${name} : site une seule fois`);
    assert.equal(count(/18 rue Madame de la Fayette/g), 1, `${name} : adresse une seule fois`);
    const at = (v) => html.indexOf(v);
    assert.ok(at("Cordialement") < at("tel:+33650756242") && at("tel:+33650756242") < at("mailto:style.deco66@gmail.com") && at("mailto:style.deco66@gmail.com") < at("Adresse administrative") && at("Adresse administrative") < at('href="https://styleetdeco.fr"'), `${name} : signature puis pied`);
    for (const v of ["66750 Saint-Cyprien", "France", "Adresse administrative"]) assert.ok(html.includes(v), `${name} : ${v}`);
    assert.ok(text.includes("18 rue Madame de la Fayette, 66750 Saint-Cyprien, France") && text.includes("06 50 75 62 42") && text.includes("style.deco66@gmail.com") && text.includes("https://styleetdeco.fr"), `${name} : texte brut`);
    assert.doesNotMatch(html + text, /showroom|boutique|visitez-nous|nous accueillons|sur rendez-vous à notre adresse|ouvert au public/i, name);
  }
  for (const name of ["alerte", "programme"]) {
    const { html, text } = TEMPLATES[name]();
    assert.ok(!html.includes("18 rue Madame") && !html.includes("style.deco66@gmail.com") && !html.includes("+33650756242") && !html.includes("06 50 75 62 42"), `${name} : aucune coordonnée de Style & Déco`);
    assert.ok(!text.includes("18 rue Madame") && !text.includes("style.deco66@gmail.com") && !text.includes("06 50 75 62 42"), `${name} : texte brut`);
  }
});


test("compatibilité Gmail, Apple Mail, Outlook : CSS prudent, attributs de secours, poids sous le seuil d'écrêtage de Gmail", () => {
  for (const [name, make] of Object.entries(TEMPLATES)) {
    const { html } = make();
    assert.doesNotMatch(html, /position:|float:|background-image|calc\(|var\(|rgba?\(|hsl|clamp\(|@supports|grid|flex|<svg|<video|<form|<iframe|<object/i, `${name} : CSS ou balise fragile`);
    assert.ok(Buffer.byteLength(html) < 100 * 1024, `${name} : ${Buffer.byteLength(html)} octets (Gmail écrête au-delà de 102 Ko)`);
    assert.match(html, /<meta http-equiv="X-UA-Compatible"/, name);
    // chaque cellule qui porte un fond a aussi l'attribut bgcolor (Outlook de bureau ignore parfois `background`)
    for (const cell of html.match(/<t[dr][^>]*style="[^"]*background:#[0-9a-f]{6}[^"]*"[^>]*>/gi) || []) assert.match(cell, /bgcolor="#[0-9a-f]{6}"/i, `${name} : ${cell.slice(0, 80)}`);
    for (const img of html.match(/<img\b[^>]*>/g) || []) assert.match(img, /width="\d+"/, `${name} : largeur déclarée`);
    for (const link of html.match(/<a\b[^>]*>/g) || []) assert.match(link, /href="(tel:|mailto:|https:\/\/)[^"]+"/, `${name} : lien absolu`);
  }
});

test("version texte brut cohérente avec le HTML : titre, paragraphes, liens et informations visibles se retrouvent dans le texte", () => {
  const plain = (fragment) => fragment.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  for (const [name, make] of Object.entries(TEMPLATES)) {
    const { html, text } = make();
    const flat = text.replace(/ /g, " ").replace(/\s+/g, " ");
    const title = plain(html.match(/<h1[\s\S]*?<\/h1>/)[0]);
    assert.ok(flat.includes(title), `${name} : titre`);
    for (const p of html.match(/<p style="margin:0 0 18px[\s\S]*?<\/p>/g) || []) {
      const sentence = plain(p);
      assert.ok(flat.includes(sentence), `${name} : paragraphe « ${sentence.slice(0, 40)} »`);
    }
    for (const href of html.match(/href="(?:tel|mailto):[^"]+"/g) || []) {
      const value = href.slice(6, -1).replace(/^(tel:|mailto:)/, "");
      assert.ok(flat.replace(/\s/g, "").includes(value.replace(/^\+33/, "0").replace(/^0(\d)/, "0$1")) || flat.includes(value) || flat.replace(/\s/g, "").includes(value.replace(/^\+33/, "0")), `${name} : ${value}`);
    }
    assert.ok(!/<[a-z][^>]*>/i.test(text), `${name} : aucun HTML dans le texte brut`);
  }
});
