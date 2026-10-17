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

// Palette « Black Luxury » : valeurs du site (assets/css/style.css : --bg #0b0d10, --accent #d7b56d) + anthracites.
const COLORS = {
  outer: "#0b0d10", // noir profond (fond extérieur, en-tête, pied)
  card: "#14171c", // anthracite (corps du message)
  panel: "#1c2026", // anthracite secondaire (informations de suivi)
  line: "#2a2f37", // bordures très fines, peu contrastées
  gold: "#d7b56d", // doré (accent du site)
  goldDim: "#8a7447", // filet doré discret
  white: "#ffffff", // titres
  text: "#f5f5f4", // blanc doux (texte)
  muted: "#bfc3ca", // gris clair (libellés, texte secondaire)
  faint: "#9aa0a8", // pied de message
  onGold: "#151515", // texte sur bouton doré (comme .btn--primary du site)
};
// Polices système uniquement (aucune police externe) : fiables dans toutes les messageries.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";

export const LOGO_CID = "logo-style-deco";
export const LOGO_FILENAME = "logo-style-deco.png";
export const LOGO_HTTPS_URL = `${BRAND.site}/assets/images/email/logo-style-deco-email.png`;
export const LOGO_ALT = "Style & Déco — Le Reflet de vos Envies";

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

// Style de texte en ligne : couleurs explicites partout (certaines messageries recolorent : la lisibilité prime).
const t = (size, weight, color, extra = "") => `font-family:${FONT};font-size:${size}px;font-weight:${weight};color:${color};${extra}`;

/**
 * Modèle commun à tous les e-mails (confirmations clients et alertes internes).
 * @param {object} o
 * @param {string} o.title            Titre principal (unique <h1>).
 * @param {string} [o.preheader]      Aperçu affiché dans la liste des messages.
 * @param {string[]} [o.paragraphs]   Paragraphes (texte brut, échappé ici).
 * @param {{label:string,value:string,href?:string}} [o.lead]  Information principale mise en avant (ex. client à rappeler).
 * @param {[string,string,string?,boolean?][]} [o.facts]  Lignes « libellé / valeur / lien / doré ».
 * @param {string} [o.factsTitle]
 * @param {{label:string,href:string}} [o.button]   Bouton doré (ex. appeler).
 * @param {string[]} [o.closing]      Lignes avant la signature.
 * @param {"cid"|"https"|"none"} [o.logo]  « none » : signature typographique Style & Déco (aucune image).
 * @param {boolean} [o.signature]     Signature + coordonnées (confirmations clients).
 */
export const renderEmail = (o) => {
  const logoMode = o.logo || "none";
  const logoSrc = logoMode === "cid" ? `cid:${LOGO_CID}` : LOGO_HTTPS_URL;
  const logoHtml =
    logoMode === "none"
      ? `<div style="${t(24, 700, COLORS.white, "letter-spacing:3px;line-height:1.2;text-transform:uppercase")}">Style &amp; Déco</div>` +
        `<div style="${t(13, 400, COLORS.gold, "letter-spacing:1.5px;line-height:1.5;padding-top:6px")}">${escapeHtml(BRAND.tagline)}</div>`
      : `<img src="${logoSrc}" width="260" alt="${escapeHtml(LOGO_ALT)}" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:260px;max-width:78%;height:auto">`;

  const para = (p, color = COLORS.text) => `<p style="margin:0 0 18px;${t(16, 400, color, "line-height:1.7")}">${escapeHtml(p)}</p>`;
  const paragraphs = (o.paragraphs || []).map((p, k) => para(p, k === 0 ? COLORS.text : COLORS.text)).join("");

  const leadHtml = o.lead
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr><td style="padding:0 0 4px;${t(13, 400, COLORS.muted, "letter-spacing:.5px")}">${escapeHtml(o.lead.label)}</td></tr>` +
      `<tr><td style="${t(26, 700, COLORS.white, "line-height:1.25")}">${escapeHtml(o.lead.value)}</td></tr></table>`
    : "";

  const facts = (o.facts || []).filter(([, v]) => v);
  const factRow = ([label, value, href, gold], k) => {
    const valueHtml = href
      ? `<a href="${escapeHtml(href)}" style="${t(16, 700, COLORS.gold, "text-decoration:underline")}">${escapeHtml(value)}</a>`
      : `<span style="${t(16, gold ? 700 : 400, gold ? COLORS.gold : COLORS.text, "white-space:pre-wrap;line-height:1.5")}">${escapeHtml(value)}</span>`;
    return `<tr><td style="padding:12px 0;${k ? `border-top:1px solid ${COLORS.line};` : ""}${t(14, 400, COLORS.muted, "line-height:1.5")}" valign="top" width="38%">${escapeHtml(label)}</td><td style="padding:12px 0;${k ? `border-top:1px solid ${COLORS.line};` : ""}" valign="top">${valueHtml}</td></tr>`;
  };
  const factsHtml = facts.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.panel}" style="margin:6px 0 24px;background:${COLORS.panel};border:1px solid ${COLORS.line}"><tr><td class="sd-facts" style="padding:18px 22px">` +
      (o.factsTitle ? `<div style="${t(13, 700, COLORS.gold, "letter-spacing:1.2px;text-transform:uppercase;padding-bottom:6px")}">${escapeHtml(o.factsTitle)}</div>` : "") +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${facts.map(factRow).join("")}</table></td></tr></table>`
    : "";

  const buttonHtml = o.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px"><tr><td align="center" bgcolor="${COLORS.gold}" style="background:${COLORS.gold};border-radius:12px"><a href="${escapeHtml(o.button.href)}" style="display:inline-block;padding:16px 30px;${t(18, 700, COLORS.onGold, "line-height:1.2;text-decoration:none;border-radius:12px")}">${escapeHtml(o.button.label)}</a></td></tr></table>`
    : "";

  const closing = (o.closing || []).map((p) => para(p)).join("");

  const signatureHtml = o.signature
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px"><tr><td style="border-top:1px solid ${COLORS.line};padding-top:22px">` +
      `<p style="margin:0 0 10px;${t(16, 400, COLORS.muted, "line-height:1.6")}">Cordialement,</p>` +
      `<p style="margin:0;${t(18, 700, COLORS.white, "line-height:1.4;letter-spacing:.3px")}">${escapeHtml(BRAND.name)}</p>` +
      `<p style="margin:0;${t(15, 400, COLORS.muted, "line-height:1.7")}">${escapeHtml(BRAND.tagline)}<br>${escapeHtml(BRAND.place)}<br><a href="${BRAND.phoneHref}" style="${t(15, 700, COLORS.gold, "text-decoration:underline")}">${escapeHtml(BRAND.phone)}</a></p></td></tr></table>`
    : "";

  const html = `<!doctype html>
<html lang="fr" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${escapeHtml(o.title)} — ${escapeHtml(BRAND.name)}</title>
<style>:root{color-scheme:dark light;supported-color-schemes:dark light}body{margin:0;padding:0}img{-ms-interpolation-mode:bicubic}a{text-decoration:underline}@media only screen and (max-width:480px){.sd-pad{padding:30px 22px 26px !important}.sd-h1{font-size:25px !important}.sd-facts{padding:14px 16px !important}}</style></head>
<body style="margin:0;padding:0;background:${COLORS.outer}" bgcolor="${COLORS.outer}"><div lang="fr" dir="ltr">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLORS.outer};font-size:1px;line-height:1px">${escapeHtml(o.preheader || o.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.outer}" style="background:${COLORS.outer}"><tr><td align="center" style="padding:20px 10px 28px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td align="center" bgcolor="${COLORS.outer}" style="background:${COLORS.outer};padding:30px 20px 28px">${logoHtml}</td></tr>
<tr><td height="1" bgcolor="${COLORS.gold}" style="background:${COLORS.gold};height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr>
<tr><td class="sd-pad" bgcolor="${COLORS.card}" style="background:${COLORS.card};padding:42px 44px 34px">
<h1 class="sd-h1" style="margin:0 0 14px;${t(28, 700, COLORS.white, "line-height:1.25;letter-spacing:-.2px")}">${escapeHtml(o.title)}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr><td width="44" height="2" bgcolor="${COLORS.gold}" style="background:${COLORS.gold};height:2px;line-height:2px;font-size:2px">&nbsp;</td></tr></table>
${leadHtml}${paragraphs}${buttonHtml}${factsHtml}${closing}${signatureHtml}
</td></tr>
<tr><td height="1" bgcolor="${COLORS.line}" style="background:${COLORS.line};height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr>
<tr><td align="center" bgcolor="${COLORS.outer}" style="background:${COLORS.outer};padding:22px 20px 6px;${t(13, 400, COLORS.faint, "line-height:1.7")}">${escapeHtml(BRAND.name)} · ${escapeHtml(BRAND.tagline)}<br>${escapeHtml(BRAND.place)}<br><a href="${BRAND.site}" style="${t(13, 400, COLORS.gold, "text-decoration:underline")}">styleetdeco.fr</a></td></tr>
</table></td></tr></table></div></body></html>`;

  const text = [
    o.title,
    "",
    ...(o.lead ? [`${o.lead.label} : ${o.lead.value}`, ""] : []),
    ...(o.paragraphs || []).flatMap((p) => [p, ""]),
    ...(o.button ? [`${o.button.label} : ${o.button.href.replace(/^tel:/, "")}`, ""] : []),
    ...(facts.length ? [...(o.factsTitle ? [o.factsTitle] : []), ...facts.map(([l, v]) => `${l} : ${v}`), ""] : []),
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
      ["Réponse", "sous 24 heures", undefined, true],
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
      ["Rappel", sentence.replace(/^Nous vous (rappelons|recontacterons) /, "").replace(/\.$/, ""), undefined, true],
      ["Référence", reference],
    ],
  });

// Alerte interne immédiate : un client attend d'être rappelé (Gmail / Apple Mail : numéro cliquable, lecture rapide).
export const callbackAlert = ({ lead, receivedAt, reference, action, origin, reviewNote }) =>
  renderEmail({
    logo: "none",
    title: "Nouvelle demande de rappel",
    preheader: `${lead.name} · ${lead.phone} — ${action}`,
    lead: { label: "Client à rappeler", value: lead.name },
    paragraphs: [`Action : ${action}`],
    button: { label: `Appeler ${lead.phone}`, href: telHref(lead.phone) },
    factsTitle: "Coordonnées",
    facts: [
      ["Téléphone", lead.phone, telHref(lead.phone)],
      ["E-mail", lead.email],
      ["Ville", lead.city],
      ["Origine", origin],
      ["Demande reçue", parisDateTime(receivedAt)],
      ["Référence", reference],
      ["Contrôle antispam", reviewNote],
    ],
  });

// Rappel interne programmé (aucune pièce jointe, aucune image) : à partir de l'ouverture. `when` = « lundi dès 8 h ».
export const reminderEmail = ({ lead, receivedAt, reference, origin, when, fallback }) =>
  renderEmail({
    logo: "none",
    title: "Un client attend votre rappel",
    preheader: `${lead.name} · ${lead.phone} — à rappeler ${when || "dès 8 h"}`,
    lead: { label: "Client à rappeler", value: lead.name },
    paragraphs: [
      fallback
        ? "Le rappel automatique n'a pas pu être programmé : ce client est à contacter dès l'ouverture."
        : "Un client attend votre rappel à partir de 8 h.",
    ],
    button: { label: `Appeler ${lead.phone}`, href: telHref(lead.phone) },
    factsTitle: "Coordonnées",
    facts: [
      ["Téléphone", lead.phone, telHref(lead.phone)],
      ["Rappel prévu", when || "dès 8 h", undefined, true],
      ["Ville", lead.city],
      ["Origine", origin],
      ["Demande reçue", parisDateTime(receivedAt)],
      ["Référence", reference],
    ],
  });
