// Modèles d'e-mail de Style & Déco (HTML compatible messageries + version texte) et contenus métier.
// Une seule identité pour les cinq messages : bleu nuit et orange du site, texte lisible, gros bouton « Appeler ».
//   - clients (design A) : confirmation de devis, confirmation de rappel ;
//   - internes (design B) : alerte de rappel, rappel programmé, alerte de devis.
// Contraintes e-mail respectées : mise en page en tableaux, styles en ligne, largeur fluide ≤ 600 px, polices système,
// images HTTPS hébergées sur le site, aucun script.\n// Seule exception : les photos qu'un client joint à son devis, affichées dans la notification interne (`cid:`).
// Toute donnée saisie par le visiteur est échappée (escapeHtml) ; les confirmations clients n'affichent le nom, la ville et
// le message qu'après nettoyage (aucun lien, aucune adresse, longueur limitée : voir safeName / safeExcerpt).
// Aucune dépendance.

// Coordonnées professionnelles OFFICIELLES : source unique pour tous les e-mails (signature, pied, texte brut).
export const BRAND = {
  name: "Style & Déco",
  tagline: "Artisan peintre en bâtiment",
  zone: "Saint-Cyprien · Perpignan",
  phone: "06 50 75 62 42",
  phoneHref: "tel:+33650756242",
  email: "style.deco66@gmail.com",
  site: "https://styleetdeco.fr",
  siteLabel: "styleetdeco.fr",
  // Preuve affichée dans les e-mails clients : même note que scripts/google-reviews.json (un test vérifie l'égalité).
  // Le nombre d'avis n'est volontairement pas affiché.
  googleRating: "4,9",
};

const C = {
  nuit: "#0B2341", // bleu nuit (en-tête, pied)
  orange: "#F2611D", // orange des actions
  orangeText: "#B8450C", // orange foncé pour les petits textes (contraste)
  pale: "#F2F5F9", // fond des encadrés
  orangePale: "#FFF1EA", // fond du créneau de rappel
  line: "#DCE3EC", // filets
  ink: "#0B1A2E", // texte
  slate: "#55627A", // texte secondaire
  fond: "#E6EBF2", // fond extérieur
  brume: "#C3CFE2", // texte clair sur bleu nuit
  white: "#ffffff",
  star: "#FBBC04", // jaune des étoiles Google
  doux: "#F7F9FC", // fond du pied client
};
// Polices système uniquement (aucune police externe) : fiables dans toutes les messageries.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Roboto,Arial,sans-serif";

// Images : HTTPS sur notre domaine, chargées directement par le HTML (jamais en pièce jointe : une image jointe peut apparaître
// comme pièce jointe « noname » dans certaines messageries).
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

const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, "")}`;

// Espace insécable avant « h » dans les heures (« 8 h » ne se coupe jamais en fin de ligne), HTML uniquement.
const nb = (value) => escapeHtml(String(value ?? "").replace(/(\d) h (\d{2})(?!\d)/g, "$1 h $2").replace(/(\d) h(?=[\s.,;:)]|$)/g, "$1 h"));

// Texte saisi par un visiteur, repris dans un message envoyé à SON adresse : on retire tout ce qui pourrait servir à envoyer un lien
// ou une adresse à un tiers depuis notre domaine (liens, adresses e-mail), les caractères de contrôle, et on limite la longueur.
const stripLinks = (value) =>
  String(value ?? "")
    .replace(/(?:https?:\/\/|www\.)\S*/gi, " ") // liens
    .replace(/\S+@\S+\.\S+/g, " ") // adresses e-mail
    .replace(/\b[\w-]+(?:\.[a-z]{2,})+\b/gi, " ") // noms de domaine sans http (rendus cliquables par les messageries)
    .replace(/\+?\d(?:[\s.()-]?\d){6,}/g, " ") // numéros de téléphone (7 chiffres ou plus)
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
// Nom : lettres, espaces, apostrophe et trait d'union uniquement ; tout autre caractère = salutation neutre (« Bonjour, »).
export const safeName = (name) => {
  const n = String(name ?? "").replace(/\s+/g, " ").trim();
  return /^[\p{L}' -]{1,40}$/u.test(n) ? n : "";
};
export const safeExcerpt = (text, max = 280) => {
  const s = stripLinks(text);
  return s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, "")}…` : s;
};
// Ville : lettres, chiffres (code postal), espaces, apostrophe, trait d'union, parenthèses.
export const safeCity = (city) => {
  const c = String(city ?? "").replace(/\s+/g, " ").trim();
  return /^[\p{L}\d' ()-]{1,60}$/u.test(c) && !/\d{6,}/.test(c) ? c : "";
};

const HOURS = "Du lundi au vendredi, de 8 h à 18 h";
const INSURANCE = "Assurance décennale et RC Pro";
const REPLY = "Une précision à nous transmettre ? Répondez simplement à ce message.";

const t = (size, weight, color, extra = "") => `font-family:${FONT};font-size:${size}px;font-weight:${weight};color:${color};${extra}`;

const STYLE = `<style>body{margin:0;padding:0;-webkit-text-size-adjust:100%}img{-ms-interpolation-mode:bicubic}a{color:${C.orangeText}}@media only screen and (max-width:620px){.sd-w{width:100%!important;border-radius:0!important}.sd-px{padding-left:22px!important;padding-right:22px!important}.sd-h1{font-size:28px!important;line-height:1.15!important}.sd-big{font-size:32px!important}.sd-col{display:block!important;width:100%!important;text-align:left!important;padding-bottom:4px!important}.sd-hide{display:none!important}.sd-photo{max-width:100%!important}}</style>`;

const doc = ({ title, preheader, body, note, width = 600, radius = 18 }) => `<!doctype html>
<html lang="fr" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${escapeHtml(title)}</title>
${STYLE}</head>
<body style="margin:0;padding:0;background:${C.fond}" bgcolor="${C.fond}"><div lang="fr" dir="ltr">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.fond};font-size:1px;line-height:1px">${escapeHtml(preheader || title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.fond}" style="background:${C.fond}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0" class="sd-w" style="width:100%;max-width:${width}px;background:${C.white};border-radius:${radius}px;overflow:hidden">
${body}
</table>${note ? `
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="sd-w" style="width:100%;max-width:600px"><tr><td class="sd-px" style="padding:18px 8px;text-align:center;${t(12, 400, C.slate, "line-height:1.5")}">${escapeHtml(note)}</td></tr></table>` : ""}
</td></tr></table></div></body></html>`;

const button = (label, href, { full = false, outline = false } = {}) => {
  const bg = outline ? C.white : C.orange;
  const fg = outline ? C.nuit : C.white;
  const border = outline ? `border:2px solid ${C.nuit};` : "";
  return `<table role="presentation" ${full ? 'width="100%" ' : ""}cellpadding="0" cellspacing="0" border="0"><tr><td${full ? ' align="center"' : ""} bgcolor="${bg}" style="background:${bg};border-radius:10px;${border}"><a href="${escapeHtml(href)}" style="display:${full ? "block" : "inline-block"};padding:16px 28px;border-radius:10px;${t(18, 800, fg, `text-decoration:none${full ? ";text-align:center" : ""}`)}">${nb(label)}</a></td></tr></table>`;
};

const section = (html, top = 28, bottom = 0) => `<tr><td class="sd-px" style="padding:${top}px 36px ${bottom}px">${html}</td></tr>`;

// ── Design A : e-mails clients ───────────────────────────────────────────────────────────────────────────────────────
// Même présentation que l'e-mail de demande d'avis Google : filet orange, logo centré, remerciement au nom du client,
// carte bleu nuit avec l'information principale et le bouton d'appel, signature, pied clair.

const row = (html, padding, bg = C.white, extra = "") =>
  `<tr><td class="sd-px" align="center" bgcolor="${bg}" style="padding:${padding};background:${bg};text-align:center;${extra}">${html}</td></tr>`;

const cardHtml = (card) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.nuit}" style="background:${C.nuit};border-radius:20px"><tr><td align="center" style="padding:32px 18px 28px;text-align:center"><div style="${t(13, 800, C.brume, "letter-spacing:1.5px;text-transform:uppercase")}">${escapeHtml(card.label)}</div><div class="sd-big" style="margin:8px 0 0;${t(card.value.length > 20 ? 28 : 36, 800, C.white, "line-height:1.2;letter-spacing:-.5px")}">${nb(card.value)}</div><div style="margin:10px auto 22px;max-width:390px;${t(15, 400, C.brume, "line-height:1.6")}">${nb(card.text)}</div>${card.question ? `<div style="margin:0 0 12px;${t(17, 800, C.white)}">${escapeHtml(card.question)}</div>` : ""}<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr><td align="center" bgcolor="${C.orange}" style="background:${C.orange};border-radius:999px"><a href="${BRAND.phoneHref}" style="display:inline-block;padding:16px 34px;border-radius:999px;${t(18, 800, C.white, "text-decoration:none")}">Appeler maintenant</a></td></tr></table><div style="margin-top:14px;${t(14, 400, C.brume, "line-height:1.6")}"><a href="${BRAND.phoneHref}" style="color:${C.white};font-weight:800;text-decoration:none;white-space:nowrap">${BRAND.phone}</a><br>${nb(HOURS)}</div></td></tr></table>`;

const recapHtml = (city, message) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.pale}" style="background:${C.pale};border-radius:16px"><tr><td align="center" style="padding:20px 22px;text-align:center"><div style="${t(13, 800, C.orangeText, "letter-spacing:1.5px;text-transform:uppercase")}">Votre demande</div>${city ? `<div style="margin-top:8px;${t(17, 800, C.nuit)}">${nb(city)}</div>` : ""}${message ? `<div style="margin-top:8px;${t(15, 400, C.ink, "line-height:1.6;font-style:italic;overflow-wrap:anywhere")}">&laquo;&nbsp;${nb(message)}&nbsp;&raquo;</div>` : ""}</td></tr></table>`;

const proofHtml = () =>
  `<div style="${t(22, 400, C.star, "letter-spacing:4px;line-height:1.2")}">&#9733;&#9733;&#9733;&#9733;&#9733;</div><div style="margin-top:6px;${t(16, 400, C.slate)}"><b style="color:${C.nuit}">${BRAND.googleRating}/5</b> sur Google</div><div style="margin-top:4px;${t(14, 400, C.slate)}">${INSURANCE}</div>`;

/**
 * Modèle des e-mails clients (design A).
 * @param {object} o
 * @param {string} o.subject      Titre du document (onglet, lecteurs d'écran).
 * @param {string} o.name         Nom nettoyé du client ; vide = remerciement neutre. Donne l'unique <h1>.
 * @param {string} o.intro        Phrase sous le remerciement.
 * @param {string} [o.preheader]  Aperçu affiché dans la liste des messages.
 * @param {string} [o.textLead]   Phrase complète placée en tête de la version texte.
 * @param {{label:string,value:string,text:string,question?:string}} o.card  Information principale + bouton d'appel.
 * @param {string} [o.city]       Ville (nettoyée).
 * @param {string} [o.message]    Message du client (nettoyé).
 * @param {string} o.reference
 */
const renderClient = (o) => {
  const title = o.name ? `Merci ${o.name} !` : "Merci pour votre demande !";
  const heading = o.name ? `Merci <span style="color:${C.orange}">${escapeHtml(o.name)}</span>&nbsp;!` : `Merci pour votre <span style="color:${C.orange}">demande</span>&nbsp;!`;
  const body = [
    `<tr><td height="6" bgcolor="${C.orange}" style="height:6px;background:${C.orange};font-size:0;line-height:0">&nbsp;</td></tr>`,
    row(`<img src="${LOGO_HTTPS_URL}" width="280" alt="${escapeHtml(LOGO_ALT)}" style="display:block;margin:0 auto;width:280px;max-width:80%;height:auto;border:0;outline:none;${t(18, 800, C.nuit)}">`, "30px 24px 6px"),
    row(`<h1 class="sd-h1" style="margin:0 0 18px;${t(o.name.length > 18 ? 28 : 34, 800, C.nuit, "line-height:1.2;letter-spacing:-.5px;overflow-wrap:anywhere")}">${heading}</h1><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr><td width="56" height="4" bgcolor="${C.orange}" style="width:56px;height:4px;background:${C.orange};border-radius:2px;font-size:0;line-height:0">&nbsp;</td></tr></table>`, "14px 28px 0"),
    row(`<p style="margin:0 0 14px;${t(17, 400, C.ink, "line-height:1.6")}">${nb(o.intro)}</p>`, "24px 40px 16px"),
    row(cardHtml(o.card), "0 20px"),
    o.city || o.message ? row(recapHtml(o.city, o.message), "16px 20px 0") : "",
    row(proofHtml(), "30px 28px 0"),
    row(`<p style="margin:0;${t(17, 400, C.ink, "line-height:1.6")}">À bientôt,<br><b style="color:${C.nuit}">${escapeHtml(BRAND.name)}</b></p><p style="margin:18px 0 0;${t(14, 400, C.slate, "line-height:1.6")}">${REPLY}</p>`, "28px 40px 32px"),
    row(`<div style="${t(13, 700, C.nuit, "line-height:1.6")}">${escapeHtml(BRAND.tagline)} · ${escapeHtml(BRAND.zone)}</div><div style="margin-top:4px"><a href="${BRAND.site}" style="${t(13, 600, C.slate, "text-decoration:underline")}">${BRAND.siteLabel}</a></div><div style="margin-top:10px;${t(12, 400, C.slate)}">Référence : ${escapeHtml(o.reference)}</div>`, "20px 24px", C.doux, `border-top:1px solid ${C.line}`),
  ].join("\n");
  const html = doc({ title: o.subject, preheader: o.preheader, body, width: 560, radius: 0 });
  const text = [
    title,
    "",
    ...(o.textLead ? [o.textLead, ""] : []),
    o.intro,
    "",
    ...(o.textLead ? [] : [`${o.card.label} ${o.card.value}`]),
    o.card.text,
    "",
    `${o.card.question ? `${o.card.question} ` : ""}Appelez le ${BRAND.phone}, ${HOURS.toLowerCase()}.`,
    "",
    ...(o.city || o.message ? ["Votre demande", ...(o.city ? [`Ville : ${o.city}`] : []), ...(o.message ? [`Votre message : « ${o.message} »`] : []), ""] : []),
    `${BRAND.googleRating}/5 sur Google · ${INSURANCE}`,
    "",
    "À bientôt,",
    BRAND.name,
    "",
    REPLY,
    "",
    "--",
    `${BRAND.tagline} · ${BRAND.zone}`,
    BRAND.site,
    `Référence : ${o.reference}`,
  ]
    .join("\n")
    .trim();
  return { html, text };
};

// ── Design B : notifications internes (opérationnelles) ───────────────────────────────────────────────────────────

const photosLostSentence = (count) =>
  `Le client a voulu joindre ${count > 1 ? `${count} photos qui n'ont pas pu être transmises` : "une photo qui n'a pas pu être transmise"} : à lui demander en répondant à sa demande.`;

/**
 * @param {object} o
 * @param {string} o.title      Titre (unique <h1>, dans la barre du haut).
 * @param {string} o.kind       « Demande de rappel » / « Demande de devis ».
 * @param {{date:string, ref:string}} o.meta
 * @param {string} [o.tag]      Pastille orange (ex. « À rappeler sous 30 minutes »).
 * @param {{label:string,value:string,sub?:string}} [o.lead]  Nom du client.
 * @param {{value:string,href:string}} [o.email]
 * @param {{label:string,href:string}[]} [o.buttons]  Le premier est orange, les suivants cernés de bleu nuit.
 * @param {string[]} [o.paragraphs]  Consigne (affichée sous les boutons).
 * @param {{title:string,text:string}} [o.section]  Message intégral du client.
 * @param {[string,string,string?,boolean?,boolean?][]} [o.facts]  « libellé / valeur / lien / (inutilisé) / masqué dans le HTML ».
 */
const renderInternal = (o) => {
  const facts = (o.facts || []).filter(([, v]) => v);
  const shown = facts.filter((f) => !f[4]);
  const top = `<tr><td class="sd-px" bgcolor="${C.nuit}" style="padding:20px 32px;background:${C.nuit}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><h1 style="margin:0;${t(14, 700, C.white)}">${escapeHtml(BRAND.name)} · ${escapeHtml(o.kind)}</h1></td><td valign="middle" align="right" style="${t(13, 400, C.brume, "line-height:1.5")}">Réf. ${escapeHtml(o.meta.ref)}</td></tr></table></td></tr>`;
  const banner = o.banner
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${C.orangePale};border-radius:12px;border:2px solid ${C.orange}"><tr><td style="padding:14px 16px;${t(15, 700, C.ink, "line-height:1.5")}">${nb(o.banner)}</td></tr></table>`
    : "";
  const tag = o.tag ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.orange}" style="background:${C.orange};border-radius:999px;padding:7px 14px;${t(14, 800, C.white)}">${nb(o.tag)}</td></tr></table>` : "";
  const lead = o.lead
    ? `<div style="margin:16px 0 ${o.lead.sub || o.email ? 2 : 18}px;${t(34, 800, C.nuit, "line-height:1.1;letter-spacing:-.5px;overflow-wrap:anywhere")}" class="sd-big">${escapeHtml(o.lead.value)}</div>${o.lead.sub ? `<div style="margin:0 0 ${o.email ? 2 : 18}px;${t(17, 400, C.slate)}">${escapeHtml(o.lead.sub)}</div>` : ""}`
    : "";
  const email = o.email ? `<div style="margin:0 0 18px;${t(17, 600, C.nuit, "overflow-wrap:anywhere;word-break:break-word")}"><a href="${escapeHtml(o.email.href)}" style="${t(17, 600, C.nuit, "text-decoration:underline")}">${escapeHtml(o.email.value)}</a></div>` : "";
  const buttons = (o.buttons || []).map((b, k) => `<div style="margin:0 0 12px">${button(b.label, b.href, { full: true, outline: k > 0 })}</div>`).join("");
  const instruction = (o.paragraphs || []).map((p) => `<p style="margin:6px 0 0;${t(15, 400, C.slate, "line-height:1.5")}">${nb(p)}</p>`).join("");
  const message = o.section
    ? `<div style="margin:22px 0 6px;${t(13, 800, C.orangeText, "letter-spacing:1px;text-transform:uppercase")}">${escapeHtml(o.section.title)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.pale};border-radius:12px"><tr><td style="padding:16px 18px;${t(16, 400, C.ink, "line-height:1.6;overflow-wrap:anywhere;word-break:break-word")}">${escapeHtml(o.section.text).replace(/\r\n|\r|\n/g, "<br>")}</td></tr></table>`
    : "";
  const count = o.photos?.count || 0;
  const lost = o.photos?.lost || 0;
  const cell = (n) => (n > count ? '<td class="sd-col" width="50%">&nbsp;</td>' : `<td class="sd-col" width="50%" valign="top" style="padding:0 4px 8px"><img class="sd-photo" src="cid:photo-${n}" width="256" alt="Photo ${n} envoyée par le client" style="display:block;width:100%;max-width:256px;height:auto;border:0;border-radius:10px;${t(13, 600, C.slate)}"></td>`);
  const rows = Array.from({ length: Math.ceil(count / 2) }, (_, k) => `<tr>${cell(2 * k + 1)}${cell(2 * k + 2)}</tr>`).join("");
  const gallery = count
    ? `<div style="margin:22px 0 8px;${t(13, 800, C.orangeText, "letter-spacing:1px;text-transform:uppercase")}">Photos du client (${count})</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.pale}" style="background:${C.pale};border-radius:12px"><tr><td style="padding:12px 8px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`
    : "";
  const missing = lost
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.orangePale}" style="margin:22px 0 0;background:${C.orangePale};border-radius:12px;border:2px solid ${C.orange}"><tr><td style="padding:14px 16px;${t(15, 700, C.ink, "line-height:1.5")}">${escapeHtml(photosLostSentence(lost))}</td></tr></table>`
    : "";
  const table = shown.length
    ? `<div style="margin:22px 0 0;${t(13, 800, C.orangeText, "letter-spacing:1px;text-transform:uppercase")}">${escapeHtml(o.factsTitle || "Informations")}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;border-top:1px solid ${C.line}">${shown
        .map(([label, value, href]) => `<tr><td class="sd-col" width="140" valign="top" style="padding:12px 0;border-bottom:1px solid ${C.line};${t(14, 600, C.slate, "line-height:1.5")}">${escapeHtml(label)}</td><td class="sd-col" valign="top" style="padding:12px 0;border-bottom:1px solid ${C.line};${t(15, 700, C.ink, "line-height:1.5;overflow-wrap:anywhere;word-break:break-word")}">${href ? `<a href="${escapeHtml(href)}" style="${t(15, 700, C.ink)}">${escapeHtml(value)}</a>` : nb(value)}</td></tr>`)
        .join("")}</table>`
    : "";
  const body = `${top}${section(`${banner}${tag}${lead}${email}${buttons}${instruction}${message}${gallery}${missing}${table}`, 30, 34)}`;
  const html = doc({ title: o.title, preheader: o.preheader, body, note: "Notification interne Style & Déco : à ne pas transférer au client." });
  const text = [
    o.title,
    "",
    ...(o.banner ? [o.banner, ""] : []),
    ...(o.lead ? [`${o.lead.label} : ${o.lead.value}`, ""] : []),
    ...(o.paragraphs || []).flatMap((p) => [p, ""]),
    ...(o.buttons || []).map((b) => `${b.label} : ${b.href.replace(/^(tel|mailto):/, "")}`),
    ...((o.buttons || []).length ? [""] : []),
    ...(o.section ? [`${o.section.title} :`, o.section.text, ""] : []),
    ...(count ? [`Photos du client : ${count} jointe${count > 1 ? "s" : ""} à ce message`, ""] : []),
    ...(lost ? [photosLostSentence(lost), ""] : []),
    ...facts.map(([l, v]) => `${l} : ${v}`),
  ]
    .join("\n")
    .trim();
  return { html, text };
};

export const renderEmail = (o) => (o.design === "B" ? renderInternal(o) : renderClient(o));

// ── Contenus métier ────────────────────────────────────────────────────────────────────────────────────────────

export const SUBJECT_CONFIRM_DEVIS = "Votre demande de devis est bien arrivée | Style & Déco";
export const SUBJECT_CONFIRM_CALLBACK = "Votre demande de rappel est bien arrivée | Style & Déco";

// Confirmation envoyée au client pour une demande de devis. Pas de promesse de devis établi ni de date de chantier.
// `lead` : nom, ville et message du client (nettoyés ici) ; absent = confirmation générique.
export const devisConfirmation = ({ reference, lead }) =>
  renderEmail({
    subject: SUBJECT_CONFIRM_DEVIS,
    preheader: "Nous revenons vers vous sous 24 h, par téléphone ou par e-mail.",
    name: safeName(lead?.name),
    intro: "Nous avons bien reçu votre demande de devis et nous la lisons avec attention.",
    card: {
      label: "Nous revenons vers vous",
      value: "sous 24 h",
      text: "Par téléphone ou par e-mail, pour parler de votre projet. Si besoin, nous passons sur place avant de préparer un devis détaillé, poste par poste.",
      question: "Un détail à ajouter ?",
    },
    city: safeCity(lead?.city),
    message: safeExcerpt(lead?.details),
    reference,
  });

// Confirmation envoyée au client pour une demande de rappel : `sentence` = business-hours.describe(slot).sentence.
export const callbackConfirmation = ({ reference, sentence, lead }) => {
  const when = sentence.replace(/^Nous vous (rappelons|recontacterons) /, "").replace(/\.$/, "");
  const phone = String(lead?.phone || "").replace(/[^\d+ .()-]/g, "").slice(0, 25);
  const soon = /^sous 30 minutes/.test(when);
  return renderEmail({
    subject: SUBJECT_CONFIRM_CALLBACK,
    preheader: sentence,
    textLead: sentence, // phrase complète (version texte brut)
    name: safeName(lead?.name),
    intro: "Nous avons bien reçu votre demande de rappel. Notre échange est gratuit et sans engagement.",
    card: {
      label: "Nous vous rappelons",
      value: when,
      text: soon
        ? `Gardez votre téléphone près de vous : nous vous appelons${phone ? ` au ${phone}` : ""}.`
        : `${phone ? `Au ${phone}. ` : ""}Les rappels reprennent dès l'ouverture, sans heure exacte garantie.`,
      question: "Un projet urgent ?",
    },
    reference,
  });
};

// Alerte interne immédiate : un client attend d'être rappelé — nom, puis bouton « Appeler ».
export const callbackAlert = ({ lead, receivedAt, reference, action, origin, reviewNote }) =>
  renderEmail({
    design: "B",
    kind: "Demande de rappel",
    meta: { date: parisDateTime(receivedAt), ref: reference },
    title: "Nouvelle demande de rappel",
    preheader: `${lead.name} · ${lead.phone} — ${action}`,
    tag: action.replace(/\.$/, "").replace(/^Rappeler ce client /, "À rappeler "),
    lead: { label: "Client à rappeler", value: lead.name, sub: lead.city },
    buttons: [{ label: `Appeler le ${lead.phone}`, href: telHref(lead.phone) }],
    paragraphs: [`Action : ${action}`],
    factsTitle: "Informations de suivi",
    facts: [
      ["Téléphone", lead.phone, telHref(lead.phone), false, true],
      ["E-mail", lead.email, lead.email ? `mailto:${lead.email}` : undefined],
      ["Ville", lead.city, undefined, false, true],
      ["Origine", origin],
      ["Demande reçue", parisDateTime(receivedAt)],
      ["Référence", reference, undefined, false, true],
      ["Contrôle antispam", reviewNote],
    ],
  });

// Rappel interne programmé (aucune pièce jointe) : à partir de l'ouverture. `when` = « lundi dès 8 h ».
export const reminderEmail = ({ lead, receivedAt, reference, origin, when, fallback }) =>
  renderEmail({
    design: "B",
    kind: "Rappel à effectuer",
    meta: { date: parisDateTime(receivedAt), ref: reference },
    title: "Un client attend votre rappel",
    preheader: `${lead.name} · ${lead.phone} — à rappeler ${when || "dès 8 h"}`,
    tag: `Rappel prévu ${when || "dès 8 h"}`,
    lead: { label: "Client à rappeler", value: lead.name, sub: lead.city },
    buttons: [{ label: `Appeler le ${lead.phone}`, href: telHref(lead.phone) }],
    paragraphs: [
      fallback
        ? "Le rappel automatique n'a pas pu être programmé : ce client est à contacter dès l'ouverture."
        : "Un client attend votre rappel à partir de 8 h.",
    ],
    factsTitle: "Informations de suivi",
    facts: [
      ["Téléphone", lead.phone, telHref(lead.phone), false, true],
      ["Rappel prévu", when || "dès 8 h", undefined, true, true],
      ["Ville", lead.city, undefined, false, true],
      ["Origine", origin],
      ["Demande reçue", parisDateTime(receivedAt)],
      ["Référence", reference, undefined, false, true],
    ],
  });

// Notification interne d'une demande de DEVIS. Une seule notification par demande. Toutes les données du formulaire sont
// affichées ; le message du client est reproduit intégralement. `formCode` (lead_hero…) reste dans la version texte pour le
// classement. `reviewReasons` : demande suspecte (quarantaine), signalée en tête du message.
export const devisAlert = ({ lead, receivedAt, reference, origin, formCode, reviewReasons, photos }) => {
  const rendered = renderEmail({
    design: "B",
    kind: "Demande de devis",
    meta: { date: parisDateTime(receivedAt), ref: reference },
    title: "Nouvelle demande de devis",
    preheader: `${lead.name}${lead.city ? ` · ${lead.city}` : ""} · ${lead.phone}`,
    banner: reviewReasons ? `Demande suspecte placée en quarantaine : à vérifier avant de répondre (indices : ${reviewReasons.join(", ")}).` : "",
    tag: "Nouvelle demande de devis",
    lead: { label: "Client", value: lead.name, sub: lead.city },
    email: lead.email ? { value: lead.email, href: `mailto:${lead.email}` } : undefined,
    buttons: [{ label: `Appeler le ${lead.phone}`, href: telHref(lead.phone) }, ...(lead.email ? [{ label: "Répondre par e-mail", href: `mailto:${lead.email}` }] : [])],
    section: lead.details ? { title: "Description des travaux", text: lead.details } : undefined,
    photos,
    factsTitle: "Informations de suivi",
    facts: [
      ["Téléphone", lead.phone, telHref(lead.phone), false, true],
      ["E-mail", lead.email, undefined, false, true],
      ["Ville", lead.city, undefined, false, true],
      ["Type de travaux", lead.subject, undefined, false, true],
      ["Origine", origin],
      ["Formulaire", formCode, undefined, false, true],
      ["Demande reçue", parisDateTime(receivedAt)],
      ["Référence", reference],
      ["Contrôle antispam", reviewReasons ? `QUARANTAINE — à vérifier (indices : ${reviewReasons.join(", ")})` : "", undefined, false, true],
    ],
  });
  // Version texte brut : mêmes libellés que l'ancienne notification (classement et recherche inchangés), toutes les informations du client.
  const rows = [
    ["Formulaire", formCode],
    ["Priorité", lead.priority],
    ["Nom", lead.name],
    ["Téléphone", lead.phone],
    ["E-mail", lead.email],
    ["Ville / Zone", lead.city],
    ["Type de travaux", lead.subject],
    ["Détails", lead.details],
    ["Photos", photos?.count ? `${photos.count} jointe${photos.count > 1 ? "s" : ""} à ce message` : ""],
    ["Photos non transmises", photos?.lost ? `${photos.lost} : à demander au client` : ""],
    ["Origine", origin],
    ["Reçu le", parisDateTime(receivedAt)],
    ["Référence", reference],
    ["Contrôle antispam", reviewReasons ? `QUARANTAINE — à vérifier (indices : ${reviewReasons.join(", ")})` : ""],
  ].filter(([, v]) => v);
  return { html: rendered.html, text: rows.map(([l, v]) => `${l} : ${v}`).join("\n") };
};
