// Lot 3B : rubrique Réalisations (galerie + première fiche de chantier).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const SITE = fileURLToPath(new URL("../sitesite-template", import.meta.url));
const read = (p) => readFileSync(join(SITE, p), "utf8");
const FICHE = "realisations/ravalement-facade-immeuble-perpignan/index.html";
const GAL = "realisations/index.html";
const ORIGIN = "https://styleetdeco.fr";
const graph = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ");

test("fiche : title, description, H1 et canonique conformes au cahier des charges", () => {
  const html = read(FICHE);
  assert.match(html, /<title>Ravalement de façade d&#x27;un immeuble à Perpignan \| Style &amp; Déco<\/title>/);
  assert.match(html, /content="Découvrez notre chantier de ravalement de façade à Perpignan : nettoyage, réparation des balcons, traitement des armatures et peinture D2\."/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<h1>Ravalement de façade d&#x27;un immeuble à Perpignan \(66\)<\/h1>/);
  assert.match(html, /rel="canonical" href="https:\/\/styleetdeco\.fr\/realisations\/ravalement-facade-immeuble-perpignan\/"/);
});

test("fiche : le texte professionnel validé est repris sans altération des informations techniques", () => {
  const t = text(read(FICHE));
  for (const phrase of [
    "Style & Déco a réalisé la rénovation des façades d'un immeuble résidentiel situé à Perpignan, dans les Pyrénées-Orientales.",
    "Ce chantier nécessitait une remise en état approfondie de plusieurs supports présentant des fissures et des dégradations, particulièrement au niveau des balcons.",
    "Après l'installation d'un échafaudage par une entreprise spécialisée, nous avons réalisé un nettoyage à haute pression, suivi d'un traitement anti-mousse pour préparer les façades aux travaux de rénovation.",
    "comprenant notamment la préparation des armatures métalliques par grattage et brossage, puis l'application d'un traitement passivant anticorrosion.",
    "Les conditions venteuses ont également nécessité une organisation rigoureuse des protections au sol, installées chaque matin et retirées en fin de journée.",
    "nous avons appliqué un primaire fixateur, suivi de deux couches de peinture de façade de classe D2, afin d'obtenir une finition homogène et soignée.",
    "Cette réalisation illustre notre savoir-faire en ravalement de façade à Perpignan, depuis le traitement des dégradations jusqu'aux travaux de peinture extérieure, avec une attention constante portée à la préparation des supports et à la qualité des finitions.",
  ]) assert.ok(t.includes(phrase), phrase.slice(0, 60));
});

test("données structurées : entité #business réutilisée, fil d'Ariane identique au visible, rien d'inventé", () => {
  for (const [file, depth] of [[FICHE, 3], [GAL, 2]]) {
    const html = read(file);
    const g = graph(html);
    const page = g.find((n) => [].concat(n["@type"]).includes("WebPage"));
    assert.deepEqual(page.about, { "@id": `${ORIGIN}/#business` });
    assert.deepEqual(page.isPartOf, { "@id": `${ORIGIN}/#website` });
    assert.ok(!g.some((n) => [].concat(n["@type"]).some((t) => /HousePainter|LocalBusiness|Organization/.test(t))), "pas de seconde entreprise");
    const bc = g.find((n) => n["@type"] === "BreadcrumbList");
    assert.equal(bc.itemListElement.length, depth);
    const visible = text(html.match(/<nav class="rx-crumbs"[\s\S]*?<\/nav>/)[0]);
    for (const item of bc.itemListElement.slice(0, -1)) assert.ok(visible.includes(item.name.replace(/&/g, "&")), item.name);
    assert.ok(!/aggregateRating|reviewRating|review"|certif|price|geo"/i.test(JSON.stringify(g)));
  }
  const img = graph(read(FICHE)).find((n) => n["@type"] === "ImageObject");
  assert.ok(existsSync(join(SITE, img.url.replace(ORIGIN, ""))));
});

test("photographies : alt descriptifs, dimensions, une seule image prioritaire, pas de coordonnées ni de plaques évoquées", () => {
  for (const file of [FICHE, GAL]) {
    const html = read(file);
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/brand__logo|rx-lightbox__img/.test(t));
    assert.ok(imgs.length >= 1);
    for (const tag of imgs) {
      const alt = tag.match(/alt="([^"]+)"/)[1];
      assert.ok(alt.length >= 30 && alt.length <= 200, alt);
      assert.match(tag, /width="\d+" height="\d+"/);
    }
    assert.equal(imgs.filter((t) => /fetchpriority="high"/.test(t)).length, 1);
  }
  assert.equal((read(FICHE).match(/<img\b[^>]*rx-lightbox__img/g) || []).length, 1);
});

test("fiche : 8 photographies, liens d'agrandissement valides, aucune légende présentant une étape intermédiaire comme résultat", () => {
  const html = read(FICHE);
  const zooms = [...html.matchAll(/<a class="rx-zoom" href="([^"]+)" data-rx-photo>/g)].map((m) => m[1]);
  assert.equal(zooms.length, 8);
  for (const z of zooms) assert.ok(existsSync(join(SITE, "realisations/ravalement-facade-immeuble-perpignan", z)), z);
  assert.match(html, /étape intermédiaire du chantier/);
  assert.ok(!/avant\/après|comparateur/i.test(html));
});

test("liens internes : galerie, service Façades, devis et accueil -> galerie", () => {
  const f = read(FICHE);
  assert.match(f, /href="\.\.\/">galerie des réalisations<\/a>/);
  assert.match(f, /href="\.\.\/\.\.\/facade-saint-cyprien\/">service de ravalement de façade<\/a>/);
  assert.match(f, /href="\.\.\/\.\.\/#contact" data-form-mode-intent="devis"/);
  const g = read(GAL);
  assert.match(g, /href="ravalement-facade-immeuble-perpignan\/"/);
  assert.match(read("index.html"), /href="\.\/realisations\/">Voir toutes nos réalisations<\/a>/);
  assert.ok(read("index.html").includes("interieur-sejour-murs-blancs-baie-vitree-960.webp"), "galerie d'accueil conservée");
});

test("sitemap et redirections : pages publiées listées, plus de règle morte ni de boucle", () => {
  const sm = read("sitemap.xml");
  assert.ok(sm.includes(`<loc>${ORIGIN}/realisations/</loc>`));
  assert.ok(sm.includes(`<loc>${ORIGIN}/realisations/ravalement-facade-immeuble-perpignan/</loc>`));
  const redirects = read("_redirects").split("\n");
  assert.ok(!redirects.some((l) => /^\/realisations\/\*/.test(l)), "règle joker supprimée");
  assert.ok(redirects.includes("/realisations /realisations/ 301"));
  assert.ok(!redirects.some((l) => /^\/realisations\/ /.test(l)), "aucune redirection depuis la page elle-même");
});

test("visionneuse : dialog natif, boutons étiquetés, script versionné", () => {
  const html = read(FICHE);
  assert.match(html, /<dialog class="rx-lightbox"/);
  for (const attr of ["data-rx-prev", "data-rx-next", "data-rx-close"]) assert.ok(html.includes(attr));
  assert.match(html, /assets\/js\/gallery\.js\?v=[0-9a-f]{10}/);
  assert.ok(existsSync(join(SITE, "assets/js/gallery.js")));
});
