// Modèle d'e-mail unique de Style & Déco (HTML compatible messageries + version texte) et contenus métier.
// Une seule mise en page (`renderEmail`) sert aux confirmations clients ET aux alertes internes : logo, couleurs, police,
// coordonnées et signature sont centralisés ici ; seul le contenu varie. Aucune dépendance.
//
// Contraintes e-mail respectées : mise en page en tableaux, styles en ligne, largeur fluide ≤ 600 px (lisible sur smartphone),
// polices système, fond clair, aucune image CSS, aucun script. Toute donnée saisie par le visiteur est échappée (escapeHtml).


// Coordonnées professionnelles OFFICIELLES : source unique pour tous les e-mails (signature, pied, texte brut).
export const BRAND = {
  name: "Style & Déco",
  tagline: "Artisan peintre en bâtiment",
  place: "Saint-Cyprien — Pyrénées-Orientales",
  addressLabel: "Adresse administrative", // pas un établissement accueillant du public
  street: "18 rue Madame de la Fayette",
  postalCode: "66750",
  city: "Saint-Cyprien",
  country: "France",
  phone: "06 50 75 62 42",
  phoneHref: "tel:+33650756242",
  email: "style.deco66@gmail.com",
  emailHref: "mailto:style.deco66@gmail.com",
  site: "https://styleetdeco.fr",
  siteLabel: "styleetdeco.fr",
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
const FONT = "-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,'Segoe UI',Roboto,Arial,sans-serif";

// Logo officiel : image PNG hébergée en HTTPS sur notre domaine, chargée directement par le HTML. Aucune pièce jointe, aucun CID,
// aucun base64 ni data URI : une image jointe peut apparaître comme pièce jointe « noname » dans certaines messageries.
export const LOGO_HTTPS_URL = `${BRAND.site}/assets/images/email/logo-style-deco-email.png`;
export const LOGO_ALT = "Style & Déco — Le Reflet de vos Envies";

export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

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

// « lundi 19 octobre 2026 » (en-tête de courrier).
const parisDay = (instant) => parisDateTime(instant).replace(/ à \d{2} h \d{2}$/, "");

const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, "")}`;

// Espace insécable avant « h » dans les heures (« 8 h » ne se coupe jamais en fin de ligne), HTML uniquement.
const nb = (value) => escapeHtml(String(value ?? "").replace(/(\d) h(?=[\s.,;:)]|$)/g, "$1\u00a0h"));

// Style de texte en ligne : couleurs explicites partout (certaines messageries recolorent : la lisibilité prime).
const t = (size, weight, color, extra = "") => `font-family:${FONT};font-size:${size}px;font-weight:${weight};color:${color};${extra}`;
const hairline = (width, color, align = "left", margin = "0") =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="margin:${margin}"><tr><td width="${width}" height="1" bgcolor="${color}" style="background:${color};height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table>`;


/**
 * Design B « Signature artisan premium » — notifications internes (opérationnelles) : logo officiel (HTTPS, compact), titre sur
 * anthracite avec barre dorée, nom du client, téléphone très lisible, bouton doré « Appeler », créneau de rappel, référence.
 * Aucune coordonnée de Style & Déco n'est répétée (c'est le destinataire). Même palette et même famille que le design A.
 */
const renderB = (o) => {
  const logoHtml = `<img src="${LOGO_HTTPS_URL}" width="150" alt="${escapeHtml(LOGO_ALT)}" style="display:block;border:0;outline:none;text-decoration:none;color:#f5f5f4;font-family:${FONT};font-size:15px;line-height:1.5;width:150px;max-width:100%;height:auto">`;
  const metaCell = o.meta
    ? `<td align="right" valign="middle" style="${t(14, 400, COLORS.faint, "line-height:1.6")}">${nb(o.meta.date)}<br>Réf. ${escapeHtml(o.meta.ref)}</td>`
    : "";
  const facts = (o.facts || []).filter(([, v]) => v);
  const shown = facts.filter((f) => !f[4]);
  const factRow = ([label, value, href, gold], k) =>
    `<tr><td style="padding:11px 0;${k ? `border-top:1px solid ${COLORS.line};` : ""}${t(14, 400, COLORS.muted, "line-height:1.5")}" valign="top" width="38%">${escapeHtml(label)}</td><td style="padding:11px 0;${k ? `border-top:1px solid ${COLORS.line};` : ""}" valign="top"><span style="${t(15, gold ? 600 : 400, gold ? COLORS.gold : COLORS.text, "line-height:1.5")}">${nb(value)}</span></td></tr>`;
  const factsHtml = shown.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px">${shown.map(factRow).join("")}</table>`
    : "";
  const callout = (o.paragraphs || []).length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.panel}" style="margin:0 0 22px;background:${COLORS.panel}"><tr><td width="3" bgcolor="${COLORS.gold}" style="background:${COLORS.gold};width:3px;font-size:1px;line-height:1px">&nbsp;</td><td style="padding:14px 18px;${t(16, 400, COLORS.text, "line-height:1.55")}">${o.paragraphs.map((p) => nb(p)).join("<br>")}</td></tr></table>`
    : "";
  const phoneHtml = o.phone
    ? `<p style="margin:0 0 18px;${t(28, 600, COLORS.white, "line-height:1.2;letter-spacing:.2px")}"><a href="${escapeHtml(o.phone.href)}" style="${t(28, 600, COLORS.white, "text-decoration:none")}">${escapeHtml(o.phone.value)}</a></p>`
    : "";
  const buttonHtml = o.button
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr><td align="center" bgcolor="${COLORS.gold}" style="background:${COLORS.gold};border-radius:8px"><a href="${escapeHtml(o.button.href)}" style="display:block;padding:17px 20px;${t(18, 600, COLORS.onGold, "text-decoration:none;border-radius:8px")}">${escapeHtml(o.button.label)}</a></td></tr></table>`
    : "";
  const leadHtml = o.lead
    ? `<p style="margin:0 0 2px;${t(14, 400, COLORS.muted)}">${escapeHtml(o.lead.label)}</p><p style="margin:0 0 ${o.lead.sub ? 2 : 14}px;${t(26, 600, COLORS.white, "line-height:1.25")}">${escapeHtml(o.lead.value)}</p>${o.lead.sub ? `<p style="margin:0 0 14px;${t(16, 400, COLORS.muted)}">${escapeHtml(o.lead.sub)}</p>` : ""}`
    : "";
  const html = `<!doctype html>
<html lang="fr" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${escapeHtml(o.title)} — ${escapeHtml(BRAND.name)}</title>
<style>:root{color-scheme:dark light;supported-color-schemes:dark light}body{margin:0;padding:0;-webkit-text-size-adjust:100%}img{-ms-interpolation-mode:bicubic}a{text-decoration:underline}@media only screen and (max-width:480px){.sd-pad{padding-left:22px !important;padding-right:22px !important}.sd-tp{padding-left:18px !important;padding-right:22px !important}.sd-h1{font-size:23px !important}}</style></head>
<body style="margin:0;padding:0;background:${COLORS.outer}" bgcolor="${COLORS.outer}"><div lang="fr" dir="ltr">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLORS.outer};font-size:1px;line-height:1px">${escapeHtml(o.preheader || o.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.outer}" style="background:${COLORS.outer}"><tr><td align="center" style="padding:14px 8px 24px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td class="sd-pad" bgcolor="${COLORS.outer}" style="background:${COLORS.outer};padding:22px 32px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" width="150">${logoHtml}</td>${metaCell}</tr></table></td></tr>
<tr><td height="1" bgcolor="${COLORS.line}" style="background:${COLORS.line};height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr>
<tr><td bgcolor="${COLORS.card}" style="background:${COLORS.card}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="4" bgcolor="${COLORS.gold}" style="background:${COLORS.gold};width:4px;font-size:1px;line-height:1px">&nbsp;</td><td class="sd-tp" style="padding:24px 28px 22px"><h1 class="sd-h1" style="margin:0;${t(25, 600, COLORS.white, "line-height:1.3;letter-spacing:-.2px")}">${escapeHtml(o.title)}</h1></td></tr></table></td></tr>
<tr><td class="sd-pad" bgcolor="${COLORS.card}" style="background:${COLORS.card};padding:8px 32px 28px">
${leadHtml}${phoneHtml}${buttonHtml}${callout}${factsHtml}
</td></tr>
</table></td></tr></table></div></body></html>`;
  const text = [
    o.title,
    "",
    ...(o.lead ? [`${o.lead.label} : ${o.lead.value}`, ""] : []),
    ...(o.paragraphs || []).flatMap((p) => [p, ""]),
    ...(o.button ? [`${o.button.label} : ${o.button.href.replace(/^tel:/, "")}`, ""] : []),
    ...facts.map(([l, v]) => `${l} : ${v}`),
  ]
    .join("\n")
    .trim();
  return { html, text };
};

/**
 * Modèle des e-mails clients (design A) — direction « Luxe éditorial » : page entièrement noire, colonne étroite, logo centré,
 * filets fins, aucune carte ni encadré, une seule famille sans empattement (graisses 400 et 600, aucune capitale).
 * @param {object} o
 * @param {string} o.title            Titre principal (unique <h1>).
 * @param {string} [o.preheader]      Aperçu affiché dans la liste des messages.
 * @param {{date:string, ref:string}} [o.meta]  Date et référence en en-tête (comme un courrier).
 * @param {string[]} [o.paragraphs]   Paragraphes (texte brut, échappé ici).
 * @param {{label:string,value:string}} [o.lead]  Information principale mise en avant (ex. client à rappeler).
 * @param {[string,string,string?,boolean?,boolean?][]} [o.facts]  « libellé / valeur / lien / doré / masqué dans le HTML ».
 * @param {{label:string,href:string}} [o.button]   Bouton doré (ex. appeler).
 * @param {string[]} [o.closing]      Lignes avant la signature.
 * @param {boolean} [o.signature]     Signature + coordonnées complètes (confirmations clients).
 */
export const renderEmail = (o) => {
  if (o.design === "B") return renderB(o);
  // Texte alternatif lisible (clair sur fond noir) : le nom « Style & Déco » reste visible si les images sont désactivées.
  const logoHtml = `<div style="text-align:center"><img src="${LOGO_HTTPS_URL}" width="240" alt="${escapeHtml(LOGO_ALT)}" style="display:inline-block;border:0;outline:none;text-decoration:none;color:#f5f5f4;font-family:${FONT};font-size:15px;line-height:1.5;width:240px;max-width:100%;height:auto"></div>`;

  const para = (p, color = COLORS.text) => `<p style="margin:0 0 18px;${t(16, 400, color, "line-height:1.75")}">${nb(p)}</p>`;
  const paragraphs = (o.paragraphs || []).map((p, k) => para(p, k === 0 ? COLORS.white : COLORS.text)).join("");

  const metaHtml = o.meta
    ? `<tr><td class="sd-pad" style="padding:34px 52px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${t(14, 400, COLORS.faint)}">${escapeHtml(o.meta.date)}</td><td align="right" style="${t(14, 400, COLORS.faint)}">Réf. ${escapeHtml(o.meta.ref)}</td></tr></table></td></tr>`
    : "";

  const leadHtml = o.lead
    ? `<p style="margin:0 0 2px;${t(14, 400, COLORS.muted)}">${escapeHtml(o.lead.label)}</p><p style="margin:0 0 22px;${t(24, 600, COLORS.white, "line-height:1.3")}">${escapeHtml(o.lead.value)}</p>`
    : "";

  const facts = (o.facts || []).filter(([, v]) => v);
  const shown = facts.filter((f) => !f[4]);
  const factRow = ([label, value, href, gold], k) => {
    const border = k ? `border-top:1px solid ${COLORS.line};` : "";
    const valueHtml = href
      ? `<a href="${escapeHtml(href)}" style="${t(15, 600, COLORS.gold)}">${escapeHtml(value)}</a>`
      : `<span style="${t(15, gold ? 600 : 400, gold ? COLORS.gold : COLORS.text, "line-height:1.5")}">${nb(value)}</span>`;
    return `<tr><td style="padding:14px 0;${border}${t(14, 400, COLORS.muted, "line-height:1.5")}" valign="top" width="38%">${escapeHtml(label)}</td><td style="padding:14px 0;${border}" valign="top">${valueHtml}</td></tr>`;
  };
  const factsHtml = shown.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 30px"><tr><td colspan="2" height="1" bgcolor="${COLORS.goldDim}" style="background:${COLORS.goldDim};height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr>${shown.map(factRow).join("")}<tr><td colspan="2" height="1" bgcolor="${COLORS.line}" style="background:${COLORS.line};height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table>`
    : "";

  const buttonHtml = o.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 30px"><tr><td bgcolor="${COLORS.gold}" style="background:${COLORS.gold};border-radius:4px"><a href="${escapeHtml(o.button.href)}" style="display:inline-block;padding:15px 30px;${t(16, 600, COLORS.onGold, "text-decoration:none;border-radius:4px")}">${escapeHtml(o.button.label)}</a></td></tr></table>`
    : "";

  const closing = (o.closing || []).map((p) => para(p)).join("");

  // Signature : nom, activité, téléphone, e-mail et site cliquables. L'adresse (administrative) figure dans le pied.
  const link = (href, label) => `<a href="${href}" style="${t(15, 600, COLORS.gold)}">${escapeHtml(label)}</a>`;
  const signatureHtml = o.signature
    ? `<p style="margin:26px 0 4px;${t(16, 400, COLORS.muted)}">Cordialement,</p><p style="margin:0;${t(16, 600, COLORS.white)}">${escapeHtml(BRAND.name)}</p><p style="margin:0;${t(14, 400, COLORS.muted, "line-height:1.8")}">${escapeHtml(BRAND.tagline)}<br>${link(BRAND.phoneHref, BRAND.phone)}<br>${link(BRAND.emailHref, BRAND.email)}</p>`
    : "";

  const footerHtml = `<tr><td align="center" class="sd-pad" style="padding:44px 52px 38px">${hairline(56, COLORS.goldDim, "center", "0 auto")}<p style="margin:20px 0 0;${t(13, 400, COLORS.faint, "line-height:1.8")}">${escapeHtml(BRAND.addressLabel)}<br>${escapeHtml(BRAND.street)}, ${escapeHtml(BRAND.postalCode)} ${escapeHtml(BRAND.city)}, ${escapeHtml(BRAND.country)}<br><a href="${BRAND.site}" style="${t(13, 400, COLORS.gold)}">${escapeHtml(BRAND.siteLabel)}</a></p></td></tr>`;

  const html = `<!doctype html>
<html lang="fr" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${escapeHtml(o.title)} — ${escapeHtml(BRAND.name)}</title>
<style>:root{color-scheme:dark light;supported-color-schemes:dark light}body{margin:0;padding:0;-webkit-text-size-adjust:100%}img{-ms-interpolation-mode:bicubic}a{text-decoration:underline}@media only screen and (max-width:480px){.sd-pad{padding-left:24px !important;padding-right:24px !important}.sd-h1{font-size:23px !important}}</style></head>
<body style="margin:0;padding:0;background:${COLORS.outer}" bgcolor="${COLORS.outer}"><div lang="fr" dir="ltr">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLORS.outer};font-size:1px;line-height:1px">${escapeHtml(o.preheader || o.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.outer}" style="background:${COLORS.outer}"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
${metaHtml}
<tr><td class="sd-pad" style="padding:34px 52px 0">${logoHtml}${hairline(56, COLORS.gold, "center", "30px auto 0")}</td></tr>
<tr><td class="sd-pad" style="padding:42px 52px 0">
<h1 class="sd-h1" style="margin:0 0 26px;${t(25, 600, COLORS.white, "line-height:1.3;letter-spacing:-.2px")}">${escapeHtml(o.title)}</h1>
${leadHtml}${paragraphs}${buttonHtml}${factsHtml}${closing}${signatureHtml}
</td></tr>
${footerHtml}
</table></td></tr></table></div></body></html>`;

  const text = [
    o.title,
    "",
    ...(o.lead ? [`${o.lead.label} : ${o.lead.value}`, ""] : []),
    ...(o.paragraphs || []).flatMap((p) => [p, ""]),
    ...(o.button ? [`${o.button.label} : ${o.button.href.replace(/^tel:/, "")}`, ""] : []),
    ...(facts.length ? [...facts.map(([l, v]) => `${l} : ${v}`), ""] : []),
    ...(o.closing || []).flatMap((p) => [p, ""]),
    ...(o.signature ? ["Cordialement,", "", BRAND.name, BRAND.tagline, BRAND.phone, BRAND.email, ""] : []),
    "--",
    `${BRAND.addressLabel} : ${BRAND.street}, ${BRAND.postalCode} ${BRAND.city}, ${BRAND.country}`,
    BRAND.site,
  ]
    .join("\n")
    .trim();

  return { html, text };
};

// ── Contenus métier ────────────────────────────────────────────────────────────────────────────────────────────

export const SUBJECT_CONFIRM_DEVIS = "Votre demande de devis a bien été reçue — Style & Déco";
export const SUBJECT_CONFIRM_CALLBACK = "Votre demande de rappel — Style & Déco";

// Confirmation envoyée au client pour une demande de devis. Pas de promesse de devis établi ni de date de chantier.
export const devisConfirmation = ({ receivedAt, reference }) =>
  renderEmail({
    meta: { date: parisDay(receivedAt), ref: reference },
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
      ["Référence", reference, undefined, false, true],
    ],
    closing: ["Nous vous remercions de votre confiance."],
  });

// Confirmation envoyée au client pour une demande de rappel : `describe` = business-hours.describe(slot).
export const callbackConfirmation = ({ receivedAt, reference, sentence }) =>
  renderEmail({
    meta: { date: parisDay(receivedAt), ref: reference },
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
      ["Référence", reference, undefined, false, true],
    ],
  });

// Alerte interne immédiate (design B) : un client attend d'être rappelé — nom, téléphone et bouton « Appeler » d'abord.
export const callbackAlert = ({ lead, receivedAt, reference, action, origin, reviewNote }) =>
  renderEmail({
    design: "B",
    meta: { date: parisDateTime(receivedAt), ref: reference },
    title: "Nouvelle demande de rappel",
    preheader: `${lead.name} · ${lead.phone} — ${action}`,
    lead: { label: "Client à rappeler", value: lead.name, sub: lead.city },
    phone: { value: lead.phone, href: telHref(lead.phone) },
    button: { label: "Appeler", href: telHref(lead.phone) },
    paragraphs: [`Action : ${action}`],
    facts: [
      ["Téléphone", lead.phone, telHref(lead.phone), false, true],
      ["E-mail", lead.email, undefined, false, true],
      ["Ville", lead.city, undefined, false, true],
      ["Origine", origin, undefined, false, true],
      ["Demande reçue", parisDateTime(receivedAt), undefined, false, true],
      ["Référence", reference, undefined, false, true],
      ["Contrôle antispam", reviewNote],
    ],
  });

// Rappel interne programmé (design B, aucune pièce jointe) : à partir de l'ouverture. `when` = « lundi dès 8 h ».
export const reminderEmail = ({ lead, receivedAt, reference, origin, when, fallback }) =>
  renderEmail({
    design: "B",
    meta: { date: parisDateTime(receivedAt), ref: reference },
    title: "Un client attend votre rappel",
    preheader: `${lead.name} · ${lead.phone} — à rappeler ${when || "dès 8 h"}`,
    lead: { label: "Client à rappeler", value: lead.name, sub: lead.city },
    phone: { value: lead.phone, href: telHref(lead.phone) },
    button: { label: "Appeler", href: telHref(lead.phone) },
    paragraphs: [
      fallback
        ? "Le rappel automatique n'a pas pu être programmé : ce client est à contacter dès l'ouverture."
        : "Un client attend votre rappel à partir de 8 h.",
    ],
    facts: [
      ["Téléphone", lead.phone, telHref(lead.phone), false, true],
      ["Rappel prévu", when || "dès 8 h", undefined, true],
      ["Ville", lead.city, undefined, false, true],
      ["Origine", origin, undefined, false, true],
      ["Demande reçue", parisDateTime(receivedAt), undefined, false, true],
      ["Référence", reference, undefined, false, true],
    ],
  });
