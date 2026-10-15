// Détection des sollicitations non désirées (prospection SEO, publicité, démarchage automatisé).
//
// Principe : un score construit à partir de PLUSIEURS indices concordants, jamais d'un seul mot-clé.
//   - score < QUARANTINE_SCORE  → demande normale
//   - QUARANTINE_SCORE ≤ score < BLOCK_SCORE → « à vérifier » : la demande est transmise, mais marquée (aucune perte)
//   - score ≥ BLOCK_SCORE ET au moins deux familles d'indices → refus (réponse d'erreur générique, aucun e-mail)
// Fonction pure : aucune donnée n'est stockée ni journalisée ici ; les critères ne sont jamais renvoyés au client.

export const QUARANTINE_SCORE = 3;
export const BLOCK_SCORE = 7;
const MIN_FAMILIES_TO_BLOCK = 2;
const MIN_FILL_MS = 2500; // en dessous, la saisie complète est très improbable (le remplissage automatique reste toléré)
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// Vocabulaire de démarchage (français et anglais), volontairement spécifique : « site » ou « google » seuls ne comptent pas.
const SOLICITATION = [
  /\b(seo|backlinks?|netlinking|referencement naturel|referencement de votre|optimisation seo)\b/,
  /\b(premiere page|page 1|premieres positions|top 3) (de )?google\b/,
  /\bvisibilite (en ligne|sur google|web)\b/,
  /\b(creation|refonte|realisation) (de|d') ?(votre |un |vos )?(site|sites|boutique en ligne|application)\b/,
  /\bagence (web|digitale|de communication|marketing|seo)\b/,
  /\b(marketing digital|community manager|publicite en ligne|google ads|campagne publicitaire|leads? qualifies?)\b/,
  /\b(votre|le) site (web|internet)? ?(n'est pas|est mal|manque|pourrait|peut etre ameliore|a ete analyse)\b/,
  /\b(j'ai|nous avons) (visite|analyse|remarque) (votre|le) site\b/,
  /\b(audit gratuit|analyse gratuite|offre speciale|offre exclusive|sans engagement de votre part|proposition commerciale)\b/,
  /\b(we can help|your website|our team|our services|free audit|increase your|boost your|ranking|traffic|digital marketing|guaranteed)\b/,
  /\b(casino|crypto|bitcoin|forex|viagra|loan|pret rapide|investissement garanti|rencontres?|porn)\b/,
];
const WORKS = /\b(peintur|peindre|repeindre|mur|murs|plafond|facade|ravalement|enduit|ratissage|placo|joints?|sol|parquet|stratifie|lvt|carrelage|renov|rafraichi|appartement|maison|villa|studio|salon|chambre|cuisine|salle de bain|balcon|volet|boiserie|degat des eaux|humidite|fissure|m2|m²|devis|chantier|syndic|copropriete|agence immobiliere|location|vente)\b/;
const ENGLISH_STOP = /\b(the|and|you|your|our|with|for|are|this|that|have|will|can|from|please|best|price)\b/g;
const FRENCH_STOP = /\b(le|la|les|des|une|un|et|pour|vous|votre|nous|avec|dans|sur|est|que|bonjour|merci|je|mon|ma|mes)\b/g;
const URL_PATTERN = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|info|biz|xyz|top|click|online|site|shop|ru|cn|tk|ml|ga|cf|gq)\b/gi;
const SHORTENER = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|is\.gd|rb\.gy|shorturl\.at|wa\.me)\b/i;
const NON_LATIN = /[Ѐ-ӿ؀-ۿऀ-ॿ぀-ヿ㐀-鿿가-힯]/;

// Renvoie { score, families, level: "ok" | "review" | "block", reasons: [codes] } — les codes servent aux journaux internes uniquement.
export const assessLead = (lead, { startedAt, now = Date.now() } = {}) => {
  const reasons = [];
  const families = new Set();
  let score = 0;
  const add = (points, code, family) => {
    score += points;
    reasons.push(code);
    families.add(family);
  };

  const text = [lead.details, lead.subject, lead.city].filter(Boolean).join(" \n ");
  const flat = normalize(text);
  const all = `${text} ${lead.name}`;

  // 1. Vocabulaire de démarchage (2 points par motif distinct, plafonné à 6)
  const hits = SOLICITATION.filter((pattern) => pattern.test(flat)).length;
  if (hits) add(Math.min(6, hits * 2), "solicitation", "content");

  // 2. Liens : un lien isolé est normal (photo, plan, fiche produit) ; plusieurs ou raccourcis le sont moins
  const urls = (all.match(URL_PATTERN) || []).length;
  if (urls >= 3) add(3, "many_links", "links");
  else if (urls === 2) add(1, "two_links", "links");
  if (SHORTENER.test(all)) add(1, "shortener", "links");
  if (URL_PATTERN.test(lead.name || "")) add(3, "link_in_name", "links");
  URL_PATTERN.lastIndex = 0;

  // 3. Rapport avec une demande de travaux
  const hasWorks = WORKS.test(flat);
  if (!hasWorks && flat.length > 80) add(1, "no_works_vocabulary", "relevance");
  else if (hasWorks && score > 0) score = Math.max(0, score - 2); // une vraie demande de travaux compense un mot ambigu

  // 4. Langue : message anglais sans français
  const english = (flat.match(ENGLISH_STOP) || []).length;
  const french = (flat.match(FRENCH_STOP) || []).length;
  if (flat.length > 60 && english >= 4 && french <= 1) add(2, "english_text", "language");
  if (NON_LATIN.test(all)) add(3, "non_latin_script", "language");

  // 5. Comportement : formulaire rempli anormalement vite, ou envoi sans le script du site (appel direct)
  const started = Number(startedAt);
  if (!Number.isFinite(started) || started <= 0) add(1, "no_timing", "behavior");
  else {
    const elapsed = now - started;
    if (elapsed < 0 || elapsed > MAX_AGE_MS) add(1, "stale_timing", "behavior");
    else if (elapsed < MIN_FILL_MS) add(2, "too_fast", "behavior");
  }

  // 6. Cohérence des champs
  if (lead.details && lead.name && normalize(lead.details).trim() === normalize(lead.name).trim()) add(2, "details_equals_name", "content");
  if (lead.details && /(.)\1{9,}/.test(lead.details)) add(2, "repeated_chars", "content");

  let level = "ok";
  if (score >= BLOCK_SCORE && families.size >= MIN_FAMILIES_TO_BLOCK) level = "block";
  else if (score >= QUARANTINE_SCORE) level = "review";
  return { score, families: families.size, level, reasons };
};
