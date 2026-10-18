// Lot 4 : réassurance (assurances, avis Google), réalisations réelles mieux exploitées, engagement, rappel en un clic.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { loadConfig, run as syncReviews } from "../scripts/google-reviews.mjs";

const SITE = fileURLToPath(new URL("../sitesite-template", import.meta.url));
const read = (p) => readFileSync(join(SITE, p), "utf8");
const visible = (html) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;|&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

const HOME = "index.html";
const PERPIGNAN = "perpignan.html";
const SAINT_CYPRIEN = "peintre-saint-cyprien/index.html";
const FACADES = "facade-saint-cyprien/index.html";
const FICHE = "realisations/ravalement-facade-immeuble-perpignan/index.html";
const PAGES = [HOME, PERPIGNAN, SAINT_CYPRIEN, FACADES, FICHE];
const INSURANCE = "Assurés en responsabilité civile professionnelle et en décennale, pour les activités déclarées à nos contrats. Attestations sur demande.";
const GOOGLE = "https://www.google.com/maps?cid=3698755901832647189";

test("assurances : mention sobre près des actions de contact sur les cinq pages prévues", () => {
  for (const file of PAGES) {
    const html = read(file);
    assert.equal((html.match(/<p class="trustNote">Assurés en responsabilité civile professionnelle et en décennale/g) || []).length, 1, `${file} : une seule mention`);
    assert.ok(visible(html).includes(INSURANCE), file);
  }
});

test("assurances : aucune garantie inventée, pas de numéro de contrat, décennale jamais présentée comme universelle", () => {
  for (const file of [...PAGES, "realisations/index.html"]) {
    const t = visible(read(file));
    assert.doesNotMatch(t, /tous (nos|les) travaux (de peinture )?(sont )?(couverts|garantis)|couvr\w+ (automatiquement )?tous/i, file);
    assert.doesNotMatch(t, /garantie (décennale|de 10 ans|décennale de 10 ans)|10 ans/i, `${file} : pas de promesse de garantie décennale chiffrée`);
    assert.doesNotMatch(t, /(contrat|police) n[°o]|n[°o] de (contrat|police)|attestation n[°o]/i, `${file} : aucun numéro de contrat`);
    assert.doesNotMatch(t, /\b(AXA|MAAF|MMA|Allianz|Groupama|SMABTP|Generali|Hiscox)\b/, `${file} : aucun assureur nommé`);
  }
  const faq = read(PERPIGNAN);
  assert.equal((faq.match(/Nous sommes assurés en responsabilité civile professionnelle et en décennale, pour les activités déclarées à nos contrats\. Les attestations d'assurance sont remises sur demande\./g) || []).length, 2, "FAQ visible et données structurées identiques");
  assert.doesNotMatch(faq, /L'entreprise est assurée/);
});

test("avis Google : ligne discrète sur l'accueil (mobile), Perpignan, Saint-Cyprien et Façades, vers la fiche officielle", () => {
  const cfg = loadConfig();
  assert.equal(cfg.url, GOOGLE);
  for (const file of [HOME, PERPIGNAN, SAINT_CYPRIEN, FACADES]) {
    const html = read(file);
    const m = html.match(/<p class="trustNote[^"]*"><a href="([^"]+)" target="_blank" rel="noopener noreferrer"><strong><span data-google-rating>([^<]+)<\/span>\/5 sur Google<\/strong> · <span data-google-count>(\d+)<\/span> avis clients/);
    assert.ok(m, `${file} : ligne de note Google`);
    assert.equal(m[1], GOOGLE, file);
    assert.equal(m[2], cfg.rating, file);
    assert.equal(Number(m[3]), cfg.count, file);
  }
  assert.doesNotMatch(read(FICHE), /data-google-/, "la fiche chantier ne porte que l'assurance");
});

test("avis Google : valeurs uniques, centralisées et à jour (méthode d'actualisation)", () => {
  const cfg = loadConfig();
  assert.deepEqual(syncReviews({ check: true }), [], "node scripts/google-reviews.mjs --check doit passer");
  assert.equal(cfg.rating, "4,9");
  assert.equal(cfg.ratingValue, 4.9);
  assert.equal(cfg.count, 16);
  for (const file of [...PAGES, "realisations/index.html"]) {
    const t = visible(read(file));
    for (const m of t.matchAll(/(\d+) avis/g)) assert.equal(Number(m[1]), cfg.count, `${file} : « ${m[0]} »`);
    for (const m of t.matchAll(/(\d,\d)\s*\/\s*5/g)) assert.equal(m[1], cfg.rating, `${file} : « ${m[0]} »`);
  }
  assert.ok(existsSync(join(SITE, "..", "docs", "google-reviews.md")));
});

test("avis Google : aucune note balisée, aucun avis recopié sur les pages locales, liens Google sûrs", () => {
  for (const file of PAGES) {
    const html = read(file);
    assert.doesNotMatch(html, /aggregateRating|ratingValue|reviewCount|"Review"/, `${file} : pas de balisage de note`);
    for (const m of html.matchAll(/<a [^>]*href="https:\/\/www\.google\.com\/maps[^"]*"[^>]*>/g)) {
      assert.match(m[0], /target="_blank"/);
      assert.match(m[0], /rel="noopener noreferrer"/, `${file} : ${m[0]}`);
      assert.ok(m[0].includes(GOOGLE), file);
    }
  }
  for (const file of [PERPIGNAN, SAINT_CYPRIEN, FACADES]) assert.doesNotMatch(read(file), /Despinoy|class="reviewsWrap"|reviewsCarousel/, `${file} : pas de témoignage recopié`);
  assert.match(read("assets/css/style.css"), /\.sr-only\{/);
});

test("Façades : deux photos authentiques du chantier de Perpignan, légendées avec le lieu réel et reliées à la fiche", () => {
  const html = read(FACADES);
  const block = html.match(/<div class="local-example-photos">[\s\S]*?<\/div>\s*<p class="local-example">[\s\S]*?<\/p>/)[0];
  const imgs = [...block.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(imgs.length, 2);
  for (const img of imgs) {
    const src = img.match(/src="\.\.\/assets\/images\/realisations\/ravalement-facade-perpignan\/([^"]+)"/)[1];
    assert.ok(existsSync(join(SITE, "assets/images/realisations/ravalement-facade-perpignan", src)), src);
    const alt = img.match(/alt="([^"]+)"/)[1];
    assert.match(alt, /Perpignan/);
    assert.doesNotMatch(alt, /Saint-Cyprien/);
    assert.match(img, /width="\d+" height="\d+"/);
  }
  const captions = [...block.matchAll(/<figcaption>([^<]+)<\/figcaption>/g)].map((m) => m[1]);
  assert.equal(captions.length, 2);
  for (const c of captions) assert.match(c, /Chantier réalisé à Perpignan \(66\)/);
  assert.match(block, /<a href="\.\.\/realisations\/ravalement-facade-immeuble-perpignan\/">Découvrir notre chantier de façade réalisé à Perpignan<\/a>/);
  assert.match(block, /Découvrez notre savoir-faire à travers un chantier de ravalement de façade réalisé à Perpignan, dans les Pyrénées-Orientales/);
  assert.doesNotMatch(block, /et non à|pas à Saint-Cyprien/, "formulation positive");
  assert.doesNotMatch(block.replace(/<img[^>]*>/g, ""), /Saint-Cyprien/, "aucune mention laissant croire à un chantier local");
  assert.ok(existsSync(join(SITE, "realisations/ravalement-facade-immeuble-perpignan/index.html")));
});

test("accueil : « Derniers chantiers » annonce de vraies réalisations ; seule la carte de façade renvoie vers sa fiche", () => {
  const html = read(HOME);
  const section = html.match(/<section class="section" id="realisations"[\s\S]*?<\/section>/)[0];
  assert.match(section, /<h2>Nos dernières réalisations dans les Pyrénées-Orientales<\/h2>/);
  assert.doesNotMatch(section, /à Saint-Cyprien et environs/);
  assert.match(section, /<p>Chantiers réels réalisés par Style &amp; Déco : surfaces propres, lignes nettes, finitions contrôlées\.<\/p>/);
  assert.doesNotMatch(section, /rendu attendu|aperçu/i);
  const cards = section.match(/<article class="shot[\s\S]*?<\/article>/g);
  assert.equal(cards.length, 4, "toujours les quatre chantiers existants");
  const linked = cards.filter((c) => /href="[^"]*realisations\//.test(c));
  assert.equal(linked.length, 1, "un seul lien : aucune autre carte n'est reliée à une fiche");
  // Correspondance vérifiée : la photo de la carte montre l'immeuble de la fiche (même point de vue que la photo « avant », mêmes hublots, mêmes balcons et bâtiment voisin).
  assert.match(linked[0], /facade-immeuble-balcons-enduit-creme-bande-grise/);
  assert.match(linked[0], /<a class="shot__link" href="\.\/realisations\/ravalement-facade-immeuble-perpignan\/">Mise en peinture de façade — immeuble à Perpignan<\/a>/);
  assert.ok(existsSync(join(SITE, "realisations/ravalement-facade-immeuble-perpignan/index.html")));
});

test("Saint-Cyprien : chantier existant conservé, légende factuelle, aucun résultat ni photographie ajoutés", () => {
  const html = read(SAINT_CYPRIEN);
  assert.equal((html.match(/class="local-photo"/g) || []).length, 1);
  assert.match(html, /src="\.\.\/assets\/images\/chantier-st-cyprien\.webp"/);
  assert.match(html, /<p class="local-photo-caption">Chantier à Saint-Cyprien : état du support pendant la préparation, avant l'application des finitions\.<\/p>/);
  assert.match(html, /<a href="\.\.\/realisations\/ravalement-facade-immeuble-perpignan\/">notre ravalement de façade réalisé à Perpignan<\/a>/);
  assert.match(html, /Cas réel traité en secteur Saint-Cyprien/);
});

test("accueil : la citation signée devient un engagement de l'entreprise, au pluriel, sans faux témoignage", () => {
  const html = read(HOME);
  assert.doesNotMatch(html, /On reconnaît un travail sérieux/);
  const m = html.match(/<div class="quote quote--engagement">\s*<p><strong>Notre engagement :<\/strong> ([^<]+)<\/p>\s*<\/div>/);
  assert.ok(m);
  assert.equal(m[1], "une préparation minutieuse, un chantier protégé et des finitions soignées.");
  const block = html.match(/<div class="quote quote--engagement">[\s\S]*?<\/div>/)[0];
  assert.doesNotMatch(block, /<span>/, "pas de signature");
  assert.doesNotMatch(visible(block), /—|["«»]/, "ni signature ni guillemets");
});

test("barre mobile : conservée (une seule, sur l'accueil), zone de sécurité iPhone gardée, marge de défilement sous la barre", () => {
  assert.equal((read(HOME).match(/<nav class="mobileQuickBar"/g) || []).length, 1);
  for (const file of [PERPIGNAN, SAINT_CYPRIEN, FACADES, FICHE]) assert.doesNotMatch(read(file), /mobileQuickBar/, file);
  const css = read("assets/css/style.css");
  assert.match(css, /padding: 10px 12px calc\(10px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /html\{ scroll-padding-top: 118px; scroll-padding-bottom: 92px; \}/);
});

test("petits écrans : formulaire de rappel compacté (320 × 568) et barre fixe effacée pendant la saisie", () => {
  const css = read("assets/css/style.css");
  const short = css.match(/@media \(max-width: 720px\) and \(max-height: 600px\)\{([\s\S]*?)\n\}/)[1];
  assert.match(short, /\.form--callback-mode \.js-callback-badge\{ display: none; \}/);
  assert.match(short, /\.form--callback-mode \.form__grid\{ gap: 8px; \}/);
  assert.doesNotMatch(short, /display: none[^}]*(name|phone|email|submit)/, "aucun champ ni bouton masqué");
  assert.match(css, /\.mobileQuickBar\.is-away\{[\s\S]*?visibility: hidden;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\{\s*\.mobileQuickBar, \.mobileQuickBar\.is-away\{ transition: none; \}/);
  const app = read("assets/js/app.js");
  assert.match(app, /const initQuickBarAwayWhileTyping = \(\) =>/);
  assert.match(app, /quickBar\.classList\.add\("is-away"\)/);
  assert.match(app, /quickBar\.classList\.remove\("is-away"\)/);
  assert.ok(app.includes("initQuickBarAwayWhileTyping();"), "initialisé au chargement");
});

// Contraste WCAG des lignes de réassurance (texte --muted sur le fond le plus clair possible de la page).
const lum = ([r, g, b]) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const blend = (alpha, fg, bg) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));
test("contraste : lignes de réassurance et légendes ≥ 4,5:1 sur le fond sombre", () => {
  const bg = [0x0b, 0x0d, 0x10];
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const panel = blend(0.12, [255, 255, 255], bg);
  for (const [name, alpha] of [["trustNote (--muted .64)", 0.64], ["légendes Façades (.72)", 0.72]]) {
    assert.ok(ratio(blend(alpha, [255, 255, 255], panel), panel) >= 4.5, name);
  }
  assert.match(read("assets/css/style.css"), /--muted: rgba\(255,255,255,\.64\)/);
});
