import { createHash } from "node:crypto";

// Netlify Function : valide une demande de contact/devis/rappel et la relaie par e-mail via Resend.
// Variables d'environnement : RESEND_API_KEY, LEAD_TO_EMAIL, LEAD_FROM_EMAIL, LEAD_ALLOWED_ORIGINS (optionnelle).
// Voir docs/lead-delivery.md.

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_ALLOWED_ORIGINS = ["https://styleetdeco.fr"];
const SUCCESS_PATH = "/merci.html";
const MAX_BODY_CHARS = 20000;
const RESEND_TIMEOUT_MS = 8000;
const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

const ERROR_MESSAGE =
  "Votre demande n’a pas pu être envoyée. Réessayez dans quelques minutes ou appelez le 06 50 75 62 42.";

const SUBJECT_DEVIS = "📩 DEMANDE DE DEVIS - Style & Deco";
const SUBJECT_CALLBACK = "🚨 RAPPEL 30 MIN - Style & Deco";
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
// défaut, le domaine canonique) est autorisée. Sur un Deploy Preview Netlify uniquement
// (CONTEXT === "deploy-preview"), `DEPLOY_PRIME_URL` est fournie automatiquement par Netlify et
// vaut l'adresse canonique de CE preview (ex. https://deploy-preview-12--site.netlify.app) :
// elle change à chaque PR sans intervention manuelle, contrairement à LEAD_ALLOWED_ORIGINS.
// Elle est ajoutée telle quelle (jamais de wildcard ni de *.netlify.app générique), et jamais
// hors du contexte deploy-preview, même si la variable est présente (production, branch deploy).
const parseAllowedOrigins = (env) => {
  const configured = String(env.LEAD_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowed = configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;

  if (String(env.CONTEXT || "").trim() !== "deploy-preview") return allowed;
  const previewUrl = String(env.DEPLOY_PRIME_URL || "").trim();
  if (!previewUrl || allowed.includes(previewUrl)) return allowed;
  if (!previewUrl.startsWith("https://")) return allowed;
  try {
    if (new URL(previewUrl).origin !== previewUrl) return allowed;
  } catch {
    return allowed;
  }
  return [...allowed, previewUrl];
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
const validateLead = (raw) => {
  const form = cleanLine(raw["form-name"]);
  if (!FORMS.has(form)) return { invalid: true };

  const isPerpignan = form === "lead_perpignan";
  const callback = !isPerpignan && cleanLine(raw.lead_priority) === PRIORITY_CALLBACK;
  const lead = {
    form,
    priority: callback ? PRIORITY_CALLBACK : "STANDARD",
    name: cleanLine(raw.name),
    phone: cleanLine(raw.phone),
    // L'e-mail n'est demandé que pour les devis : un rappel urgent l'ignore totalement.
    email: callback ? "" : cleanLine(raw.email),
    city: isPerpignan ? "" : cleanLine(raw.city),
    details: cleanMultiline(raw.details),
    subject: isPerpignan ? cleanLine(raw.subject) : "",
  };

  if (!isValidPhone(lead.phone)) return { invalid: true };
  for (const [field, max] of Object.entries(MAX_LENGTH)) {
    if (lead[field].length > max) return { invalid: true };
  }
  if (!lead.name) return { invalid: true };
  if (!callback) {
    if (!lead.details || !EMAIL_PATTERN.test(lead.email)) return { invalid: true };
    if (isPerpignan ? !lead.subject : !lead.city) return { invalid: true };
  }
  return { lead };
};

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const emailSubject = (lead) => {
  if (lead.priority === PRIORITY_CALLBACK) return SUBJECT_CALLBACK;
  if (lead.form === "lead_perpignan") return `📩 DEMANDE DE DEVIS - Perpignan - ${lead.subject}`;
  return SUBJECT_DEVIS;
};

const emailRows = (lead, receivedAt) =>
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
  ].filter(([, value]) => value);

const buildEmail = (lead, receivedAt, env) => {
  const rows = emailRows(lead, receivedAt);
  const text = rows.map(([label, value]) => `${label} : ${value}`).join("\n");
  const html = `<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">${rows
    .map(
      ([label, value]) =>
        `<tr><th align="left" valign="top">${escapeHtml(label)}</th><td style="white-space:pre-wrap">${escapeHtml(value)}</td></tr>`
    )
    .join("")}</table>`;
  const to = String(env.LEAD_TO_EMAIL)
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  const email = { from: env.LEAD_FROM_EMAIL, to, subject: emailSubject(lead), text, html };
  // Répondre au prospect depuis la boîte de réception ; aucun e-mail n'est envoyé au prospect.
  if (lead.email) email.reply_to = lead.email;
  return email;
};

// Clé d'idempotence Resend : submission_id généré par le navigateur (stable entre tentatives),
// sinon empreinte du contenu + fenêtre de 10 minutes.
const idempotencyKey = (raw, lead, now) => {
  const submissionId = typeof raw.submission_id === "string" ? raw.submission_id : "";
  if (SUBMISSION_ID.test(submissionId)) return `lead-${submissionId}`;
  const bucket = Math.floor(now().getTime() / IDEMPOTENCY_WINDOW_MS);
  const digest = createHash("sha256")
    .update(JSON.stringify([lead.form, lead.priority, lead.name, lead.phone, lead.email, lead.city, lead.subject, lead.details, bucket]))
    .digest("hex")
    .slice(0, 32);
  return `lead-${digest}`;
};

const sendWithResend = async (email, key, env, fetchImpl) => {
  try {
    const response = await fetchImpl(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(email),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`lead: Resend a répondu HTTP ${response.status}`);
      return false;
    }
    const result = await response.json().catch(() => null);
    if (!result || typeof result.id !== "string" || !result.id) {
      console.error("lead: réponse Resend sans identifiant");
      return false;
    }
    return true;
  } catch (error) {
    console.error(`lead: échec de l'appel Resend (${error && error.name ? error.name : "erreur"})`);
    return false;
  }
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

export const handleLead = async (request, { env = {}, fetchImpl = fetch, now = () => new Date() } = {}) => {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  const isForm = contentType.startsWith("application/x-www-form-urlencoded");
  const fail = (status, code, headers) => errorResponse(status, code, isForm, headers);

  if (request.method !== "POST") return fail(405, "method_not_allowed", { Allow: "POST" });

  const origin = requestOrigin(request);
  if (!origin || !parseAllowedOrigins(env).includes(origin)) return fail(403, "forbidden_origin");

  if (!isForm && !contentType.startsWith("application/json")) return fail(415, "unsupported_media_type");

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_CHARS * 4) return fail(413, "payload_too_large");
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return fail(413, "payload_too_large");

  const raw = parseBody(text, contentType);
  if (!raw) return fail(400, "invalid_request");

  if (cleanLine(raw["bot-field"])) return fail(400, "invalid_request");

  const { lead, invalid } = validateLead(raw);
  if (invalid) return fail(400, "invalid_request");

  if (!env.RESEND_API_KEY || !env.LEAD_TO_EMAIL || !env.LEAD_FROM_EMAIL) {
    console.error("lead: configuration d'envoi incomplète");
    return fail(500, "not_configured");
  }

  const email = buildEmail(lead, now().toISOString(), env);
  const delivered = await sendWithResend(email, idempotencyKey(raw, lead, now), env, fetchImpl);
  if (!delivered) return fail(502, "delivery_failed");

  if (isForm) {
    return new Response(null, { status: 303, headers: { Location: SUCCESS_PATH, "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
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

export default (request) => handleLead(request, { env: process.env });
