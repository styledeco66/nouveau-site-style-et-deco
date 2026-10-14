import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Cohérence de l'identité, des données structurées, des métadonnées et du maillage (lot 2).
// Aucune dépendance, aucun accès réseau.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "sitesite-template");
const ORIGIN = "https://styleetdeco.fr";
const BIZ = `${ORIGIN}/#business`;
const SITE_ID = `${ORIGIN}/#website`;
const PUBLIC_PAGES = {
  "index.html": `${ORIGIN}/`,
  "perpignan.html": `${ORIGIN}/perpignan.html`,
  "peintre-saint-cyprien/index.html": `${ORIGIN}/peintre-saint-cyprien/`,
  "facade-saint-cyprien/index.html": `${ORIGIN}/facade-saint-cyprien/`,
};
const OTHER_PAGES = ["merci.html", "lead-rate-limited.html", "legal/mentions-legales.html", "legal/politique-confidentialite.html"];

const read = (file) => readFileSync(path.join(SITE, file), "utf8");
const decode = (text) =>
  text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
const squash = (text) => decode(text).replace(/\s+/g, " ").trim();
const plain = (html) => squash(html.replace(/<[^>]+>/g, " ")).replace(/\s+([,.])/g, "$1");
const visibleText = (html) =>
  squash(html.split("</head>")[1].replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " "));

const jsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
const nodesOf = (html) => jsonLd(html).flatMap((block) => (block["@graph"] ? block["@graph"] : [block]));
const allNodes = () =>
  Object.keys(PUBLIC_PAGES).flatMap((file) => nodesOf(read(file)).map((node) => ({ file, node })));
const typesOf = (node) => [].concat(node["@type"]);

test("tous les blocs JSON-LD sont du JSON valide et utilisent le contexte schema.org", () => {
  for (const file of Object.keys(PUBLIC_PAGES)) {
    const blocks = jsonLd(read(file));
    assert.ok(blocks.length >= 1, file);
    for (const block of blocks) assert.equal(block["@context"], "https://schema.org", file);
  }
});

test("une seule identité d'entreprise : HousePainter @id stable, définie une seule fois, sur l'accueil", () => {
  const businesses = allNodes().filter(({ node }) => typesOf(node).some((type) => ["HousePainter", "LocalBusiness", "Organization"].includes(type)));
  assert.equal(businesses.length, 1, "aucune autre entité d'entreprise (Perpignan, façade, Saint-Cyprien)");
  assert.equal(businesses[0].file, "index.html");
  assert.equal(businesses[0].node["@id"], BIZ);
  assert.deepEqual(typesOf(businesses[0].node), ["HousePainter"]);
});

test("l'entité utilise le nom commercial « Style & Déco » et ses variantes secondaires", () => {
  const { node } = allNodes().find(({ node }) => node["@id"] === BIZ);
  assert.equal(node.name, "Style & Déco");
  assert.deepEqual(node.alternateName, ["Style et Deco", "Style et Déco"]);
  const site = allNodes().find(({ node }) => node["@id"] === SITE_ID).node;
  assert.equal(site.name, "Style & Déco");
  assert.deepEqual(site.alternateName, ["Style et Deco", "Style et Déco"]);
});

test("les coordonnées du balisage correspondent au texte visible des pages", () => {
  const { node } = allNodes().find(({ node }) => node["@id"] === BIZ);
  assert.equal(node.telephone, "+33650756242");
  const home = read("index.html");
  assert.ok(home.includes("tel:+33650756242"));
  assert.ok(home.includes(`mailto:${node.email}`));
  const legal = squash(read("legal/mentions-legales.html"));
  assert.ok(legal.includes(`${node.address.streetAddress}, ${node.address.postalCode} ${node.address.addressLocality}`), "adresse = mentions légales");
  assert.ok(legal.includes(node.identifier.value), "SIRET = mentions légales");
  assert.equal(node.address.addressCountry, "FR");
});

test("aucune donnée non confirmée ni interdite : prix, avis notés, géolocalisation, prestations non exercées", () => {
  for (const { file, node } of allNodes()) {
    for (const forbidden of ["openingHours", "priceRange", "aggregateRating", "review", "geo"]) {
      assert.ok(!(forbidden in node), `${file} : ${forbidden} ne doit pas être renseigné sans confirmation`);
    }
    assert.ok(!typesOf(node).some((type) => ["Review", "AggregateRating", "Offer"].includes(type) && type !== "Offer"), file);
  }
  const text = Object.keys(PUBLIC_PAGES).map(read).join(" ");
  assert.doesNotMatch(text, /nettoyage de toiture|nettoyage toiture/i, "prestation non exercée");
});

test("la zone d'intervention du balisage se limite à la zone confirmée", () => {
  const { node } = allNodes().find(({ node }) => node["@id"] === BIZ);
  assert.deepEqual(node.areaServed.map((area) => area.name), ["Saint-Cyprien", "Perpignan", "Pyrénées-Orientales"]);
});

test("sameAs et hasMap ne contiennent que le profil Google déjà référencé sur le site", () => {
  const { node } = allNodes().find(({ node }) => node["@id"] === BIZ);
  const google = "https://www.google.com/maps?cid=3698755901832647189";
  assert.deepEqual(node.sameAs, [google]);
  assert.equal(node.hasMap, google);
  assert.ok(read("index.html").includes(`href="${google}"`));
});

test("chaque @id référencé existe dans le site ; chaque prestation du catalogue est définie une fois", () => {
  const defined = new Set();
  const referenced = new Set();
  const visit = (value, isDefinition = false) => {
    if (Array.isArray(value)) return value.forEach((item) => visit(item));
    if (!value || typeof value !== "object") return;
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === "@id") referenced.add(value["@id"]);
    else if (value["@id"] && value["@type"]) defined.add(value["@id"]);
    for (const [key, child] of Object.entries(value)) if (!key.startsWith("@")) visit(child);
  };
  const seen = new Map();
  for (const { file, node } of allNodes()) {
    if (node["@id"] && !node["@id"].endsWith("#webpage") && !node["@id"].endsWith("#breadcrumb")) {
      seen.set(node["@id"], (seen.get(node["@id"]) || 0) + 1);
    }
    visit(node);
  }
  for (const id of referenced) assert.ok(defined.has(id), `@id référencé mais non défini : ${id}`);
  for (const [id, count] of seen) assert.equal(count, 1, `@id défini plusieurs fois : ${id}`);
  const business = allNodes().find(({ node }) => node["@id"] === BIZ).node;
  const catalog = business.hasOfferCatalog.itemListElement.map((offer) => offer.itemOffered["@id"]);
  assert.equal(catalog.length, new Set(catalog).size);
  for (const id of catalog) assert.ok(defined.has(id), id);
});

test("les prestations balisées sont exactement les prestations confirmées et sont présentes dans le texte visible de l'accueil", () => {
  const services = allNodes().filter(({ node }) => typesOf(node).includes("Service")).map(({ node }) => node.name);
  assert.deepEqual(services, [
    "Peinture intérieure",
    "Peinture extérieure",
    "Rénovation de façades",
    "Enduits de préparation et de finition, dont enduits projetés mécaniquement",
    "Enduits décoratifs",
    "Bandes et joints de plaques de plâtre",
    "Rénovation après dégât des eaux",
    "Parquets et revêtements de sol",
    "Sols souples et revêtements LVT",
  ]);
  const home = visibleText(read("index.html"));
  for (const phrase of ["Peinture intérieure", "Peinture extérieure", "Enduits décoratifs", "Parquet & revêtements de sol", "enduits projetés mécaniquement", "bandes et joints de plaques de plâtre", "rénovation de façades", "dégât des eaux", "revêtements LVT"]) {
    assert.ok(home.toLowerCase().includes(phrase.toLowerCase()), `visible sur l'accueil : ${phrase}`);
  }
});

test("chaque page publique a un WebPage dont l'URL est sa canonique, et un fil d'Ariane (sauf l'accueil)", () => {
  for (const [file, url] of Object.entries(PUBLIC_PAGES)) {
    const html = read(file);
    assert.ok(html.includes(`<link rel="canonical" href="${url}" />`), `${file} : canonique`);
    const nodes = nodesOf(html);
    const page = nodes.find((node) => typesOf(node).includes("WebPage"));
    assert.equal(page.url, url, file);
    assert.equal(page["@id"], `${url}#webpage`);
    assert.equal(page.isPartOf["@id"], SITE_ID);
    assert.ok(page.about.some((entry) => entry["@id"] === BIZ));
    const crumbs = nodes.filter((node) => typesOf(node).includes("BreadcrumbList"));
    if (file === "index.html") assert.equal(crumbs.length, 0);
    else {
      assert.equal(crumbs.length, 1, file);
      const items = crumbs[0].itemListElement;
      assert.deepEqual(items.map((item) => item.position), [1, 2]);
      assert.equal(items[0].item, `${ORIGIN}/`);
      assert.equal(items[1].item, url);
      assert.equal(page.breadcrumb["@id"], crumbs[0]["@id"]);
    }
  }
});

test("les FAQ balisées reprennent mot pour mot le texte visible de la page", () => {
  for (const file of ["index.html", "perpignan.html"]) {
    const html = read(file);
    const visible = visibleText(html);
    const faq = jsonLd(html).find((block) => block["@type"] === "FAQPage");
    assert.ok(faq.mainEntity.length >= 5, file);
    for (const question of faq.mainEntity) {
      assert.ok(visible.includes(squash(question.name)), `${file} : question « ${question.name} »`);
      assert.ok(visible.includes(squash(question.acceptedAnswer.text)), `${file} : réponse à « ${question.name} »`);
    }
  }
});

test("le nom commercial est écrit « Style & Déco » dans les titres, métadonnées, logos et pieds de page", () => {
  const wrong = /Style (?:et|&amp;|&) Deco\b|Style et Déco\b/;
  for (const file of [...Object.keys(PUBLIC_PAGES), ...OTHER_PAGES]) {
    let html = read(file);
    // exclusions volontaires : variantes déclarées dans le balisage (alternateName), citations d'avis clients, sujets des formulaires (logique d'envoi) et dénomination légale « EI … » des pages juridiques
    html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "").replace(/<p class="reviewCard__text">[\s\S]*?<\/p>/g, "").replace(/<input type="hidden" name="subject"[^>]*>/g, "");
    if (file.startsWith("legal/")) html = html.replace(/EI Style et Deco/g, "").replace(/<h1>[\s\S]*$/, "");
    assert.ok(!wrong.test(html), `${file} : ancienne graphie du nom commercial`);
  }
  for (const [file] of Object.entries(PUBLIC_PAGES)) {
    const html = read(file);
    assert.match(html, /<meta property="og:site_name" content="Style &amp; Déco" \/>/, file);
    assert.match(html, /<div class="footer__brand">Style &amp; Déco<\/div>/, file);
    assert.match(html, /alt="Logo Style &amp; Déco"/, file);
  }
  for (const file of ["index.html", "perpignan.html", "facade-saint-cyprien/index.html", ...OTHER_PAGES]) {
    assert.match(read(file), /<title>[^<]*\| Style &amp; Déco<\/title>/, `${file} : titre`);
  }
});

test("les titres stratégiques de la page Saint-Cyprien et les canoniques restent inchangés", () => {
  assert.ok(read("peintre-saint-cyprien/index.html").includes("<title>Peintre à Saint-Cyprien (66750) | Intérieur, Façade &amp; Devis 24 h</title>"));
  assert.ok(read("index.html").includes("<title>Peintre Saint-Cyprien & Perpignan (66) | Style &amp; Déco</title>"));
});

test("aucune page publique n'est bloquée à l'indexation ; seule la page de confirmation reste noindex", () => {
  for (const file of Object.keys(PUBLIC_PAGES)) {
    const html = read(file);
    assert.match(html, /<meta name="robots" content="index,follow,max-image-preview:large" \/>/, file);
    assert.doesNotMatch(html, /noindex/i, file);
  }
  assert.match(read("merci.html"), /<meta name="robots" content="noindex,follow" \/>/);
  const headers = read("_headers");
  assert.doesNotMatch(headers, /X-Robots-Tag/i);
  const robots = read("robots.txt");
  assert.match(robots, /User-agent: \*\s+Allow: \//);
  assert.doesNotMatch(robots, /Disallow:\s*\S/);
});

test("le sitemap liste exactement les URL canoniques publiques et indexables", () => {
  const sitemap = read("sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  for (const url of Object.values(PUBLIC_PAGES)) assert.ok(locs.includes(url), url);
  assert.ok(!locs.some((loc) => loc.includes("merci")));
  for (const loc of locs) {
    const file = loc.replace(ORIGIN, "").replace(/\/$/, "/index.html").replace(/^\//, "") || "index.html";
    assert.ok(existsSync(path.join(SITE, file === "index.html" || file.endsWith(".html") ? file : `${file}index.html`)), loc);
  }
});

test("les prestations non exercées ne sont pas annoncées et les formulations commerciales sensibles ont disparu", () => {
  const all = [...Object.keys(PUBLIC_PAGES), ...OTHER_PAGES].map(read).join("\n");
  const visible = squash(all.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " "));
  const retired = [
    "Avis clients vérifiés",
    "25 à 35 € HT",
    "Garantie décennale sur les travaux de façade",
    "assurance décennale couvrant tous les travaux",
    "Artisan peintre certifié",
    "sans surcoût de déplacement",
    "sans frais de déplacement supplémentaires",
    "8 à 12 ans",
    "aides au ravalement pour les façades",
    "intervenant quotidiennement",
    "garantir une longévité maximale",
  ];
  for (const phrase of retired) assert.ok(!visible.includes(phrase), `formulation retirée encore présente : ${phrase}`);
});

test("maillage interne : tous les liens locaux pointent vers une page ou une ancre existante", () => {
  const files = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? files(full) : [full];
    });
  const pages = files(SITE).filter((file) => file.endsWith(".html"));
  const anchorsOf = (file) => new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    for (const [, href] of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|tel:|javascript:)/.test(href)) continue;
      const [target, hash] = href.split("#");
      let file = page;
      if (target) {
        file = target.startsWith("/") ? path.join(SITE, target) : path.resolve(path.dirname(page), target);
        if (file.endsWith("/") || (!path.extname(file) && existsSync(path.join(file, "index.html")))) file = path.join(file, "index.html");
        assert.ok(existsSync(file), `${path.relative(SITE, page)} → ${href} introuvable`);
      }
      if (hash && existsSync(file)) assert.ok(anchorsOf(file).has(hash) || hash === "top", `${path.relative(SITE, page)} → ${href} : ancre absente`);
    }
  }
});

test("maillage : les pages locales et prestations se renvoient des liens descriptifs depuis leur contenu", () => {
  const body = (file) => read(file).split("</header>")[1].split("<footer")[0];
  const link = (file, href, textPattern) =>
    assert.match(body(file), new RegExp(`<a href="${href.replace(/[./]/g, "\\$&")}">${textPattern}</a>`), `${file} → ${href}`);
  link("index.html", "./peintre-saint-cyprien/", "peintre à Saint-Cyprien");
  link("index.html", "./perpignan.html", "peintre à Perpignan");
  link("index.html", "./facade-saint-cyprien/", "ravalement de façade à Saint-Cyprien");
  link("perpignan.html", "./peintre-saint-cyprien/", "Saint-Cyprien");
  link("perpignan.html", "./facade-saint-cyprien/", "ravalement de façade à Saint-Cyprien");
  link("peintre-saint-cyprien/index.html", "../facade-saint-cyprien/", "ravalement de façade à Saint-Cyprien");
  link("peintre-saint-cyprien/index.html", "../perpignan.html", "peintre à Perpignan");
  link("facade-saint-cyprien/index.html", "../peintre-saint-cyprien/", "peintre à Saint-Cyprien");
});

test("les formulaires, la fonction d'envoi, les CSS/JS et les en-têtes ne sont pas concernés par le lot 2", () => {
  for (const file of ["index.html", "perpignan.html"]) {
    const html = read(file);
    assert.match(html, /action="\/\.netlify\/functions\/lead"/);
    assert.match(html, /assets\/js\/lead-form\.js\?v=[0-9a-f]{10}/);
  }
});

test("engagements confirmés : rappel sous 30 min, devis sous 24 h, démarrage sous 1 à 3 semaines, formulés de façon homogène", () => {
  const pages = [...Object.keys(PUBLIC_PAGES), "merci.html", "lead-rate-limited.html"];
  for (const file of pages) {
    const html = read(file);
    assert.doesNotMatch(html, /\b24h\b/, `${file} : écrire « 24 h »`);
    assert.doesNotMatch(html, /24 ?h ouvrées|heures ouvrées|En période normale|selon la période|peut souvent être proposé/, `${file} : ancienne formulation de délai`);
  }
  const home = read("index.html");
  assert.match(home, /On vous rappelle en moins de 30 minutes/);
  assert.match(home, /pendant nos horaires d'ouverture/);
  assert.match(home, /Réponse sous 24 h\. Sans engagement\./);
  assert.match(home, /Le démarrage des travaux intervient sous 1 à 3 semaines après validation du devis\./);
  const perpignan = read("perpignan.html");
  assert.match(perpignan, /Démarrage du chantier sous 1 à 3 semaines après validation du devis\./);
  assert.match(perpignan, /Sous 1 à 3 semaines après validation du devis\./);
  assert.match(read("merci.html"), /Je vous recontacte sous 24 h/);
});

test("nombre de chantiers : 104 exactement, sans « plus de » ni ancien chiffre", () => {
  const home = read("index.html");
  assert.match(home, /<div class="trust__kpi js-kpi-counter" data-value="104">104<\/div>\s*<div class="trust__label">chantiers réalisés<\/div>/);
  for (const file of Object.keys(PUBLIC_PAGES)) {
    const text = visibleText(read(file));
    assert.doesNotMatch(text, /\+ ?90|plus de (?:90|104)|\+ ?104/i, file);
  }
  assert.doesNotMatch(home, /data-prefix=/);
});

test("avis Google : 6 témoignages, textes intégraux (Despinoy compris), sans point de suspension artificiel ni réponse du propriétaire", () => {
  const html = read("index.html");
  const track = html.slice(html.indexOf('class="reviewsTrack"'), html.indexOf('<section class="callback30"'));
  const cards = [...track.matchAll(/<article class="(reviewCard[^"]*)"[^>]*>([\s\S]*?)<\/article>/g)].map((match) => ({
    cls: match[1],
    stars: match[2].match(/aria-label="(\d) sur 5"/)[1],
    text: [...match[2].matchAll(/reviewCard__text">([\s\S]*?)<\/p>/g)].map((paragraph) => squash(paragraph[1])).join(" "),
    meta: squash(match[2].match(/reviewCard__meta">([\s\S]*?)<\/p>/)[1].replace(/<[^>]+>/g, "")),
  }));
  assert.equal(cards.length, 6, "6 témoignages au maximum : 4 avis récents + 2 anciens");
  assert.deepEqual(cards.map((card) => card.meta.split(" • ")[0]), ["Jean Despinoy (Maxitoon)", "Brigitte Hardy", "Stéphanie Munoz", "Nathalie COPIN", "Marina IJ", "Loïc Guillaumes"]);
  assert.equal(cards.filter((card) => card.cls.includes("featured")).length, 1);
  assert.ok(cards[0].cls.includes("featured"));
  const expected = [
    ["Jean Despinoy (Maxitoon) • Avis Google • 2026", "Suite recherche j’ai voulu essayer car avis au top. Envoi du devis, très détaillé ce qui est super, assurances jointes ce qui est extrêmement rare. Travaux : Ponctuel, très professionnel, excellente protection du chantier, s’applique à ce que tout soit parfait, fin de chantier nickel avec nettoyage complet. Résultats exceptionnels, on voit que cet artisan est un vrai pro avec un travail soigné et de qualité. Rangé dans la catégorie des super artisans avec un haut niveau de compétences dans son domaine. Merci à lui."],
    ["Brigitte Hardy • Avis Google • 2026", "Artisan très professionnel et sérieux. Travail impeccable, finitions soignées et chantier laissé parfaitement propre. De très bons conseils et un vrai souci du détail. Je recommande vivement !"],
    ["Stéphanie Munoz • Avis Google • 2026", "J’ai fait appel à Nicolas pour des travaux de rafraîchissement (joints, peinture et parquet) et je suis très satisfaite du résultat. Son travail est minutieux, très soigné et réalisé avec beaucoup de sérieux. La qualité est irréprochable et tout est laissé propre. En plus d’être très professionnel, il est respectueux et agréable. Je le recommande vivement."],
    ["Nathalie COPIN • Avis Google • 2026", "Après l’achat de mon appartement à Saint-Estève, j’ai confié la rénovation complète en peinture à Style et déco , et le résultat est impeccable. Travail soigné, finitions parfaites, respect des délais et chantier propre du début à la fin. L’entreprise a totalement transformé mon appartement. Je recommande Style et déco pour tous travaux de peinture intérieure et rénovation d’appartement à Saint-Estève et aux alentours de Perpignan. Professionnalisme et excellent rapport qualité/prix"],
  ];
  expected.forEach(([meta, text], index) => {
    assert.equal(cards[index].meta, meta);
    assert.equal(cards[index].text, text);
    assert.equal(cards[index].stars, "5");
  });
  const visible = visibleText(html);
  for (const reply of ["Nous sommes particulièrement sensibles", "Merci beaucoup Stéphanie", "Merci beaucoup Brigitte", "Bonjour Monsieur Despinoy", "Propriétaire"]) {
    assert.ok(!visible.includes(reply), `réponse du propriétaire reprise par erreur : ${reply}`);
  }
  assert.ok(html.includes('href="https://www.google.com/maps?cid=3698755901832647189"'), "lien vers les avis Google conservé");
  for (const card of cards) assert.doesNotMatch(card.text, /…|\[\.\.\.\]|\[…\]|\.\.\./, `${card.meta} : aucune coupe ni point de suspension artificiel`);
  assert.equal(cards[4].text, "Travail de qualité et attitude de professionnel, tout en sachant établir une relation de confiance avec ses clients et en cherchant à les satisfaire.");
  assert.equal(cards[4].meta, "Marina IJ • Avis Google • 2025");
  assert.equal(cards[5].text, "Déjà 2 fois que je fais appel aux talents de M. Pluchart et toujours aussi content du résultat. Travail de très haute qualité et de très bons conseils.");
  assert.equal(cards[5].meta, "Loïc Guillaumes • Avis Google • 2023");
  assert.ok(!squash(track).includes("Refais mon plafond"), "avis comportant une faute : écarté");
});

test("horaires de la fiche Google (lundi-vendredi 8 h-18 h, week-end fermé) identiques dans le texte et le balisage", () => {
  const { node } = allNodes().find(({ node }) => node["@id"] === BIZ);
  assert.deepEqual(node.openingHoursSpecification, [
    { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "08:00:00", closes: "18:00:00" },
  ]);
  assert.match(visibleText(read("index.html")), /Lun - Ven 8h - 18h/);
  assert.match(visibleText(read("merci.html")), /Du lundi au vendredi, 8h – 18h/);
  for (const file of [...Object.keys(PUBLIC_PAGES), ...OTHER_PAGES]) {
    const text = visibleText(read(file));
    assert.doesNotMatch(text, /Lun - Sam|lundi au samedi|8h – 19h|8h - 19h|\b19h\b/i, `${file} : ancien horaire`);
    assert.doesNotMatch(text, /7 ?j(ours)? ?(sur|\/) ?7|7\/7|24 ?h ?\/ ?24|permanence|week-end|dimanche/i, `${file} : aucune promesse de disponibilité 7 jours sur 7`);
  }
});

test("note Google 4,9/5 et 16 avis affichés ; aucune note balisée", () => {
  const home = read("index.html");
  assert.match(home, /<strong>4,9\/5<\/strong>\s*<span>sur Google \(16 avis\)<\/span>/);
  assert.match(home, /data-value="4\.9"[^>]*>4,9\/5<\/div>\s*<div class="trust__label">16 avis Google<\/div>/);
  assert.doesNotMatch(JSON.stringify(allNodes()), /aggregateRating|ratingValue|reviewCount/);
});

test("étoiles : note déclarée = étoiles dessinées = note d'origine pour chaque avis affiché (aucun 4 étoiles transformé en 5)", () => {
  const html = read("index.html");
  const track = html.slice(html.indexOf('class="reviewsTrack"'), html.indexOf('<section class="callback30"'));
  const cards = [...track.matchAll(/<article class="reviewCard[^"]*"[^>]*>([\s\S]*?)<\/article>/g)].map((match) => ({
    author: squash(match[1].match(/reviewCard__meta">([\s\S]*?)<\/p>/)[1].replace(/<[^>]+>/g, "")).split(" • ")[0],
    declared: Number(match[1].match(/aria-label="(\d) sur 5"/)[1]),
    drawn: (match[1].match(/&#9733;/g) || []).length,
  }));
  // notes d'origine des 15 avis déjà présents ou intégrés (historique du site depuis le 16/02/2026 et captures Google)
  const original = {
    "Jean Despinoy (Maxitoon)": 5, "Brigitte Hardy": 5, "Stéphanie Munoz": 5, "Nathalie COPIN": 5,
    "JEAN PAUL PIZZUTO": 5, "Marina IJ": 5, "Eva Martinez": 5, "Loïc Guillaumes": 5,
    "Carlos Mateus da Silva": 4, "Jennifer Pichard": 5, "John B": 5, "Anissa Anissa": 5,
    "Jonathan Pueyo": 5, "Gabriel Merotto": 5, "FLORIAN ASTORGA": 4,
  };
  assert.equal(cards.length, 6);
  for (const card of cards) {
    assert.ok(card.author in original, `${card.author} : avis inconnu`);
    assert.equal(card.declared, original[card.author], `${card.author} : note déclarée`);
    assert.equal(card.drawn, original[card.author], `${card.author} : étoiles dessinées`);
  }
});

test("carrousel des avis : structure accessible, 6 avis, commandes manuelles et amélioration progressive", () => {
  const html = read("index.html");
  const carousel = html.slice(html.indexOf('<div class="reviewsCarousel'), html.indexOf('<section class="callback30"'));
  assert.match(carousel, /role="region" aria-roledescription="carousel" aria-label="Avis clients publiés sur Google"/);
  assert.equal((carousel.match(/aria-roledescription="slide"/g) || []).length, 6);
  for (let i = 1; i <= 6; i += 1) assert.ok(carousel.includes(`aria-label="Avis ${i} sur 6"`), `diapositive ${i}`);
  assert.equal((carousel.match(/class="reviewsDot"/g) || []).length, 6);
  assert.equal((carousel.match(/aria-label="Afficher l’avis \d sur 6"/g) || []).length, 6);
  assert.match(carousel, /data-dir="-1" aria-label="Avis précédent"/);
  assert.match(carousel, /data-dir="1" aria-label="Avis suivant"/);
  assert.match(carousel, /class="reviewsPause" type="button" aria-pressed="false" aria-label="Mettre en pause le défilement automatique des avis"/);
  assert.match(carousel, /<div class="reviewsControls" hidden>/, "commandes révélées par le JavaScript (amélioration progressive)");
  assert.doesNotMatch(carousel, /\son[a-z]+=|javascript:/i, "aucun gestionnaire en ligne (CSP)");
  assert.equal((carousel.match(/<svg[^>]*aria-hidden="true"/g) || []).length, 4, "icônes décoratives masquées aux lecteurs d'écran");
  // la note globale et le lien vers la fiche restent en dehors du carrousel, inchangés
  assert.match(html, /<strong>4,9\/5<\/strong>\s*<span>sur Google \(16 avis\)<\/span>/);
});

test("feuille de style du carrousel : reflet doré bref et ponctuel, animations réduites, focus visible, lisibilité mobile", () => {
  const css = readFileSync(path.join(SITE, "assets", "css", "style.css"), "utf8");
  const block = css.slice(css.indexOf("Avis clients : présentation premium"));
  // reflet : une seule passe de 0,5 à 0,8 s, uniquement pendant .is-shimmering, aucune lumière permanente
  const ring = block.match(/\.reviewsCarousel\.is-enhanced\.is-shimmering::before\{\s*animation: reviewsRing ([\d.]+)s [^;]*;/);
  assert.ok(ring, "animation du reflet de bordure");
  assert.ok(Number(ring[1]) >= 0.5 && Number(ring[1]) <= 0.8, `durée du reflet ${ring[1]} s`);
  assert.match(block, /\.reviewsCarousel\.is-enhanced::before\{[\s\S]*?opacity: 0;/, "bordure lumineuse invisible au repos");
  assert.match(block, /\.reviewsCarousel\.is-enhanced\.is-shimmering \.reviewsViewport::after\{\s*animation: reviewsSheen/);
  assert.doesNotMatch(block, /animation:[^;]*infinite/, "aucune animation en boucle");
  assert.match(block, /mask-composite: exclude/);
  // préférence de réduction des animations
  assert.match(block, /@media \(prefers-reduced-motion: reduce\)\{[\s\S]*transition: none !important;[\s\S]*display: none !important;/);
  // accessibilité et mobile
  assert.match(block, /\.reviewsNav:focus-visible[\s\S]*outline: 2px solid var\(--accent\)/);
  assert.match(block, /\.reviewsCarousel\.is-enhanced \.reviewCard\{[\s\S]*?grid-area: 1 \/ 1;/);
  assert.match(block, /width: 44px; height: 44px;/, "cibles tactiles de 44 px sur mobile");
  assert.match(block, /font-size: 16px; line-height: 1\.55/, "texte à 16 px sur mobile, jamais réduit");
  assert.doesNotMatch(block, /overflow-y: ?(auto|scroll)|overflow: ?(auto|scroll)/, "aucune barre de défilement interne");
  assert.match(block, /transition: height \.6s/, "la hauteur suit l'avis affiché avec une transition douce");
});

test("carte d'avis : étoiles, texte(s) en HTML, pied d'auteur ; initiales décoratives ; aucun texte généré par JavaScript", () => {
  const html = read("index.html");
  const track = html.slice(html.indexOf('class="reviewsTrack"'), html.indexOf('<section class="callback30"'));
  const articles = [...track.matchAll(/<article class="reviewCard[^"]*"[^>]*>([\s\S]*?)<\/article>/g)].map((match) => match[1]);
  assert.equal(articles.length, 6);
  for (const article of articles) {
    assert.match(article, /<p class="reviewCard__stars" aria-label="\d sur 5">(?:&#9733;){4,5}<\/p>/);
    assert.match(article, /<p class="reviewCard__text">[^<]{40,}<\/p>/, "le texte est dans le HTML (indexable)");
    assert.match(article, /<div class="reviewCard__author">\s*<span class="reviewCard__avatar" aria-hidden="true">[A-Z]{2}<\/span>\s*<p class="reviewCard__meta"><span class="reviewCard__name">[^<]+<\/span> • Avis Google • 20\d\d<\/p>/);
  }
  const js = readFileSync(path.join(SITE, "assets", "js", "app.js"), "utf8");
  assert.doesNotMatch(js, /textContent\s*=\s*[^;]*review|innerHTML\s*=[^;]*review/i, "les avis ne sont pas écrits lettre par lettre par le JavaScript");
});
