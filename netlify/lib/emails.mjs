// Modèle d'e-mail unique de Style & Déco (HTML compatible messageries + version texte) et contenus métier.
// Une seule mise en page (`renderEmail`) sert aux confirmations clients ET aux alertes internes : logo, couleurs, police,
// coordonnées et signature sont centralisés ici ; seul le contenu varie. Aucune dépendance.
//
// Contraintes e-mail respectées : mise en page en tableaux, styles en ligne, largeur fluide ≤ 600 px (lisible sur smartphone),
// polices système, fond clair, aucune image CSS, aucun script. Toute donnée saisie par le visiteur est échappée (escapeHtml).

import { LOGO_PNG_BASE64 } from "./email-logo.mjs";

export const BRAND = {
  name: "Style & Déco",
  tagline: "Artisan peintre en bâtiment",
  place: "Saint-Cyprien — Pyrénées-Orientales",
  phone: "06 50 75 62 42",
  phoneHref: "tel:+33650756242",
  email: "style.deco66@gmail.com",
  site: "https://styleetdeco.fr",
};

const COLORS = {
  page: "#f3f1ec", // fond de lecture clair
  card: "#ffffff",
  header: "#14171c", // anthracite (identique à l'en-tête du site)
  gold: "#c9a45c", // doré discret (accent du site : #d7b56d, un ton plus foncé pour le contraste sur fond clair)
  text: "#23272e",
  muted: "#5d6470",
  panel: "#f7f5f0",
  line: "#e6e1d6",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const LOGO_CID = "logo-style-deco";
export const LOGO_FILENAME = "logo-style-deco.png";
export const LOGO_HTTPS_URL = `${BRAND.site}/assets/images/email/logo-style-deco-email.png`;

export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Pièce jointe Resend pour le logo intégré (CID). Nommée explicitement : jamais « noname ».
export const logoAttachment = () => ({
  filename: LOGO_FILENAME,
  content: LOGO_PNG_BASE64,
  content_type: "image/png",
  content_id: LOGO_CID,
});

export const parisDateTime = (instant) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value])
  );
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year} à ${parts.hour} h ${parts.minute}`;
};

const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, "")}`;

/**
 * @param {object} o
 * @param {string} o.title            Titre principal.
 * @param {string} [o.preheader]      Aperçu affiché dans la liste des messages.
 * @param {string[]} o.paragraphs     Paragraphes (texte brut, échappé ici).
 * @param {[string,string,string?][]} [o.facts]  Lignes « libellé / valeur [/ lien href] ».
 * @param {string} [o.factsTitle]
 * @param {{label:string,href:string}} [o.button]   Bouton (ex. appeler).
 * @param {string[]} [o.closing]      Lignes avant la signature.
 * @param {"cid"|"https"|"none"} [o.logo]
 * @param {boolean} [o.signature]     Bloc coordonnées + signature (confirmations clients).
 */
export const renderEmail = (o) => {
  const logoMode = o.logo || "none";
  const logoSrc = logoMode === "cid" ? `cid:${LOGO_CID}` : LOGO_HTTPS_URL;
  const logoHtml =
    logoMode === "none"
      ? `<div style="font:700 20px/1.2 ${FONT};color:#ffffff;letter-spacing:.2px">${escapeHtml(BRAND.name)}</div>`
      : `<img src="${logoSrc}" width="170" alt="${escapeHtml(BRAND.name)}" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:170px;max-width:60%;height:auto">`;

  const paragraphs = o.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font:400 16px/1.6 ${FONT};color:${COLORS.text}">${escapeHtml(p)}</p>`)
    .join("");

  const facts = (o.facts || []).filter(([, v]) => v);
  const factsHtml = facts.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;background:${COLORS.panel};border-left:3px solid ${COLORS.gold}"><tr><td style="padding:14px 18px">` +
      (o.factsTitle ? `<div style="font:700 13px/1.4 ${FONT};color:${COLORS.muted};letter-spacing:.4px;margin:0 0 8px">${escapeHtml(o.factsTitle)}</div>` : "") +
      facts
        .map(
          ([label, value, href]) =>
            `<div style="font:400 15px/1.55 ${FONT};color:${COLORS.text};margin:0 0 6px"><span style="color:${COLORS.muted}">${escapeHtml(label)} :</span> ` +
            (href
              ? `<a href="${escapeHtml(href)}" style="color:${COLORS.text};font-weight:700;text-decoration:underline">${escapeHtml(value)}</a>`
              : `<span style="white-space:pre-wrap">${escapeHtml(value)}</span>`) +
            `</div>`
        )
        .join("") +
      `</td></tr></table>`
    : "";

  const buttonHtml = o.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px"><tr><td align="center" bgcolor="${COLORS.header}" style="border-radius:10px"><a href="${escapeHtml(o.button.href)}" style="display:inline-block;padding:14px 26px;font:700 17px/1.2 ${FONT};color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(o.button.label)}</a></td></tr></table>`
    : "";

  const closing = (o.closing || [])
    .map((p) => `<p style="margin:0 0 16px;font:400 16px/1.6 ${FONT};color:${COLORS.text}">${escapeHtml(p)}</p>`)
    .join("");

  const signatureHtml = o.signature
    ? `<p style="margin:0 0 4px;font:400 16px/1.6 ${FONT};color:${COLORS.text}">Cordialement,</p>` +
      `<p style="margin:0;font:700 16px/1.5 ${FONT};color:${COLORS.text}">${escapeHtml(BRAND.name)}</p>` +
      `<p style="margin:0;font:400 15px/1.55 ${FONT};color:${COLORS.muted}">${escapeHtml(BRAND.tagline)}<br>${escapeHtml(BRAND.place)}<br><a href="${BRAND.phoneHref}" style="color:${COLORS.text};text-decoration:underline">${escapeHtml(BRAND.phone)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(o.title)}</title>
<style>@media only screen and (max-width:480px){.sd-pad{padding:22px 18px !important}.sd-h1{font-size:22px !important}}</style></head>
<body style="margin:0;padding:0;background:${COLORS.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(o.preheader || o.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.page}"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${COLORS.card};border-radius:12px;overflow:hidden">
<tr><td align="center" bgcolor="${COLORS.header}" style="padding:22px 20px;border-bottom:3px solid ${COLORS.gold}">${logoHtml}</td></tr>
<tr><td class="sd-pad" style="padding:30px 32px 28px">
<h1 class="sd-h1" style="margin:0 0 18px;font:700 25px/1.25 ${FONT};color:${COLORS.text}">${escapeHtml(o.title)}</h1>
${paragraphs}${factsHtml}${buttonHtml}${closing}${signatureHtml}
</td></tr>
<tr><td style="padding:14px 32px;background:${COLORS.panel};border-top:1px solid ${COLORS.line};font:400 12px/1.5 ${FONT};color:${COLORS.muted}" align="center">${escapeHtml(BRAND.name)} · ${escapeHtml(BRAND.tagline)} · ${escapeHtml(BRAND.place)}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    o.title,
    "",
    ...o.paragraphs.flatMap((p) => [p, ""]),
    ...(facts.length ? [...(o.factsTitle ? [o.factsTitle] : []), ...facts.map(([l, v]) => `${l} : ${v}`), ""] : []),
    ...(o.button ? [`${o.button.label} : ${o.button.href.replace(/^tel:/, "")}`, ""] : []),
    ...(o.closing || []).flatMap((p) => [p, ""]),
    ...(o.signature ? ["Cordialement,", "", BRAND.name, BRAND.tagline, BRAND.place, BRAND.phone] : []),
  ]
    .join("\n")
    .trim();

  return { html, text };
};

// ── Contenus métier ────────────────────────────────────────────────────────────────────────────────────────────

export const SUBJECT_CONFIRM_DEVIS = "Votre demande de devis a bien été reçue — Style & Déco";
export const SUBJECT_CONFIRM_CALLBACK = "Votre demande de rappel — Style & Déco";

// Confirmation envoyée au client pour une demande de devis. Pas de promesse de devis établi ni de date de chantier.
export const devisConfirmation = ({ receivedAt, reference, logo }) =>
  renderEmail({
    logo,
    signature: true,
    title: "Votre demande de devis a bien été reçue",
    preheader: "Nous reviendrons vers vous sous 24 heures.",
    paragraphs: [
      "Bonjour,",
      "Nous vous remercions d'avoir contacté Style & Déco pour votre projet.",
      "Votre demande de devis nous a bien été transmise. Nous allons prendre connaissance des informations communiquées et reviendrons vers vous sous 24 heures.",
      "Si des précisions ou une visite sur place sont nécessaires, nous conviendrons ensemble de la suite à donner.",
    ],
    factsTitle: "Suivi de votre demande",
    facts: [
      ["Demande reçue", parisDateTime(receivedAt)],
      ["Réponse", "sous 24 heures"],
      ["Référence", reference],
    ],
    closing: ["Nous vous remercions de votre confiance."],
  });

// Confirmation envoyée au client pour une demande de rappel : `describe` = business-hours.describe(slot).
export const callbackConfirmation = ({ receivedAt, reference, sentence, logo }) =>
  renderEmail({
    logo,
    signature: true,
    title: "Votre demande de rappel a bien été reçue",
    preheader: sentence,
    paragraphs: [
      "Bonjour,",
      "Nous avons bien reçu votre demande de rappel et vous remercions de votre intérêt pour Style & Déco.",
      "Nous vous recontacterons dans le créneau annoncé lors de votre demande.",
      sentence,
      "Nous restons à votre disposition pour toute précision.",
    ],
    factsTitle: "Suivi de votre demande",
    facts: [
      ["Demande reçue", parisDateTime(receivedAt)],
      ["Rappel", sentence.replace(/^Nous vous (rappelons|recontacterons) /, "").replace(/\.$/, "")],
      ["Référence", reference],
    ],
  });

// Alerte interne immédiate : un client attend d'être rappelé (Gmail / Apple Mail : numéro cliquable).
export const callbackAlert = ({ lead, receivedAt, reference, action, origin, reviewNote }) =>
  renderEmail({
    logo: "none",
    title: "Nouvelle demande de rappel",
    preheader: `${lead.name} · ${lead.phone} — ${action}`,
    paragraphs: [],
    facts: [
      ["Client", lead.name],
      ["Téléphone", lead.phone, telHref(lead.phone)],
      ["E-mail", lead.email],
      ["Ville", lead.city],
      ["Origine", origin],
      ["Demande reçue", parisDateTime(receivedAt)],
      ["Référence", reference],
      ["Contrôle antispam", reviewNote],
    ],
    factsTitle: "Coordonnées",
    button: { label: `Appeler ${lead.phone}`, href: telHref(lead.phone) },
    closing: [`Action : ${action}`],
  });

// Rappel interne programmé (aucune pièce jointe) : à partir de l'ouverture.
export const reminderEmail = ({ lead, receivedAt, reference, origin, fallback }) =>
  renderEmail({
    logo: "none",
    title: "Un client attend votre rappel",
    preheader: `${lead.name} · ${lead.phone} — à rappeler dès 8 h`,
    paragraphs: [
      fallback
        ? "Le rappel automatique n'a pas pu être programmé : ce client est à contacter dès l'ouverture."
        : "Un client attend votre rappel à partir de 8 h.",
    ],
    facts: [
      ["Client", lead.name],
      ["Téléphone", lead.phone, telHref(lead.phone)],
      ["Ville", lead.city],
      ["Origine", origin],
      ["Demande reçue", parisDateTime(receivedAt)],
      ["Référence", reference],
    ],
    factsTitle: "Coordonnées",
    button: { label: `Appeler ${lead.phone}`, href: telHref(lead.phone) },
  });
