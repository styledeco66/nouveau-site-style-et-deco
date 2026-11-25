// Modèles d'e-mail de Style & Déco (HTML compatible messageries + version texte) et contenus métier.
// Une seule identité pour les cinq messages : bleu nuit et orange du site, texte lisible, gros bouton « Appeler ».
//   - clients (design A) : confirmation de devis, confirmation de rappel ;
//   - internes (design B) : alerte de rappel, rappel programmé, alerte de devis.
// Contraintes e-mail respectées : mise en page en tableaux, styles en ligne, largeur fluide ≤ 600 px, polices système,
// images HTTPS hébergées sur le site (aucune pièce jointe, aucun CID, aucun base64), aucun script.
// Toute donnée saisie par le visiteur est échappée (escapeHtml) ; les confirmations clients n'affichent le nom, la ville et
// le message qu'après nettoyage (aucun lien, aucune adresse, longueur limitée : voir safeName / safeExcerpt).
// Aucune dépendance.

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
  // Preuves affichées dans les e-mails clients : mêmes valeurs que scripts/google-reviews.json (un test vérifie l'égalité).
  googleRating: "4,9",
  googleCount: 16,
};

const C = {
  nuit: "#0B2341", // bleu nuit (en-tête, pied)
  nuit2: "#071A31", // bleu nuit profond (pied)
  orange: "#F2611D", // orange des actions
  orangeText: "#B8450C", // orange foncé pour les petits textes (contraste)
  pale: "#F2F5F9", // fond des encadrés
  orangePale: "#FFF1EA", // fond du créneau de rappel
  line: "#DCE3EC", // filets
  ink: "#0B1A2E", // texte
  slate: "#55627A", // texte secondaire
  green: "#12805C", // validé
  fond: "#E6EBF2", // fond extérieur
  brume: "#C3CFE2", // texte clair sur bleu nuit
  faint: "#8FA3C2", // petit texte sur bleu nuit
  white: "#ffffff",
  star: "#F5A623",
  okOnNuit: "#5FD3A3",
};
// Polices système uniquement (aucune police externe) : fiables dans toutes les messageries.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Roboto,Arial,sans-serif";

// Images : HTTPS sur notre domaine, chargées directement par le HTML (jamais en pièce jointe : une image jointe peut apparaître
// comme pièce jointe « noname » dans certaines messageries).
export const LOGO_HTTPS_URL = `${BRAND.site}/assets/images/email/logo-style-deco-email.png`;
export const PHOTO_HTTPS_URL = `${BRAND.site}/assets/images/email/chantier-facade-email.jpg`;
export const PHOTO_CAPTION = "Chantier réalisé à Perpignan : ravalement d'un immeuble";
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
    .replace(/(?:https?:\/\/|www\.)\S*/gi, " ")
    .replace(/\S+@\S+\.\S+/g, " ")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export const safeName = (name) => {
  const n = stripLinks(name).slice(0, 40).trim();
  return /\d{4,}/.test(n) ? "" : n;
};
export const safeExcerpt = (text, max = 280) => {
  const s = stripLinks(text);
  return s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, "")}…` : s;
};
export const safeCity = (city) => stripLinks(city).slice(0, 60);

const t = (size, weight, color, extra = "") => `font-family:${FONT};font-size:${size}px;font-weight:${weight};color:${color};${extra}`;

const STYLE = `<style>body{margin:0;padding:0;-webkit-text-size-adjust:100%}img{-ms-interpolation-mode:bicubic}a{color:${C.orangeText}}@media only screen and (max-width:620px){.sd-w{width:100%!important;border-radius:0!important}.sd-px{padding-left:22px!important;padding-right:22px!important}.sd-h1{font-size:28px!important;line-height:1.15!important}.sd-big{font-size:32px!important}.sd-col{display:block!important;width:100%!important;text-align:left!important;padding-bottom:4px!important}.sd-hide{display:none!important}}</style>`;

const doc = ({ title, preheader, body, note }) => `<!doctype html>
<html lang="fr" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${escapeHtml(title)}</title>
${STYLE}</head>
<body style="margin:0;padding:0;background:${C.fond}" bgcolor="${C.fond}"><div lang="fr" dir="ltr">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.fond};font-size:1px;line-height:1px">${escapeHtml(preheader || title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.fond}" style="background:${C.fond}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="sd-w" style="width:100%;max-width:600px;background:${C.white};border-radius:18px;overflow:hidden">
${body}
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="sd-w" style="width:100%;max-width:600px"><tr><td class="sd-px" style="padding:18px 8px;text-align:center;${t(12, 400, C.slate, "line-height:1.5")}">${escapeHtml(note)}</td></tr></table>
</td></tr></table></div></body></html>`;

const button = (label, href, { full = false, outline = false } = {}) => {
  const bg = outline ? C.white : C.orange;
  const fg = outline ? C.nuit : C.white;
  const border = outline ? `border:2px solid ${C.nuit};` : "";
  return `<table role="presentation" ${full ? 'width="100%" ' : ""}cellpadding="0" cellspacing="0" border="0"><tr><td${full ? ' align="center"' : ""} bgcolor="${bg}" style="background:${bg};border-radius:10px;${border}"><a href="${escapeHtml(href)}" style="display:${full ? "block" : "inline-block"};padding:16px 28px;border-radius:10px;${t(18, 800, fg, `text-decoration:none${full ? ";text-align:center" : ""}`)}">${nb(label)}</a></td></tr></table>`;
};

const section = (html, top = 28, bottom = 0) => `<tr><td class="sd-px" style="padding:${top}px 36px ${bottom}px">${html}</td></tr>`;

// ── Design A : e-mails clients ───────────────────────────────────────────────────────────────────────────────────────

const stepHtml = ({ state, title, text }, last) => {
  const dot = {
    done: [`background:${C.green};color:${C.white}`, "&#10003;", C.green],
    current: [`background:${C.orange};color:${C.white}`, "&#9679;", C.orange],
    next: [`background:${C.white};color:${C.slate};border:2px solid ${C.line}`, "&nbsp;", C.white],
  }[state];
  const line = last ? "" : `border-bottom:1px solid ${C.line};`;
  return `<tr><td width="40" valign="top" style="padding:16px 0;${line}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="28" align="center" valign="middle" bgcolor="${dot[2]}" style="width:28px;height:28px;border-radius:14px;${dot[0]};${t(14, 800, C.white)}">${dot[1]}</td></tr></table></td><td valign="top" style="padding:16px 0 16px 4px;${line}"><div style="${t(17, 800, C.nuit)}">${nb(title)}</div><div style="margin-top:3px;${t(15, 400, C.slate, "line-height:1.5")}">${nb(text)}</div></td></tr>`;
};

const recapHtml = (rows, message) => {
  const lines = rows
    .filter(([, v]) => v)
    .map(([l, v]) => `<tr><td class="sd-col" width="130" valign="top" style="padding:7px 0;${t(14, 600, C.slate)}">${escapeHtml(l)}</td><td class="sd-col" valign="top" style="padding:7px 0;${t(15, 700, C.ink)}">${nb(v)}</td></tr>`)
    .join("");
  const quote = message
    ? `<tr><td colspan="2" style="padding:12px 0 0"><div style="padding:14px 16px;background:${C.white};border-radius:10px;border:1px solid ${C.line};${t(15, 400, C.ink, "line-height:1.55;font-style:italic")}">&laquo;&nbsp;${nb(message)}&nbsp;&raquo;</div></td></tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.pale};border-radius:14px"><tr><td style="padding:20px 22px"><div style="${t(13, 800, C.orangeText, "letter-spacing:1px;text-transform:uppercase")}">Votre demande</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px">${lines}${quote}</table></td></tr></table>`;
};

const callBox = (title, text) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px solid ${C.line};border-radius:14px"><tr><td class="sd-px" style="padding:24px 26px"><div style="${t(20, 800, C.nuit)}">${escapeHtml(title)}</div><div style="margin:6px 0 18px;${t(15, 400, C.slate, "line-height:1.5")}">${nb(text)}</div>${button(`Appeler le ${BRAND.phone}`, BRAND.phoneHref)}<div style="margin-top:14px;${t(14, 400, C.slate)}">Ou répondez simplement à ce message.</div></td></tr></table>`;

const proofHtml = () =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="sd-col" valign="middle" style="padding:4px 0;${t(14, 500, C.slate)}"><span style="color:${C.star};letter-spacing:2px">&#9733;&#9733;&#9733;&#9733;&#9733;</span>&nbsp; <b style="color:${C.nuit}">${BRAND.googleRating}/5</b> sur Google, ${BRAND.googleCount} avis</td><td class="sd-col" valign="middle" align="right" style="padding:4px 0;${t(14, 500, C.slate)}"><span style="color:${C.green}">&#10003;</span>&nbsp; Assurance décennale et RC Pro</td></tr></table>`;

const footerHtml = () =>
  `<tr><td class="sd-px" bgcolor="${C.nuit2}" style="padding:30px 36px;background:${C.nuit2}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="sd-col" valign="top" style="${t(14, 400, C.brume, "line-height:1.7")}"><div style="${t(18, 800, C.white, "margin-bottom:2px")}">${escapeHtml(BRAND.name)}</div>${escapeHtml(BRAND.tagline)}<br>Du lundi au vendredi, de 8&nbsp;h à 18&nbsp;h</td><td class="sd-col" valign="top" align="right" style="${t(14, 400, C.brume, "line-height:1.7")}"><a href="${BRAND.phoneHref}" style="color:${C.white};font-weight:800;text-decoration:none">${BRAND.phone}</a><br><a href="${BRAND.emailHref}" style="color:${C.brume};text-decoration:none">${BRAND.email}</a><br><a href="${BRAND.site}" style="color:${C.brume};text-decoration:none">${BRAND.siteLabel}</a></td></tr></table><div style="margin-top:20px;padding-top:16px;border-top:1px solid #213B5F;${t(12, 400, C.faint, "line-height:1.5")}">${escapeHtml(BRAND.name)}, ${escapeHtml(BRAND.street)}, ${BRAND.postalCode} ${escapeHtml(BRAND.city)} (${BRAND.addressLabel.toLowerCase()})</div></td></tr>`;

/**
 * Modèle des e-mails clients (design A).
 * @param {object} o
 * @param {string} o.title        Titre principal (unique <h1>).
 * @param {string} [o.preheader]  Aperçu affiché dans la liste des messages.
 * @param {string} o.subtitle     Phrase sous le titre.
 * @param {string} [o.greeting]   « Bonjour Marie Dupont, »
 * @param {string[]} [o.paragraphs]
 * @param {{label:string,value:string,sub?:string}} [o.highlight]  Créneau de rappel en grand.
 * @param {{title:string,steps:{state:string,title:string,text:string}[]}} [o.steps]
 * @param {{title:string,text:string}} [o.note]  Court encadré d'information (ex. hors horaires).
 * @param {[string,string][]} [o.recap]  Lignes du récapitulatif ; o.message : message du client (nettoyé).
 * @param {{title:string,text:string}} o.help  Encadré « un détail à ajouter ? » avec bouton d'appel.
 */
const renderClient = (o) => {
  const hero = `<tr><td class="sd-px" bgcolor="${C.nuit}" style="padding:38px 36px 40px;background:${C.nuit}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#1B3557" style="background:#1B3557;border-radius:999px;padding:7px 14px;${t(14, 700, C.white)}"><span style="color:${C.okOnNuit}">&#10003;</span>&nbsp;&nbsp;Demande reçue</td></tr></table><h1 class="sd-h1" style="margin:20px 0 12px;${t(34, 800, C.white, "line-height:1.12;letter-spacing:-.5px")}">${escapeHtml(o.title)}</h1><p style="margin:0;${t(18, 400, C.brume, "line-height:1.5")}">${nb(o.subtitle)}</p></td></tr>`;
  const head = `<tr><td class="sd-px" bgcolor="${C.white}" style="padding:20px 36px;background:${C.white}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><img src="${LOGO_HTTPS_URL}" width="132" alt="${escapeHtml(LOGO_ALT)}" style="display:block;border:0;outline:none;height:auto;${t(15, 800, C.nuit)}"></td><td class="sd-hide" valign="middle" align="right" style="${t(13, 600, C.nuit, "line-height:1.45")}">${escapeHtml(BRAND.tagline)}<br><span style="color:${C.slate}">Saint-Cyprien · Perpignan</span></td></tr></table></td></tr>`;
  const photo = `<tr><td style="padding:0;line-height:0"><img src="${PHOTO_HTTPS_URL}" width="600" alt="${escapeHtml(PHOTO_CAPTION)}" style="display:block;width:100%;height:auto;border:0"></td></tr><tr><td class="sd-px" bgcolor="${C.pale}" style="padding:10px 36px;background:${C.pale};${t(13, 600, C.slate)}">${escapeHtml(PHOTO_CAPTION)}</td></tr>`;
  const para = (p) => `<p style="margin:0 0 14px;${t(17, 400, C.ink, "line-height:1.6")}">${nb(p)}</p>`;
  const intro = [o.greeting, ...(o.paragraphs || [])].filter(Boolean).map(para).join("");
  const highlight = o.highlight
    ? section(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.orangePale};border-radius:16px"><tr><td class="sd-px" style="padding:26px 28px"><div style="${t(13, 800, C.orangeText, "letter-spacing:1px;text-transform:uppercase")}">${escapeHtml(o.highlight.label)}</div><div class="sd-big" style="margin:4px 0 6px;${t(o.highlight.value.length > 20 ? 32 : 42, 800, C.nuit, "line-height:1.1;letter-spacing:-1px")}">${nb(o.highlight.value)}</div>${o.highlight.sub ? `<div style="${t(16, 400, C.slate, "line-height:1.5")}">${nb(o.highlight.sub)}</div>` : ""}</td></tr></table>`,
        32
      )
    : "";
  const steps = o.steps
    ? section(`<div style="${t(22, 800, C.nuit)}">${escapeHtml(o.steps.title)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px">${o.steps.steps.map((s, k) => stepHtml(s, k === o.steps.steps.length - 1)).join("")}</table>`, 8)
    : "";
  const note = o.note ? section(`<div style="${t(18, 800, C.nuit)}">${escapeHtml(o.note.title)}</div><p style="margin:6px 0 0;${t(15, 400, C.slate, "line-height:1.55")}">${nb(o.note.text)}</p>`, 4) : "";
  const body = [
    head,
    hero,
    o.highlight ? "" : photo,
    highlight,
    section(intro, o.highlight ? 28 : 32),
    steps,
    note,
    section(recapHtml(o.recap || [], o.message), 22),
    section(callBox(o.help.title, o.help.text), 22),
    section(proofHtml(), 26),
    section(`<p style="margin:0;${t(17, 400, C.ink, "line-height:1.6")}">À très vite,<br><b style="color:${C.nuit}">${escapeHtml(BRAND.name)}</b></p>`, 24, 34),
    footerHtml(),
  ].join("\n");
  const html = doc({ title: o.title, preheader: o.preheader, body, note: "Message envoyé automatiquement après votre demande sur styleetdeco.fr. Vous pouvez répondre à cet e-mail." });
  const text = [
    o.title,
    "",
    o.subtitle,
    "",
    ...(o.textLead ? [o.textLead, ""] : []),
    ...(o.highlight ? [`${o.highlight.label} : ${o.highlight.value}`, ...(o.highlight.sub ? [o.highlight.sub] : []), ""] : []),
    ...(o.greeting ? [o.greeting, ""] : []),
    ...(o.paragraphs || []).flatMap((p) => [p, ""]),
    ...(o.steps ? [`${o.steps.title}`, ...o.steps.steps.map((s) => `- ${s.title} : ${s.text}`), ""] : []),
    ...(o.note ? [`${o.note.title} ${o.note.text}`, ""] : []),
    "Votre demande",
    ...(o.recap || []).filter(([, v]) => v).map(([l, v]) => `${l} : ${v}`),
    ...(o.message ? [`Votre message : « ${o.message} »`] : []),
    "",
    `${o.help.title} ${o.help.text}`,
    `Appelez le ${BRAND.phone} ou répondez simplement à ce message.`,
    "",
    `${BRAND.googleRating}/5 sur Google, ${BRAND.googleCount} avis · Assurance décennale et RC Pro`,
    "",
    "À très vite,",
    BRAND.name,
    BRAND.tagline,
    BRAND.phone,
    BRAND.email,
    "",
    "--",
    `${BRAND.addressLabel} : ${BRAND.street}, ${BRAND.postalCode} ${BRAND.city}, ${BRAND.country}`,
    BRAND.site,
  ]
    .join("\n")
    .trim();
  return { html, text };
};

// ── Design B : notifications internes (opérationnelles) ───────────────────────────────────────────────────────────

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
  const table = shown.length
    ? `<div style="margin:22px 0 0;${t(13, 800, C.orangeText, "letter-spacing:1px;text-transform:uppercase")}">${escapeHtml(o.factsTitle || "Informations")}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;border-top:1px solid ${C.line}">${shown
        .map(([label, value, href]) => `<tr><td class="sd-col" width="140" valign="top" style="padding:12px 0;border-bottom:1px solid ${C.line};${t(14, 600, C.slate, "line-height:1.5")}">${escapeHtml(label)}</td><td class="sd-col" valign="top" style="padding:12px 0;border-bottom:1px solid ${C.line};${t(15, 700, C.ink, "line-height:1.5;overflow-wrap:anywhere;word-break:break-word")}">${href ? `<a href="${escapeHtml(href)}" style="${t(15, 700, C.ink)}">${escapeHtml(value)}</a>` : nb(value)}</td></tr>`)
        .join("")}</table>`
    : "";
  const body = `${top}${section(`${banner}${tag}${lead}${email}${buttons}${instruction}${message}${table}`, 30, 34)}`;
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

const greeting = (name) => {
  const n = safeName(name);
  return n ? `Bonjour ${n},` : "Bonjour,";
};

// Confirmation envoyée au client pour une demande de devis. Pas de promesse de devis établi ni de date de chantier.
// `lead` : nom, ville et message du client (nettoyés ici) ; absent = confirmation générique.
export const devisConfirmation = ({ receivedAt, reference, lead }) =>
  renderEmail({
    title: "Votre demande de devis est bien arrivée.",
    preheader: "Nous revenons vers vous sous 24 h, par téléphone ou par e-mail.",
    subtitle: "Nous revenons vers vous sous 24 h, par téléphone ou par e-mail.",
    greeting: greeting(lead?.name),
    paragraphs: ["Merci d'avoir contacté Style & Déco. Nous avons bien reçu votre demande et nous la lisons avec attention."],
    steps: {
      title: "Et maintenant ?",
      steps: [
        { state: "done", title: "Votre demande est reçue", text: `Reçue le ${parisDateTime(receivedAt)}. Rien à refaire de votre côté.` },
        { state: "current", title: "Nous vous répondons", text: "Sous 24 h, par téléphone ou par e-mail, pour comprendre votre projet." },
        { state: "next", title: "Visite si besoin, puis devis", text: "Un devis détaillé, poste par poste. L'attestation d'assurance est remise avec le devis, sur demande." },
      ],
    },
    recap: [
      ["Référence", reference],
      ["Ville", safeCity(lead?.city)],
    ],
    message: safeExcerpt(lead?.details),
    help: { title: "Un détail à ajouter ?", text: "Pour un projet urgent ou une précision, appelez-nous du lundi au vendredi, de 8 h à 18 h." },
  });

// Confirmation envoyée au client pour une demande de rappel : `sentence` = business-hours.describe(slot).sentence.
export const callbackConfirmation = ({ receivedAt, reference, sentence, lead }) => {
  const when = sentence.replace(/^Nous vous (rappelons|recontacterons) /, "").replace(/\.$/, "");
  const phone = String(lead?.phone || "").replace(/[^\d+ .()-]/g, "").slice(0, 25);
  return renderEmail({
    title: "Votre demande de rappel est bien arrivée.",
    preheader: sentence,
    textLead: sentence, // phrase complète (version texte brut)
    subtitle: "Laissez votre téléphone libre : nous vous appelons.",
    greeting: greeting(lead?.name),
    paragraphs: [
      "Merci pour votre demande. Notre échange est gratuit et sans engagement : nous parlons de votre projet et, si besoin, nous convenons d'un devis ou d'une visite sur place.",
    ],
    highlight: {
      label: "Nous vous rappelons",
      value: when,
      sub: phone ? `au ${phone}, du lundi au vendredi de 8 h à 18 h.` : "du lundi au vendredi de 8 h à 18 h.",
    },
    note: /^sous 30 minutes/.test(when)
      ? undefined
      : { title: "Hors de nos horaires ?", text: "Les rappels reprennent dès l'ouverture, du lundi au vendredi à 8 h, sans heure exacte garantie." },
    recap: [
      ["Reçue le", parisDateTime(receivedAt)],
      ["Référence", reference],
      ["Ville", safeCity(lead?.city)],
    ],
    help: { title: "Un projet urgent ?", text: "Appelez-nous directement, nous décrochons du lundi au vendredi, de 8 h à 18 h." },
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
export const devisAlert = ({ lead, receivedAt, reference, origin, formCode, reviewReasons }) => {
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
    ["Origine", origin],
    ["Reçu le", parisDateTime(receivedAt)],
    ["Référence", reference],
    ["Contrôle antispam", reviewReasons ? `QUARANTAINE — à vérifier (indices : ${reviewReasons.join(", ")})` : ""],
  ].filter(([, v]) => v);
  return { html: rendered.html, text: rows.map(([l, v]) => `${l} : ${v}`).join("\n") };
};
