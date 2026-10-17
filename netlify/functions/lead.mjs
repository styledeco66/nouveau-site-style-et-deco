import { createHash } from "node:crypto";

import { assessLead } from "../lib/lead-spam.mjs";
import hours from "../../sitesite-template/assets/js/business-hours.js";
import {
  SUBJECT_CONFIRM_CALLBACK,
  SUBJECT_CONFIRM_DEVIS,
  callbackAlert,
  callbackConfirmation,
  devisConfirmation,
  logoAttachment,
  reminderEmail,
} from "../lib/emails.mjs";

// Netlify Function : valide une demande de contact/devis/rappel et la relaie par e-mail via Resend.
// Variables d'environnement : RESEND_API_KEY, LEAD_TO_EMAIL, LEAD_FROM_EMAIL, LEAD_ALLOWED_ORIGINS (optionnelle),
// LEAD_QUARANTINE_EMAIL (optionnelle : destinataire de la quarantaine, ex. adresse+verif@gmail.com ; à défaut LEAD_TO_EMAIL).
// Activation explicite (absentes = désactivé) : LEAD_CLIENT_CONFIRMATIONS=on (e-mail de confirmation au client),
// LEAD_SCHEDULED_REMINDERS=on (rappel interne programmé avant l'ouverture) ; LEAD_EMAIL_LOGO_MODE=cid (défaut) | https.
// Ces envois secondaires sont toujours désactivés sur les Deploy Previews et branch deploys.
// Voir docs/lead-delivery.md.

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_ALLOWED_ORIGINS = ["https://styleetdeco.fr"];
const SUCCESS_DEVIS = "/merci.html";
const SUCCESS_CALLBACK = "/merci-rappel.html";
const MAX_SCHEDULE_AHEAD_MS = 29 * 24 * 60 * 60 * 1000; // Resend : 30 jours maximum
const MAX_BODY_CHARS = 20000;
const RESEND_TIMEOUT_MS = 8000;
const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

const ERROR_MESSAGE =
  "Votre demande n’a pas pu être envoyée. Réessayez dans quelques minutes ou appelez le 06 50 75 62 42.";

const SUBJECT_DEVIS = "📩 DEMANDE DE DEVIS - Style & Deco";
const SUBJECT_CALLBACK = "[RAPPEL CLIENT] Nouveau rappel à effectuer";
const SUBJECT_REMINDER = "[RAPPEL À EFFECTUER] Client à contacter dès 8 h";
const ORIGIN_LABELS = {
  lead_hero: "Accueil (formulaire du haut de page)",
  lead_contact: "Accueil (formulaire de contact)",
  lead_perpignan: "Page Perpignan",
};
const SUBJECT_DEVIS_PERPIGNAN = "📩 DEMANDE DE DEVIS - Perpignan";
const REVIEW_PREFIX = "[À VÉRIFIER] ";
const PRIORITY_CALLBACK = "RAPPEL_30_MIN";

const FORMS = new Set(["lead_hero", "lead_contact", "lead_perpignan"]);
const MAX_LENGTH = { name: 100, email: 254, city: 100, subject: 150, details: 3000 };
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const SUBMISSION_ID = /^[A-Za-z0-9_-]{8,64}$/;

const errorResponse = (status, code, wantsHtml, extraHeaders = {}) => {
  const headers = { "Cache-Control": "no-store", ...extraHeaders };
  if (wantsHtml) {
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>Envoi impossible | Style &amp; Deco</title></head><body><main><p role="alert">${ERROR_MESSAGE}</p><p><a href="/">Retour à l’accueil</a></p></main></body></html>`;
    return new Response(html, { status, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  }
  return Response.json({ ok: false, error: code }, { status, headers });
};

// En production (et en branch deploy), seule la liste explicite (LEAD_ALLOWED_ORIGINS ou, à
// défaut, le domaine canonique) est autorisée.
//
// Sur un Deploy Preview Netlify UNIQUEMENT, l'adresse de CE preview (ex. https://deploy-preview-12--site.netlify.app)
// est ajoutée automatiquement : elle change à chaque PR, contrairement à LEAD_ALLOWED_ORIGINS. Le contexte est lu
// - dans le contexte d'exécution fourni par Netlify à la function (`context.deploy.context`) : c'est la source fiable,
//   car les variables d'environnement CONTEXT / DEPLOY_PRIME_URL ne sont pas toujours disponibles à l'exécution ;
// - ou, à défaut, dans la variable CONTEXT.
// L'adresse ajoutée est DEPLOY_PRIME_URL si elle est présente, sinon l'origine de la requête elle-même, acceptée
// uniquement si elle a la forme exacte d'un preview Netlify (https://deploy-preview-<n>--<site>.netlify.app).
// Jamais de wildcard générique, jamais hors contexte deploy-preview (production, branch deploy).
const PREVIEW_ORIGIN = /^https:\/\/deploy-preview-\d+--[a-z0-9-]+\.netlify\.app$/;

const isTrustedOrigin = (value) => {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
};

const parseAllowedOrigins = (env, { deployContext, ownOrigin } = {}) => {
  const configured = String(env.LEAD_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowed = configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;

  const context = String(env.CONTEXT || deployContext || "").trim();
  if (context !== "deploy-preview") return allowed;

  const previewUrl = String(env.DEPLOY_PRIME_URL || "").trim();
  const candidate = previewUrl || (ownOrigin && PREVIEW_ORIGIN.test(ownOrigin) ? ownOrigin : "");
  if (!candidate || allowed.includes(candidate)) return allowed;
  if (!candidate.startsWith("https://") || !isTrustedOrigin(candidate)) return allowed;
  return [...allowed, candidate];
};

const requestOrigin = (request) => {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
};

const cleanLine = (value) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim() : "";

const cleanMultiline = (value) =>
  typeof value === "string"
    ? value
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]/g, " ")
        .trim()
    : "";

const isValidPhone = (phone) => {
  if (!/^\+?[0-9 .()\-]{6,25}$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, "").length;
  return digits >= 9 && digits <= 15;
};

// Ne retient que la liste blanche de champs ; renvoie { lead } ou { invalid: true }.
// Les trois formulaires (accueil, contact, Perpignan) suivent exactement les mêmes règles ; le formulaire d'origine
// ne sert qu'à identifier la page de provenance. Le sujet est toujours fixé côté serveur.
const validateLead = (raw) => {
  const form = cleanLine(raw["form-name"]);
  if (!FORMS.has(form)) return { invalid: true };

  const callback = cleanLine(raw.lead_priority) === PRIORITY_CALLBACK;
  const lead = {
    form,
    priority: callback ? PRIORITY_CALLBACK : "STANDARD",
    name: cleanLine(raw.name),
    phone: cleanLine(raw.phone),
    // E-mail : obligatoire pour un devis, FACULTATIF pour un rappel (mais, s'il est renseigné, il doit être valide).
    email: cleanLine(raw.email),
    city: cleanLine(raw.city),
    details: cleanMultiline(raw.details),
    subject: "",
  };

  if (!isValidPhone(lead.phone)) return { invalid: true };
  for (const [field, max] of Object.entries(MAX_LENGTH)) {
    if (lead[field].length > max) return { invalid: true };
  }
  if (!lead.name) return { invalid: true };
  if (lead.email && !EMAIL_PATTERN.test(lead.email)) return { invalid: true };
  if (!callback) {
    if (!lead.details || !lead.city || !lead.email) return { invalid: true };
  }
  return { lead };
};

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const emailSubject = (lead, slot) => {
  if (lead.priority === PRIORITY_CALLBACK) {
    // Hors créneau « sous 30 min », le sujet indique la prochaine ouverture (le contenu reste identique).
    return slot && !slot.within30 ? `${SUBJECT_CALLBACK} — ${hours.describe(slot).button.replace("Être rappelé ", "")}` : SUBJECT_CALLBACK;
  }
  if (lead.form === "lead_perpignan") return SUBJECT_DEVIS_PERPIGNAN;
  return SUBJECT_DEVIS;
};

const emailRows = (lead, receivedAt, review, extra = []) =>
  [
    ["Formulaire", lead.form],
    ["Priorité", lead.priority],
    ["Nom", lead.name],
    ["Téléphone", lead.phone],
    ["E-mail", lead.email],
    ["Ville / Zone", lead.city],
    ["Type de travaux", lead.subject],
    ["Détails", lead.details],
    ["Reçu le", receivedAt],
    ...extra,
    ["Contrôle antispam", review ? `QUARANTAINE — à vérifier (indices : ${review.reasons.join(", ")})` : ""],
  ].filter(([, value]) => value);

// Identifiant de suivi stable (affiché dans les e-mails et utile au diagnostic) : dérivé de la clé de la demande.
const trackingReference = (key) => createHash("sha256").update(key).digest("hex").slice(0, 8).toUpperCase();

const splitRecipients = (value) =>
  String(value)
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);

// Notification interne principale (devis ou rappel). Quarantaine : jamais supprimée ; vers LEAD_QUARANTINE_EMAIL si définie,
// sinon vers le destinataire habituel (préfixe seul).
const buildEmail = (lead, receivedAt, env, review, { slot, reference } = {}) => {
  const recipients = review && String(env.LEAD_QUARANTINE_EMAIL || "").trim() ? env.LEAD_QUARANTINE_EMAIL : env.LEAD_TO_EMAIL;
  const subject = `${review ? REVIEW_PREFIX : ""}${emailSubject(lead, slot)}`;
  const email = { from: env.LEAD_FROM_EMAIL, to: splitRecipients(recipients), subject };

  if (lead.priority === PRIORITY_CALLBACK && slot) {
    const description = hours.describe(slot);
    const alert = callbackAlert({
      lead,
      receivedAt: new Date(receivedAt),
      reference,
      action: description.action,
      origin: ORIGIN_LABELS[lead.form],
      reviewNote: review ? `QUARANTAINE — à vérifier (indices : ${review.reasons.join(", ")})` : "",
    });
    email.text = `NOUVELLE DEMANDE DE RAPPEL\n\n${alert.text.replace(/^Nouvelle demande de rappel\n\n/, "")}`;
    email.html = alert.html;
  } else {
    const rows = emailRows(lead, receivedAt, review, reference ? [["Référence", reference]] : []);
    email.text = rows.map(([label, value]) => `${label} : ${value}`).join("\n");
    email.html = `<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">${rows
      .map(
        ([label, value]) =>
          `<tr><th align="left" valign="top">${escapeHtml(label)}</th><td style="white-space:pre-wrap">${escapeHtml(value)}</td></tr>`
      )
      .join("")}</table>`;
  }
  // Répondre au prospect depuis la boîte de réception.
  if (lead.email) email.reply_to = lead.email;
  return email;
};

// Clé d'idempotence Resend : submission_id généré par le navigateur (stable entre tentatives),
// sinon empreinte du contenu + fenêtre de 10 minutes.
const submissionKey = (raw, lead, now) => {
  const submissionId = typeof raw.submission_id === "string" ? raw.submission_id : "";
  if (SUBMISSION_ID.test(submissionId)) return submissionId;
  const bucket = Math.floor(now().getTime() / IDEMPOTENCY_WINDOW_MS);
  return createHash("sha256")
    .update(JSON.stringify([lead.form, lead.priority, lead.name, lead.phone, lead.email, lead.city, lead.subject, lead.details, bucket]))
    .digest("hex")
    .slice(0, 32);
};

// ── Appels Resend : nouvelle tentative compatible avec la documentation (idempotence 24 h) ───────────────────────────
// Une nouvelle tentative réutilise TOUJOURS la même clé ET le même contenu : Resend renvoie alors la réponse d'origine sans
// envoyer deux fois. Sont rejouées : erreur réseau/timeout (l'envoi a pu aboutir), 5xx, 429, et 409 `concurrent_idempotent_requests`
// (« une autre requête avec cette clé est en cours : réessayer plus tard »). Ne sont JAMAIS rejouées : les autres 4xx (refus définitif)
// et 409 `invalid_idempotent_request` (clé déjà utilisée avec un autre contenu : la demande a déjà été traitée sous cette clé).
// Tout est borné par une échéance (`deadline`) pour rester sous le délai du navigateur (15 s) ou de la plateforme.
const RETRY_DELAYS_MS = [300, 900, 1800];
const REPLAYABLE_STATUS = (status) => status === 0 || status === 429 || status >= 500;

const sendOnce = async (email, key, env, fetchImpl, label, timeoutMs) => {
  try {
    const response = await fetchImpl(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(email),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const code = result && typeof result.name === "string" ? result.name : "";
      console.error(`lead: Resend a répondu HTTP ${response.status}${code ? ` (${code})` : ""} [${label}]`);
      return { ok: false, status: response.status, code };
    }
    if (!result || typeof result.id !== "string" || !result.id) {
      console.error(`lead: réponse Resend sans identifiant [${label}]`);
      return { ok: false, status: response.status, code: "no_id" };
    }
    return { ok: true, id: result.id, status: response.status, code: "" };
  } catch (error) {
    console.error(`lead: échec de l'appel Resend (${error && error.name ? error.name : "erreur"}) [${label}]`);
    return { ok: false, status: 0, code: "network" };
  }
};

// Renvoie { ok, id } en cas de succès, sinon { ok:false, status, code, conflict } avec
//   conflict = "processed" (409 invalid_idempotent_request : déjà traité sous cette clé),
//   conflict = "pending"   (409 concurrent_idempotent_requests toujours en cours après les nouvelles tentatives).
const resendWithRetry = async (email, key, env, fetchImpl, label, { deadline, sleep }) => {
  let last = { ok: false, status: 0, code: "deadline" };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 500) break;
    last = await sendOnce(email, key, env, fetchImpl, label, Math.min(RESEND_TIMEOUT_MS, remaining));
    if (last.ok) return last;
    if (last.status === 409 && last.code === "invalid_idempotent_request") return { ...last, conflict: "processed" };
    const concurrent = last.status === 409 && last.code === "concurrent_idempotent_requests";
    if (!concurrent && !REPLAYABLE_STATUS(last.status)) break;
    if (attempt === RETRY_DELAYS_MS.length) break;
    await sleep(Math.min(RETRY_DELAYS_MS[attempt], Math.max(0, deadline - Date.now() - 500)));
  }
  return last.status === 409 && last.code === "concurrent_idempotent_requests" ? { ...last, conflict: "pending" } : last;
};

const MAIN_BUDGET_MS = 12000; // < 15 s (délai du navigateur) : la notification principale décide seule du succès affiché
const SECONDARY_BUDGET_MS = 9000;

// Notification principale. « Déjà traitée sous cette clé » (conflit définitif) = la demande a déjà été reçue (réponse perdue,
// double clic, rechargement) : succès, sans renvoi. Une requête encore EN COURS n'est jamais comptée comme réussie : si elle
// ne se termine pas dans le délai, la demande est signalée en échec (le visiteur peut renvoyer : même clé, aucun doublon).
const deliverMain = async (email, key, env, fetchImpl, timing) => {
  const result = await resendWithRetry(email, `lead-${key}`, env, fetchImpl, "notification", timing);
  if (result.ok) return { ok: true };
  if (result.conflict === "processed") {
    console.warn("lead: demande déjà reçue sous cette clé (doublon évité)");
    return { ok: true, replay: true };
  }
  return { ok: false };
};

const flagOn = (value) => ["on", "true", "1", "yes", "oui"].includes(String(value || "").trim().toLowerCase());

// Envois secondaires (confirmation client, rappel programmé) : désactivés SAUF contexte explicitement « production ».
// Contexte absent, inconnu, ambigu (variable et contexte d'exécution en désaccord) ou preview/branch deploy → désactivé,
// même si les variables d'activation sont définies globalement.
const resolveDeployContext = (env, deploy) => {
  const fromEnv = String((env && env.CONTEXT) || "").trim();
  const fromRuntime = String((deploy && deploy.context) || "").trim();
  if (fromEnv && fromRuntime && fromEnv !== fromRuntime) return "ambiguous";
  return fromEnv || fromRuntime || "";
};

const secondaryFeatures = (env, deploy) => {
  const production = resolveDeployContext(env, deploy) === "production";
  return {
    confirmations: production && flagOn(env.LEAD_CLIENT_CONFIRMATIONS),
    reminders: production && flagOn(env.LEAD_SCHEDULED_REMINDERS),
  };
};

// Confirmation au client : clé liée à l'identifiant stable de la demande → une même soumission (double clic, nouvelle tentative)
// ne produit jamais deux confirmations ; deux demandes distinctes, même le même jour avec la même adresse, ont chacune la leur.
const sendClientConfirmation = async ({ lead, receivedAt, reference, slot, key, env, fetchImpl, timing }) => {
  const callback = lead.priority === PRIORITY_CALLBACK;
  const logo = String(env.LEAD_EMAIL_LOGO_MODE || "cid").trim() === "https" ? "https" : "cid";
  const content = callback
    ? callbackConfirmation({ receivedAt, reference, sentence: hours.describe(slot).sentence, logo })
    : devisConfirmation({ receivedAt, reference, logo });
  const email = {
    from: env.LEAD_FROM_EMAIL,
    to: [lead.email],
    reply_to: "style.deco66@gmail.com",
    subject: callback ? SUBJECT_CONFIRM_CALLBACK : SUBJECT_CONFIRM_DEVIS,
    text: content.text,
    html: content.html,
  };
  if (logo === "cid") email.attachments = [logoAttachment()];
  const result = await resendWithRetry(email, `confirm-${callback ? "rappel" : "devis"}-${key}`, env, fetchImpl, "confirmation client", timing);
  if (result.ok) return { sent: true };
  if (result.conflict === "processed") {
    console.warn("lead: confirmation client déjà envoyée pour cette demande (doublon évité)");
    return { sent: false, duplicate: true };
  }
  console.error(`lead: confirmation client non envoyée${result.conflict === "pending" ? " (envoi précédent toujours en cours)" : ""}`);
  return { sent: false };
};

// Rappel interne programmé avec Resend (`scheduled_at`, instant UTC calculé côté serveur), sans pièce jointe.
// Échec de programmation : message de secours immédiat au dirigeant (si Resend répond encore), une seule fois (clé dédiée).
const scheduleReminder = async ({ lead, receivedAt, reference, slot, key, env, fetchImpl, timing }) => {
  const build = (fallback) => {
    const content = reminderEmail({ lead, receivedAt, reference, origin: ORIGIN_LABELS[lead.form], fallback });
    return { from: env.LEAD_FROM_EMAIL, to: splitRecipients(env.LEAD_TO_EMAIL), subject: SUBJECT_REMINDER, text: content.text, html: content.html, ...(lead.email ? { reply_to: lead.email } : {}) };
  };
  const when = slot.reminderAt;
  if (when.getTime() - receivedAt.getTime() > MAX_SCHEDULE_AHEAD_MS) {
    console.error("lead: rappel interne non programmé (échéance au-delà de la limite Resend)");
  } else {
    const scheduled = await resendWithRetry({ ...build(false), scheduled_at: when.toISOString() }, `remind-${key}`, env, fetchImpl, "rappel programmé", timing);
    if (scheduled.ok) return { scheduled: true };
    if (scheduled.conflict === "processed") {
      console.warn("lead: rappel déjà programmé pour cette demande (doublon évité)");
      return { scheduled: true, duplicate: true };
    }
  }
  const fallback = await resendWithRetry(build(true), `remind-fallback-${key}`, env, fetchImpl, "rappel de secours", timing);
  if (!fallback.ok && fallback.conflict !== "processed") console.error("lead: rappel interne ni programmé ni envoyé (action manuelle : voir la notification principale)");
  return { scheduled: false, fallback: fallback.ok || fallback.conflict === "processed" };
};

// Envois secondaires : indépendants, jamais bloquants pour le visiteur. Ne rejette jamais (erreurs journalisées sous forme de codes).
const runSecondary = async ({ lead, receivedAt, reference, slot, key, env, fetchImpl, features, sleep }) => {
  const timing = { deadline: Date.now() + SECONDARY_BUDGET_MS, sleep };
  const jobs = [];
  if (features.confirmations && lead.email) {
    jobs.push(sendClientConfirmation({ lead, receivedAt, reference, slot, key, env, fetchImpl, timing }));
  }
  if (features.reminders && lead.priority === PRIORITY_CALLBACK && slot.reminderAt) {
    jobs.push(scheduleReminder({ lead, receivedAt, reference, slot, key, env, fetchImpl, timing }));
  }
  const results = await Promise.allSettled(jobs);
  for (const result of results) if (result.status === "rejected") console.error("lead: opération secondaire interrompue");
};

const parseBody = (text, contentType) => {
  if (contentType.startsWith("application/json")) {
    try {
      const data = JSON.parse(text);
      return data && typeof data === "object" && !Array.isArray(data) ? data : null;
    } catch {
      return null;
    }
  }
  const data = {};
  for (const [name, value] of new URLSearchParams(text)) {
    if (!(name in data)) data[name] = value;
  }
  return data;
};

export const handleLead = async (request, { env = {}, fetchImpl = fetch, now = () => new Date(), deploy = {}, waitUntil = null, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) => {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  const isForm = contentType.startsWith("application/x-www-form-urlencoded");
  const fail = (status, code, headers) => errorResponse(status, code, isForm, headers);

  if (request.method !== "POST") return fail(405, "method_not_allowed", { Allow: "POST" });

  const origin = requestOrigin(request);
  let ownOrigin = "";
  try {
    ownOrigin = new URL(request.url).origin;
  } catch {
    ownOrigin = "";
  }
  if (!origin || !parseAllowedOrigins(env, { deployContext: deploy && deploy.context, ownOrigin }).includes(origin)) {
    return fail(403, "forbidden_origin");
  }

  if (!isForm && !contentType.startsWith("application/json")) return fail(415, "unsupported_media_type");

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_CHARS * 4) return fail(413, "payload_too_large");
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return fail(413, "payload_too_large");

  const raw = parseBody(text, contentType);
  if (!raw) return fail(400, "invalid_request");

  // Honeypot : champ invisible que seuls les robots remplissent. Refus générique (même réponse qu'une validation
  // ordinaire : rien ne révèle le critère), aucun e-mail. Vérifié côté serveur, donc aussi pour les appels directs.
  if (cleanLine(raw["bot-field"])) {
    console.warn("lead: demande écartée (code: honeypot)");
    return fail(400, "invalid_request");
  }

  const { lead, invalid } = validateLead(raw);
  if (invalid) return fail(400, "invalid_request");

  // Analyse du contenu (voir netlify/lib/lead-spam.mjs) : elle ne refuse JAMAIS une demande. Une demande suspecte part en
  // quarantaine (e-mail séparé, voir LEAD_QUARANTINE_EMAIL) ; les seuls refus sont le honeypot et les validations invalides.
  const assessment = assessLead(lead);
  const review = assessment.level === "review" ? assessment : null;
  if (review) console.warn(`lead: demande mise en quarantaine (score ${review.score}, indices: ${review.reasons.join(",")})`);

  if (!env.RESEND_API_KEY || !env.LEAD_TO_EMAIL || !env.LEAD_FROM_EMAIL) {
    console.error("lead: configuration d'envoi incomplète");
    return fail(500, "not_configured");
  }

  // Décision AUTORITATIVE de l'horaire : calculée ici, à l'instant de la demande, en heure de Paris (jamais celle du navigateur).
  const receivedAt = now();
  const isCallback = lead.priority === PRIORITY_CALLBACK;
  const slot = isCallback ? hours.callbackSlot(receivedAt) : null;
  const key = submissionKey(raw, lead, now);
  const reference = trackingReference(key);

  const email = buildEmail(lead, receivedAt.toISOString(), env, review, { slot, reference });
  const main = await deliverMain(email, key, env, fetchImpl, { deadline: Date.now() + MAIN_BUDGET_MS, sleep });
  if (!main.ok) return fail(502, "delivery_failed");

  // La notification principale est acceptée : le visiteur reçoit SA confirmation tout de suite. Les envois secondaires
  // (confirmation client, rappel programmé) ne le retardent pas et ne peuvent pas provoquer de faux échec : ils continuent après la
  // réponse via context.waitUntil() de Netlify (exécution prolongée jusqu'à la fin de la promesse, réponse déjà partie). Jamais pour
  // une demande suspecte, ni pour une demande déjà traitée (rejeu).
  if (!main.replay && !review) {
    const features = secondaryFeatures(env, deploy);
    if (features.confirmations || features.reminders) {
      const work = runSecondary({ lead, receivedAt, reference, slot, key, env, fetchImpl, features, sleep });
      if (typeof waitUntil === "function") waitUntil(work);
      else await work; // environnement sans waitUntil (anciens déploiements, tests) : on attend, jamais de promesse abandonnée
    }
  }

  // Page de confirmation selon le résultat validé ICI (pas selon un paramètre du navigateur) ; le code de créneau n'est qu'un affichage.
  const next = isCallback ? `${SUCCESS_CALLBACK}?s=${hours.slotCode(slot)}` : SUCCESS_DEVIS;
  if (isForm) {
    return new Response(null, { status: 303, headers: { Location: next, "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true, kind: isCallback ? "callback" : "devis", next }, { headers: { "Cache-Control": "no-store" } });
};

export const config = {
  path: "/.netlify/functions/lead",
  method: "POST",
  rateLimit: {
    action: "rewrite",
    to: "/lead-rate-limited.html",
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};

export default (request, context) =>
  handleLead(request, {
    env: process.env,
    deploy: context && context.deploy,
    waitUntil: context && typeof context.waitUntil === "function" ? (promise) => context.waitUntil(promise) : null,
  });
