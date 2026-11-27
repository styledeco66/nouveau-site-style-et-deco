import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { handleLead } from "../netlify/functions/lead.mjs";
import hours from "../sitesite-template/assets/js/business-hours.js";
import { BRAND, callbackAlert, callbackConfirmation, devisAlert, devisConfirmation, reminderEmail, safeCity, safeExcerpt, safeName } from "../netlify/lib/emails.mjs";

// Nouveau design des e-mails (bleu nuit et orange du site) : palette, structure compatible messageries, accessibilité,
// images HTTPS, nettoyage des données saisies, génération depuis le code réel.
const fri = hours.parisInstant("2026-10-23", 19 * 60 + 5);
const sentence = hours.describe(hours.callbackSlot(fri)).sentence;
const lead = { name: "Marie Exemple", phone: "06 12 34 56 78", email: "marie@exemple.fr", city: "Perpignan", details: "Repeindre un salon de 30 m²", subject: "Peinture", priority: "STANDARD" };
const TEMPLATES = {
  devis: () => devisConfirmation({ receivedAt: fri, reference: "A1B2C3D4", lead }),
  rappel: () => callbackConfirmation({ receivedAt: fri, reference: "A1B2C3D4", sentence, lead }),
  alerte: () => callbackAlert({ lead, receivedAt: fri, reference: "A1B2C3D4", action: "Rappeler ce client lundi dès 8 h.", origin: "Page Perpignan" }),
  programme: () => reminderEmail({ lead, receivedAt: fri, reference: "A1B2C3D4", origin: "Page Perpignan", when: "lundi dès 8 h" }),
  devisInterne: () => devisAlert({ lead, receivedAt: fri, reference: "A1B2C3D4", origin: "Page Perpignan", formCode: "lead_perpignan" }),
};
const CLIENTS = ["devis", "rappel"];
const INTERNES = ["alerte", "programme", "devisInterne"];

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test("palette du site : bleu nuit et orange, plus aucune trace du noir et or de l'ancien design", () => {
  for (const [name, make] of Object.entries(TEMPLATES)) {
    const { html } = make();
    assert.doesNotMatch(html, /#0b0d10|#14171c|#1c2026|#d7b56d|#8a7447/i, `${name} : ancienne palette`);
    assert.match(html, /#0B2341/i, `${name} : bleu nuit`);
    assert.match(html, /#F2611D/i, `${name} : orange`);
  }
  for (const name of CLIENTS) assert.match(TEMPLATES[name]().html, /<a href="tel:\+33650756242"[^>]*>Appeler maintenant<\/a>/, `${name} : bouton d'appel`);
});

test("contraste : textes ≥ 4,5:1 (3:1 pour le bouton, texte gras de 18 px)", () => {
  const pairs = [["#0B1A2E", "#ffffff"], ["#55627A", "#ffffff"], ["#55627A", "#F2F5F9"], ["#0B1A2E", "#F2F5F9"], ["#B8450C", "#F2F5F9"], ["#B8450C", "#FFF1EA"], ["#ffffff", "#0B2341"],
    ["#C3CFE2", "#0B2341"], ["#0B2341", "#FFF1EA"], ["#55627A", "#F7F9FC"], ["#0B2341", "#F7F9FC"]];
  for (const [fg, bg] of pairs) assert.ok(contrast(fg, bg) >= 4.5, `${fg} sur ${bg} : ${contrast(fg, bg).toFixed(2)}`);
  assert.ok(contrast("#ffffff", "#F2611D") >= 3, "bouton orange (texte gras 18 px)");
  assert.ok(contrast("#F2611D", "#ffffff") >= 3, "nom du client en orange (titre gras de 28 px au moins)");
});

test("structure compatible messageries et accessibilité : lang/dir, title, h1 unique, tableaux de présentation, aperçu", () => {
  for (const [name, make] of Object.entries(TEMPLATES)) {
    const { html } = make();
    assert.match(html, /<html lang="fr" dir="ltr">/, name);
    assert.match(html, /<meta charset="utf-8">/, name);
    assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/, name);
    assert.match(html, /<title>[^<]+<\/title>/, name);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${name} : un seul h1`);
    for (const table of html.match(/<table\b[^>]*>/g)) assert.match(table, /role="presentation"/, `${name} : tableau de mise en page`);
    assert.match(html, /display:none;max-height:0;overflow:hidden;opacity:0/, `${name} : texte d'aperçu`);
    assert.doesNotMatch(html, /<script|<form|<iframe/i, name);
  }
});

test("tailles de texte lisibles sur téléphone : corps 17 px, titre 34 px (28 px sur petit écran), aucune police sous 12 px", () => {
  for (const name of CLIENTS) {
    const { html } = TEMPLATES[name]();
    assert.match(html, /font-size:17px;[^"]*line-height:1\.6/, `${name} : corps 17 px`);
    assert.match(html, /<h1 class="sd-h1" style="[^"]*font-size:34px/, `${name} : titre 34 px`);
    assert.match(html, /\.sd-h1\{font-size:28px!important/, `${name} : titre 28 px sur petit écran`);
  }
  for (const [name, make] of Object.entries(TEMPLATES)) {
    for (const m of make().html.replace(/<div style="display:none[^>]*>[^<]*<\/div>/, "").matchAll(/font-size:(\d+)px/g)) assert.ok(Number(m[1]) >= 12, `${name} : police ${m[1]} px`);
  }
  assert.match(TEMPLATES.alerte().html, /font-size:34px;[^"]*"[^>]*>Marie Exemple</, "nom du client à 34 px dans l'alerte interne");
});

test("images en HTTPS sur notre domaine : seul le logo dans les e-mails clients, aucune pièce jointe, aucun CID, aucun base64 hors photos d'un devis", () => {
  for (const name of CLIENTS) {
    const { html } = TEMPLATES[name]();
    assert.match(html, /<img src="https:\/\/styleetdeco\.fr\/assets\/images\/email\/logo-style-deco-email\.png" width="280" alt="Style &amp; Déco/, name);
    assert.equal((html.match(/<img\b/g) || []).length, 1, `${name} : pas de photo de chantier`);
    assert.doesNotMatch(html, /cid:|data:image|base64/, name);
  }
  for (const file of ["../netlify/lib/emails.mjs", "../netlify/functions/lead.mjs"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8").replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(source, /data:image|logoAttachment|LEAD_EMAIL_LOGO_MODE/, file);
  }
});

// La photo de chantier n'est plus dans les nouveaux e-mails mais reste publiée : les e-mails déjà envoyés la chargent.
test("fichiers d'image publiés sous assets/images/email/ : logo PNG 512 × 312 et photo JPEG 1200 × 520, légers, sans métadonnées", () => {
  const png = readFileSync(new URL("../sitesite-template/assets/images/email/logo-style-deco-email.png", import.meta.url));
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 312);
  assert.ok(png.length < 60000);
  assert.doesNotMatch(png.toString("latin1"), /eXIf|tEXt|iTXt|zTXt/);
  const jpg = readFileSync(new URL("../sitesite-template/assets/images/email/chantier-facade-email.jpg", import.meta.url));
  assert.ok(jpg.length < 200000, `photo légère (${jpg.length} octets)`);
  assert.equal(jpg[0], 0xff);
  assert.equal(jpg[1], 0xd8);
  assert.doesNotMatch(jpg.toString("latin1"), /Exif\0\0|http:\/\/ns\.adobe\.com\/xap/, "aucune métadonnée (EXIF, XMP)");
  let o = 2, width = 0, height = 0;
  while (o + 9 < jpg.length) {
    if (jpg[o] !== 0xff) break;
    const marker = jpg[o + 1];
    if (marker >= 0xc0 && marker <= 0xc3) { height = jpg.readUInt16BE(o + 5); width = jpg.readUInt16BE(o + 7); break; }
    o += 2 + jpg.readUInt16BE(o + 2);
  }
  assert.deepEqual([width, height], [1200, 520]);
});

test("contenu des e-mails clients : remerciement au nom du client, délai ou créneau en grand, appel, référence, note, version texte complète", () => {
  const devis = TEMPLATES.devis();
  assert.match(devis.html, /href="tel:\+33650756242"/);
  assert.match(devis.html, /<h1[^>]*>Merci <span[^>]*>Marie Exemple<\/span>&nbsp;!<\/h1>/);
  assert.match(devis.html, />sous 24[\u00a0 ]h</);
  assert.match(devis.html, /A1B2C3D4/);
  assert.match(devis.html, /Repeindre un salon de 30 m²/);
  assert.match(devis.html, />Perpignan</);
  assert.match(devis.text, /^Merci Marie Exemple !$/m);
  assert.match(devis.text, /Référence : A1B2C3D4/);
  assert.match(devis.text, /Appelez le 06 50 75 62 42/);
  const rappel = TEMPLATES.rappel();
  assert.match(rappel.html, /Nous vous rappelons/);
  assert.match(rappel.html, /lundi à partir de 8[\u00a0 ]h/);
  assert.match(rappel.html, /Au 06 12 34 56 78/);
  assert.match(rappel.html, /sans heure exacte garantie/);
  assert.ok(rappel.text.includes(sentence), "phrase complète dans la version texte");
  const soon = callbackConfirmation({ receivedAt: fri, reference: "R", sentence: "Nous vous rappelons sous 30 minutes.", lead });
  assert.match(soon.html, />sous 30 minutes</);
  assert.doesNotMatch(soon.html, /sans heure exacte/, "en journée : pas de mention hors horaires");
  for (const { html, text } of [devis, rappel]) {
    assert.ok(html.includes(`${BRAND.googleRating}/5`) && html.includes("Assurance décennale et RC Pro"));
    assert.ok(text.includes(`${BRAND.googleRating}/5 sur Google`) && text.includes(BRAND.site));
    assert.doesNotMatch(text, /<[a-z][^>]*>/i);
    for (const output of [html, text]) assert.doesNotMatch(output, /\d+\s+(avis|commentaires)/i, "le nombre d'avis n'est pas affiché");
  }
  assert.ok(!TEMPLATES.devis().text.includes("devis est établi"), "aucune promesse de devis établi");
});

test("la note Google affichée dans les e-mails est celle de scripts/google-reviews.json", () => {
  const cfg = JSON.parse(readFileSync(new URL("../scripts/google-reviews.json", import.meta.url), "utf8"));
  assert.equal(BRAND.googleRating, cfg.rating);
});

test("échappement HTML de toutes les données saisies", () => {
  const evil = { name: '<img src=x onerror=alert(1)>', phone: '06 12 34 56 78"><b>', email: "<i>x</i>@a.fr", city: "<script>alert(1)</script>", details: "<b>gras</b>" };
  const outputs = [
    callbackAlert({ lead: evil, receivedAt: fri, reference: "R", action: "A", origin: "O" }).html,
    reminderEmail({ lead: evil, receivedAt: fri, reference: "R", origin: "O", when: "<b>x</b>" }).html,
    devisAlert({ lead: evil, receivedAt: fri, reference: "R", origin: "O", formCode: "lead_hero" }).html,
    devisConfirmation({ receivedAt: fri, reference: "R", lead: evil }).html,
    callbackConfirmation({ receivedAt: fri, reference: "R", sentence, lead: evil }).html,
  ];
  for (const html of outputs) {
    assert.ok(!html.includes("<img src=x") && !html.includes("<script>alert") && !html.includes("<i>x</i>") && !html.includes("<b>x</b>") && !html.includes("<b>gras</b>"));
    assert.ok(!html.includes('"><b>'));
  }
});

test("anti-abus : le nom, la ville et le message repris dans la confirmation client n'ont ni lien, ni domaine, ni adresse e-mail, ni numéro, et sont limités", () => {
  const abuse = {
    name: "Cliquez https://evil.example/pay maintenant",
    city: "Voir www.evil.example",
    details: `Écrivez à pirate@evil.example ou visitez http://evil.example/x ou evil.com/pay, appelez le 0899 12 34 56 ou +33 8 99 12 34 56 ${"mot ".repeat(200)}`,
  };
  const { html, text } = devisConfirmation({ receivedAt: fri, reference: "R", lead: abuse });
  for (const output of [html, text]) {
    assert.doesNotMatch(output, /evil\.|pirate@|https?:\/\/evil|0899|899 12/i);
  }
  assert.ok(safeExcerpt(abuse.details).length <= 281);
  assert.equal(safeExcerpt("Salon de 30 m² à repeindre, disponible en 2027."), "Salon de 30 m² à repeindre, disponible en 2027.", "un message normal n'est pas altéré");
  assert.equal(safeName("Marie-Claire d'Aubigné"), "Marie-Claire d'Aubigné");
  for (const bad of ["Marie 0612345678", "Marie.com", "Marie <b>", "A".repeat(41), "M@rie", "Marie: https://x.y", ""]) assert.equal(safeName(bad), "", `nom refusé : ${bad}`);
  assert.equal(safeCity("Saint-Cyprien (66750)"), "Saint-Cyprien (66750)");
  for (const bad of ["Voir www.evil.example", "Perpignan https://x.y", "0612345678901"]) assert.equal(safeCity(bad), "", `ville refusée : ${bad}`);
  assert.match(devisConfirmation({ receivedAt: fri, reference: "R", lead: { name: "Marie 0612345678" } }).text, /^Merci pour votre demande !$/m, "remerciement neutre sans nom exploitable");
  assert.match(devisConfirmation({ receivedAt: fri, reference: "R" }).text, /^Merci pour votre demande !$/m, "confirmation générique sans données");
});

test("le HTML transmis à Resend est exactement celui du modèle (confirmations, alerte, rappel programmé) ; aucune pièce jointe", async () => {
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
  const sentLead = { name: "Marie Exemple", phone: "06 12 34 56 78", email: "marie@exemple.fr", city: "Perpignan" };
  const expected = callbackConfirmation({ receivedAt: fri, reference, sentence: hours.describe(slot).sentence, lead: { ...sentLead, details: "", subject: "", priority: "RAPPEL_30_MIN", form: "lead_perpignan" } });
  assert.equal(by("confirm-").html, expected.html);
  assert.equal(by("confirm-").text, expected.text);
  assert.equal(by("confirm-").attachments, undefined, "aucune pièce jointe");
  assert.equal(by("lead-").attachments, undefined);
  const reminder = by("remind-");
  assert.equal(reminder.attachments, undefined);
  assert.equal(reminder.scheduled_at, "2026-10-26T06:30:00.000Z");
  assert.ok(reminder.html.includes("tel:0612345678"));
  assert.ok(by("lead-").html.includes("Appeler le 06 12 34 56 78"));
});

test("coordonnées : clients = téléphone et site, ni adresse postale ni adresse e-mail affichées ; internes = aucune coordonnée de Style & Déco", () => {
  for (const name of CLIENTS) {
    const { html } = TEMPLATES[name]();
    assert.ok(html.includes("06 50 75 62 42") && html.includes('href="https://styleetdeco.fr"'), name);
    assert.doesNotMatch(html, /style\.deco66@gmail\.com|18 rue Madame de la Fayette|adresse administrative/, name);
  }
  for (const name of INTERNES) {
    const { html } = TEMPLATES[name]();
    assert.doesNotMatch(html, /06 50 75 62 42|\+33650756242|style\.deco66@gmail\.com|18 rue Madame de la Fayette|styleetdeco\.fr/, `${name} : coordonnées de Style & Déco`);
  }
});

test("alertes internes : nom en grand, bouton « Appeler » orange pleine largeur, message intégral, antispam signalé", () => {
  const alerte = TEMPLATES.alerte().html;
  assert.match(alerte, /À rappeler lundi dès 8[\u00a0 ]h/);
  assert.match(alerte, /href="tel:0612345678"/);
  assert.match(alerte, /Appeler le 06 12 34 56 78/);
  const devisInterne = devisAlert({ lead: { ...lead, details: "Ligne 1\nLigne 2" }, receivedAt: fri, reference: "R", origin: "Page Perpignan", formCode: "lead_perpignan", reviewReasons: ["lien"] });
  assert.match(devisInterne.html, /Appeler le 06 12 34 56 78/);
  assert.match(devisInterne.html, /Répondre par e-mail/);
  assert.match(devisInterne.html, /Ligne 1<br>Ligne 2/, "retours à la ligne conservés, message jamais tronqué");
  assert.match(devisInterne.html, /Demande suspecte placée en quarantaine/);
  assert.match(devisInterne.text, /Formulaire : lead_perpignan/);
});

test("compatibilité Gmail, Apple Mail, Outlook : CSS prudent, attributs de secours, poids sous le seuil d'écrêtage de Gmail", () => {
  for (const [name, make] of Object.entries(TEMPLATES)) {
    const { html } = make();
    assert.doesNotMatch(html, /position:|float:|background-image|calc\(|var\(|rgba?\(|hsl|clamp\(|@supports|grid|flex|<svg|<video|<form|<iframe|<object/i, `${name} : CSS ou balise fragile`);
    assert.ok(Buffer.byteLength(html) < 100 * 1024, `${name} : ${Buffer.byteLength(html)} octets (Gmail écrête au-delà de 102 Ko)`);
    assert.match(html, /<meta name="color-scheme" content="light only">/, name);
    // chaque cellule qui porte un fond a aussi l'attribut bgcolor (Outlook de bureau ignore parfois `background`)
    for (const cell of html.match(/<t[dr][^>]*style="[^"]*background:#[0-9a-f]{6}[^"]*"[^>]*>/gi) || []) assert.match(cell, /bgcolor="#[0-9a-f]{6}"/i, `${name} : ${cell.slice(0, 90)}`);
    for (const img of html.match(/<img\b[^>]*>/g) || []) assert.match(img, /width="\d+"/, `${name} : largeur déclarée`);
    for (const link of html.match(/<a\b[^>]*>/g) || []) assert.match(link, /href="(tel:|mailto:|https:\/\/)[^"]+"/, `${name} : lien absolu`);
  }
});

test("version texte brut cohérente avec le HTML : titre, paragraphes, liens et informations visibles se retrouvent dans le texte", () => {
  const plain = (fragment) => fragment.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  for (const name of [...CLIENTS, "alerte", "programme"]) {
    const { html, text } = TEMPLATES[name]();
    const flat = text.replace(/ /g, " ").replace(/\s+/g, " ");
    const title = plain(html.match(/<h1[\s\S]*?<\/h1>/)[0]);
    assert.ok(flat.includes(title) || CLIENTS.includes(name) === false, `${name} : titre`);
    for (const p of html.match(/<p style="margin:0 0 14px[\s\S]*?<\/p>/g) || []) {
      const s = plain(p);
      assert.ok(flat.includes(s), `${name} : paragraphe « ${s.slice(0, 40)} »`);
    }
    for (const href of html.match(/href="(?:tel|mailto):[^"]+"/g) || []) {
      const value = href.slice(6, -1).replace(/^(tel:|mailto:)/, "");
      assert.ok(flat.replace(/\s/g, "").includes(value.replace(/^\+33/, "0")) || flat.includes(value), `${name} : ${value}`);
    }
    assert.ok(!/<[a-z][^>]*>/i.test(text), `${name} : aucun HTML dans le texte brut`);
  }
});
