// Repérage des sollicitations non désirées (prospection SEO, publicité, démarchage automatisé).
//
// Ce module ne SUPPRIME JAMAIS une demande. Il produit seulement un niveau :
//   - "ok"     : demande normale ;
//   - "review" : demande suspecte → la function la transmet en QUARANTAINE (voir lead.mjs et docs/lead-delivery.md),
//                c'est-à-dire un e-mail séparé de la boîte principale, jamais perdu.
// Seuls des indices de CONTENU comptent, et plusieurs sont nécessaires (un mot isolé ne suffit pas). La langue, l'alphabet,
// la vitesse de remplissage et l'absence de script n'entrent volontairement PAS dans le calcul : un client qui écrit en anglais
// ou dans un autre alphabet, ou qui utilise le remplissage automatique, n'est jamais pénalisé pour cela.
// Fonction pure : aucune donnée n'est stockée ni journalisée ici ; les critères ne sont jamais renvoyés au client.

export const QUARANTINE_SCORE = 3;

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
const URL_PATTERN = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|info|biz|xyz|top|click|online|site|shop|ru|cn|tk|ml|ga|cf|gq)\b/gi;
const SHORTENER = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|is\.gd|rb\.gy|shorturl\.at|wa\.me)\b/i;

// Renvoie { score, level: "ok" | "review", reasons: [codes] } — les codes servent aux journaux internes uniquement.
export const assessLead = (lead) => {
  const reasons = [];
  let score = 0;
  const add = (points, code) => {
    score += points;
    reasons.push(code);
  };

  const text = [lead.details, lead.subject, lead.city].filter(Boolean).join(" \n ");
  const flat = normalize(text);
  const all = `${text} ${lead.name}`;

  // 1. Vocabulaire de démarchage (2 points par motif distinct, plafonné à 6)
  const hits = SOLICITATION.filter((pattern) => pattern.test(flat)).length;
  if (hits) add(Math.min(6, hits * 2), "solicitation");

  // 2. Liens : un lien isolé est normal (photo, plan, fiche produit) ; plusieurs ou raccourcis le sont moins
  const urls = (all.match(URL_PATTERN) || []).length;
  if (urls >= 3) add(3, "many_links");
  else if (urls === 2) add(1, "two_links");
  if (SHORTENER.test(all)) add(1, "shortener");
  URL_PATTERN.lastIndex = 0;
  if (URL_PATTERN.test(lead.name || "")) add(3, "link_in_name");
  URL_PATTERN.lastIndex = 0;

  // 3. Rapport avec une demande de travaux : un vocabulaire de chantier compense un mot ambigu
  const hasWorks = WORKS.test(flat);
  if (!hasWorks && flat.length > 80) add(1, "no_works_vocabulary");
  else if (hasWorks && score > 0) score = Math.max(0, score - 2);

  // 4. Cohérence des champs
  if (lead.details && lead.name && normalize(lead.details).trim() === normalize(lead.name).trim()) add(2, "details_equals_name");
  if (lead.details && /(.)\1{9,}/.test(lead.details)) add(2, "repeated_chars");

  return { score, level: score >= QUARANTINE_SCORE ? "review" : "ok", reasons };
};
