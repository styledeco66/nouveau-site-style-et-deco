// Fiche réalisation n°2 : mise en peinture complète d'une maison de standing de 300 m² à Perpignan.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const SITE = fileURLToPath(new URL("../sitesite-template", import.meta.url));
const read = (p) => readFileSync(join(SITE, p), "utf8");
const SLUG = "peinture-interieure-maison-standing-perpignan";
const FICHE = `realisations/${SLUG}/index.html`;
const URL_FICHE = `https://styleetdeco.fr/realisations/${SLUG}/`;
const IMG_DIR = "assets/images/realisations/peinture-interieure-maison-perpignan";
const text = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&#x27;|&apos;/g, "'").replace(/\s+/g, " ");
const graph = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];

test("métadonnées : title, description, H1 unique, canonique, Open Graph et Twitter", () => {
  const html = read(FICHE);
  assert.match(html, /<title>Peinture intérieure à Perpignan : maison de 300 m² \| Style &amp; Déco<\/title>/);
  assert.match(html, /<meta name="description" content="Découvrez notre chantier de peinture intérieure dans une maison de standing de 300 m² à Perpignan : ratissage complet, murs grège, plafonds blancs et Marmorino\." \/>/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<h1>Mise en peinture complète d&#x27;une maison de standing de 300 m² à Perpignan<\/h1>/);
  assert.match(html, new RegExp(`rel="canonical" href="${URL_FICHE.replace(/\//g, "\\/")}"`));
  assert.match(html, /<meta name="robots" content="index,follow,max-image-preview:large" \/>/);
  assert.match(html, new RegExp(`property="og:url" content="${URL_FICHE}"`));
  assert.match(html, /property="og:image" content="https:\/\/styleetdeco\.fr\/assets\/images\/interieur-sejour-murs-blancs-baie-vitree\.webp"/);
  assert.match(html, /property="og:image:width" content="1536"[\s\S]*property="og:image:height" content="1024"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.ok(existsSync(join(SITE, "assets/images/interieur-sejour-murs-blancs-baie-vitree.webp")));
});

test("structure : fil d'Ariane visible = fil d'Ariane balisé, une seule WebPage, aucune seconde entité ni note", () => {
  const html = read(FICHE);
  const g = graph(html);
  const page = g.find((n) => n["@type"] === "WebPage");
  assert.equal(page.url, URL_FICHE);
  assert.deepEqual(page.about, { "@id": "https://styleetdeco.fr/#business" });
  assert.deepEqual(page.isPartOf, { "@id": "https://styleetdeco.fr/#website" });
  const bc = g.find((n) => n["@type"] === "BreadcrumbList");
  assert.deepEqual(bc.itemListElement.map((i) => i.position), [1, 2, 3]);
  assert.equal(bc.itemListElement[2].item, URL_FICHE);
  const crumbs = text(html.match(/<nav class="rx-crumbs"[\s\S]*?<\/nav>/)[0]);
  assert.match(crumbs, /Accueil Réalisations Maison de standing de 300 m²/);
  assert.ok(!g.some((n) => [].concat(n["@type"]).some((t) => /HousePainter|LocalBusiness|Organization/.test(t))));
  assert.ok(!/aggregateRating|reviewRating|"Review"|price|geo"|certif/i.test(JSON.stringify(g)));
  const image = g.find((n) => n["@type"] === "ImageObject");
  assert.equal(image.width, 1536);
  assert.equal(image.height, 1024);
});

test("photographies : 11 images, fichiers présents, dimensions explicites, alt descriptifs, une seule image prioritaire", () => {
  const html = read(FICHE);
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/rx-lightbox__img|brand__logo/.test(t));
  assert.equal(imgs.length, 11);
  for (const tag of imgs) {
    const alt = tag.match(/alt="([^"]+)"/)[1];
    assert.ok(alt.length >= 40 && alt.length <= 200, alt);
    assert.match(tag, /width="\d+" height="\d+"/);
    for (const src of tag.match(/(?:src|srcset)="([^"]+)"/g).join(" ").match(/\.\.\/\.\.\/assets\/images\/[^\s",]+\.webp/g)) {
      assert.ok(existsSync(join(SITE, "realisations", SLUG, src)), src);
    }
  }
  assert.equal(imgs.filter((t) => /fetchpriority="high"/.test(t)).length, 1, "image d'ouverture seule prioritaire");
  assert.equal(imgs.filter((t) => /loading="lazy"/.test(t)).length, 10, "les autres sont à chargement différé");
  assert.ok(imgs[0].includes("interieur-sejour-murs-blancs-baie-vitree-960.webp"), "image d'ouverture = première carte de l'accueil");
  const zooms = [...html.matchAll(/<a class="rx-zoom" href="([^"]+)" data-rx-photo>/g)].map((m) => m[1]);
  assert.equal(zooms.length, 11);
  for (const z of zooms) assert.ok(existsSync(join(SITE, "realisations", SLUG, z)), z);
  assert.equal((html.match(/<img\b[^>]*rx-lightbox__img/g) || []).length, 1);
  assert.match(html, /assets\/js\/gallery\.js\?v=[0-9a-f]{10}/);
});

test("images optimisées : WebP sans métadonnées, deux largeurs par photographie, poids maîtrisé", () => {
  const dir = join(SITE, IMG_DIR);
  const files = readdirSync(dir);
  assert.equal(files.length, 20, "10 photographies × 2 largeurs");
  for (const f of files) {
    assert.match(f, /^[a-z0-9-]+-(720|1200|960|1600)\.webp$/);
    const buf = readFileSync(join(dir, f));
    assert.equal(buf.toString("ascii", 0, 4), "RIFF");
    assert.equal(buf.toString("ascii", 8, 12), "WEBP");
    assert.ok(!buf.includes("EXIF") && !buf.includes("XMP "), `${f} : aucune métadonnée (GPS, appareil)`);
    assert.ok(statSync(join(dir, f)).size < 260 * 1024, `${f} : poids ≤ 260 Ko`);
  }
  const total = files.filter((f) => /-(1200|1600)\.webp$/.test(f)).reduce((n, f) => n + statSync(join(dir, f)).size, 0);
  assert.ok(total < 1.3 * 1024 * 1024, "grandes versions < 1,3 Mo en tout");
  const html = read(FICHE);
  const first = [...html.matchAll(/ src="\.\.\/\.\.\/assets\/images\/realisations\/peinture-interieure-maison-perpignan\/([^"]+)"/g)].map((m) => m[1]);
  const weight = first.reduce((n, f) => n + statSync(join(dir, f)).size, 0);
  assert.ok(weight < 900 * 1024, "poids des versions affichées par défaut < 900 Ko (hors image d'ouverture)");
  assert.ok(!/drive\.google\.com|googleusercontent/.test(html), "aucune image chargée depuis Google Drive");
});

test("rédaction : faits exacts, Graco Mark V, surface habitable, aucun travail d'autres corps de métier attribué", () => {
  const t = text(read(FICHE));
  for (const phrase of [
    "maison contemporaine de 300 m² habitables",
    "Les 300 m² correspondent à la surface habitable de la maison, et non à la surface des murs et plafonds traités.",
    "ratissé l'intégralité des murs et des plafonds",
    "projetés mécaniquement avec notre machine airless Graco Mark V",
    "le carreleur a posé les revêtements de sol, le menuisier et les autres intervenants ont poursuivi leurs installations",
    "protégé les sols carrelés, les dressings, les menuiseries, les portes toute hauteur en chêne",
    "primaire de fixation",
    "Toutes les peintures ont été appliquées par pulvérisation mécanisée à l'airless.",
    "peinture de teinte grège, les plafonds une peinture blanche mate",
    "enduits décoratifs Marmorino",
    "lustré les surfaces",
    "papiers peints panoramiques",
  ]) assert.ok(t.includes(phrase), phrase);
  assert.doesNotMatch(t, /Mark ?5|Mark 5/, "la machine s'écrit Graco Mark V");
  assert.doesNotMatch(t, /nous avons (posé|installé|réalisé) (le |les )?(carrelage|revêtements de sol|dressings?|cuisine|portes?|menuiseries)/i);
  assert.doesNotMatch(t, /certifi|garantie|label|\d+ ?m² de (murs|plafonds)|référence/i, "ni certification ni performance ni référence produit inventées");
  assert.doesNotMatch(t, /\b(nous sommes|style & déco est) (leader|le meilleur|number)/i);
  const main = text(read(FICHE).match(/<main>[\s\S]*<\/main>/)[0]);
  assert.ok((main.match(/Perpignan/g) || []).length <= 4, "mentions de Perpignan limitées dans le contenu de la page");
});

test("maillage : sortants (galerie, page Perpignan, devis) et entrants (accueil, galerie, Perpignan, Saint-Cyprien)", () => {
  const f = read(FICHE);
  assert.match(f, /href="\.\.\/">galerie des réalisations<\/a>/);
  assert.match(f, /href="\.\.\/\.\.\/perpignan\.html">peintre en bâtiment à Perpignan<\/a>/);
  assert.match(f, /href="\.\.\/\.\.\/#contact" data-form-mode-intent="devis"/);
  assert.match(read("index.html"), new RegExp(`href="\\./realisations/${SLUG}/">Mise en peinture complète — maison de standing à Perpignan</a>`));
  const g = read("realisations/index.html");
  assert.match(g, new RegExp(`<h2><a href="${SLUG}/">Mise en peinture complète d&#x27;une maison de standing de 300 m² à Perpignan</a></h2>`));
  assert.match(g, /href="ravalement-facade-immeuble-perpignan\/"/, "la fiche de façade est conservée");
  assert.equal((g.match(/<article class="rx-card/g) || []).length, 2);
  assert.equal((g.match(/<article class="rx-card[\s\S]*?<\/article>/g) || []).filter((c) => /fetchpriority="high"/.test(c)).length, 1, "une seule image de carte prioritaire");
  const p = read("perpignan.html");
  assert.match(p, new RegExp(`<a href="\\./realisations/${SLUG}/">ratissage mécanisé, peintures à l'airless et enduits décoratifs Marmorino</a>`));
  assert.match(p, /href="\.\/realisations\/ravalement-facade-immeuble-perpignan\/">Découvrir ce chantier de façade à Perpignan/, "chantier de façade conservé");
  const sc = read("peintre-saint-cyprien/index.html");
  assert.match(sc, new RegExp(`href="\\.\\./realisations/${SLUG}/">notre chantier de peinture intérieure réalisé à Perpignan</a>`));
  assert.doesNotMatch(read("facade-saint-cyprien/index.html"), new RegExp(SLUG), "Façades ne renvoie pas vers le chantier intérieur");
  assert.match(read("facade-saint-cyprien/index.html"), /ravalement-facade-immeuble-perpignan\//, "Façades garde son lien vers la façade");
});

test("galerie des réalisations : données structurées à jour et extensibles (grille auto-adaptative)", () => {
  const g = read("realisations/index.html");
  const list = graph(g).find((n) => [].concat(n["@type"]).includes("CollectionPage")).mainEntity.itemListElement;
  assert.deepEqual(list.map((i) => i.position), [1, 2]);
  assert.equal(list[1].url, URL_FICHE);
  const css = read("assets/css/style.css");
  assert.match(css, /\.rx-grid\{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 340px\), 1fr\)\)/);
  assert.doesNotMatch(css, /rx-card--feature/);
});

test("sitemap : nouvelle fiche listée avec ses photographies, aucune URL en double", () => {
  const sm = read("sitemap.xml");
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(locs).size, locs.length);
  const block = sm.match(new RegExp(`<url>\\s*<loc>${URL_FICHE}</loc>[\\s\\S]*?</url>`))[0];
  assert.match(block, /<lastmod>2026-10-18<\/lastmod>/);
  assert.equal((block.match(/<image:image>/g) || []).length, 11);
  for (const m of block.matchAll(/<image:loc>https:\/\/styleetdeco\.fr\/([^<]+)<\/image:loc>/g)) assert.ok(existsSync(join(SITE, m[1])), m[1]);
});

// Quatre sections ; la deuxième enchaîne les étapes techniques dans l'ordre réel du chantier.
const blocks = () => {
  const html = read(FICHE);
  const out = {};
  const grab = (re) => {
    for (const m of html.matchAll(re)) {
      const body = m[2];
      out[m[1]] = {
        html: body,
        files: [...new Set([...body.matchAll(/peinture-interieure-maison-perpignan\/([a-z0-9-]+)-(?:720|960)\.webp/g)].map((x) => x[1]))],
        caps: [...body.matchAll(/<figcaption>([^<]+)<\/figcaption>/g)].map((x) => x[1]),
        pos: m.index,
      };
    }
  };
  grab(/<article class="rx-chapter[^"]*" id="([^"]+)">([\s\S]*?)(?=<\/article>)/g);
  grab(/<div class="rx-step[^"]*" id="([^"]+)">([\s\S]*?)(?=<div class="rx-step|<\/article>)/g);
  return out;
};

test("quatre sections ; la deuxième regroupe préparation, protections et peintures dans l'ordre réel", () => {
  const html = read(FICHE);
  const b = blocks();
  const articles = [...html.matchAll(/<article class="rx-chapter[^"]*" id="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(articles, ["avant-travaux", "preparation-peinture", "marmorino", "papiers-peints"]);
  assert.equal((html.match(/<h2>/g) || []).length, 5, "quatre sections + la conclusion");
  const steps = [...html.matchAll(/<div class="rx-step[^"]*" id="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(steps, ["ratissage", "coordination", "protections", "peintures"]);
  const h = (k, tag) => b[k].html.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))[1];
  assert.equal(h("avant-travaux", "h2"), "Avant travaux : plaques de plâtre et bandes de joints");
  assert.equal(h("preparation-peinture", "h2"), "Préparation des supports et mise en peinture");
  assert.equal(h("ratissage", "h3"), "Ratissage général des murs et plafonds");
  assert.equal(h("coordination", "h3"), "Intervention des autres corps de métier");
  assert.equal(h("protections", "h3"), "Protection des ouvrages neufs");
  assert.equal(h("peintures", "h3"), "Ponçage, impression et peinture à l'airless");
  assert.equal(h("marmorino", "h2"), "Enduits décoratifs Marmorino");
  assert.equal(h("papiers-peints", "h2"), "Papiers peints panoramiques");
  assert.ok(b.ratissage.pos < b.coordination.pos && b.coordination.pos < b.protections.pos && b.protections.pos < b.peintures.pos);
});

test("correspondance photos / travaux : état initial, ratissage, coordination, peintures, Marmorino, papiers peints", () => {
  const b = blocks();
  assert.deepEqual(b["avant-travaux"].files, ["volume-avant-travaux", "murs-placo-joints-avant-travaux"], "IMG_4076 et IMG_4079");
  assert.doesNotMatch(b["avant-travaux"].caps.join(" "), /ratiss/i);
  assert.deepEqual(b.ratissage.files, ["ratissage-sejour-niche", "ratissage-sejour-volume"], "IMG_4289 et IMG_4290");
  for (const cap of b.ratissage.caps) {
    assert.match(cap, /après ratissage, avant carrelage/);
    assert.match(cap, /en cours de préparation/, "surfaces encore en préparation signalées");
    assert.doesNotMatch(cap, /peint|peinture/i, "le ratissage n'est pas présenté comme une peinture");
  }
  for (const k of ["coordination", "protections", "peintures"]) {
    assert.deepEqual(b[k].files, [], `${k} : présentation textuelle, aucune photographie`);
    assert.doesNotMatch(b[k].html, /<figure|<img/);
  }
  const row = read(FICHE).match(/<div class="rx-steps-row">[\s\S]*?<\/article>/)[0];
  assert.equal((row.match(/class="rx-step rx-step--mini/g) || []).length, 3, "trois étapes compactes sur une ligne");
  assert.ok(!/cuisine-grand-volume|finitions-murales-piece|IMG_4635|IMG_4645/.test(read(FICHE)), "ni cuisine aménagée ni pièce terminée dans les phases techniques");
  assert.deepEqual(b.marmorino.files, ["marmorino-application", "marmorino-lustrage", "marmorino-clair-resultat", "marmorino-brun-resultat"]);
  assert.match(b.marmorino.caps[0], /^Application du Marmorino/);
  assert.match(b.marmorino.caps[1], /^Lustrage du Marmorino/);
  assert.deepEqual(b["papiers-peints"].files, ["papier-peint-feuillages", "papier-peint-plumes"]);
  const html = read(FICHE);
  assert.ok(!/baie-vitree-volume|etat-initial-sejour|marmorino-application-[^"]*"\s[^>]*[\s\S]{0,0}IMG_4670/.test(html));
  const all = Object.keys(b).filter((k) => !["preparation-peinture"].includes(k)).flatMap((k) => b[k].files);
  assert.equal(new Set(all).size, all.length, "aucune photographie répétée");
});

test("aucun fichier WebP inutilisé dans le dossier de la fiche", () => {
  const html = read(FICHE);
  for (const f of readdirSync(join(SITE, IMG_DIR))) assert.ok(html.includes(f), `${f} non référencé`);
});
