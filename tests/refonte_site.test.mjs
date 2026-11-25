import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// Garde-fous du site refondu : référencement (SEO/GEO) identique à l'origine, formulaires, sécurité (CSP), avis,
// assurances, liens et images. Ces tests protègent le contenu et le fonctionnement, pas le style.
// Aucune dépendance, aucun accès réseau. Le comportement dans un navigateur est vérifié par e2e_navigateur.test.mjs.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "sitesite-template");
const read = (f) => readFileSync(path.join(SITE, f), "utf8");
const fixture = (f) => JSON.parse(readFileSync(path.join(ROOT, "tests", "fixtures", f), "utf8"));
const SEO = fixture("seo-origine.json");
const PAGES = Object.keys(SEO);
const decode = (t) => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, " ");
const squash = (t) => decode(t).replace(/\s+/g, " ").trim();
const plain = (html) => squash(html.replace(/<[^>]+>/g, " "));
const body = (html) => html.slice(html.indexOf("</head>"));

const headOf = (html) => {
  const title = squash((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
  const meta = {};
  for (const m of html.matchAll(/<meta\s+(?:name|property)="([^"]+)"\s+content="([^"]*)"/g)) meta[m[1]] = decode(m[2]);
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || "";
  const jsonld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => plain(m[1]));
  return { title, meta, canonical, jsonld, h1 };
};

test("SEO : title, métadonnées, canonique, balisage JSON-LD et H1 identiques au site d'origine, page par page", () => {
  for (const page of PAGES) {
    const now = headOf(read(page));
    const was = SEO[page];
    assert.equal(now.title, squash(was.title), `${page} : title`);
    assert.equal(now.canonical, was.canonical, `${page} : canonique`);
    for (const key of Object.keys(was.meta)) assert.equal(now.meta[key], was.meta[key], `${page} : meta ${key}`);
    assert.deepEqual(Object.keys(now.meta).filter((k) => k !== "viewport").sort(), Object.keys(was.meta).sort(), `${page} : mêmes métadonnées`);
    assert.deepEqual(now.jsonld, was.jsonld, `${page} : JSON-LD`);
    assert.deepEqual(now.h1, was.h1.map(squash), `${page} : H1`);
  }
});

test("FAQ : chaque question du balisage FAQPage est visible dans la page avec la même réponse", () => {
  for (const page of PAGES) {
    const html = read(page);
    const questions = [];
    const walk = (n) => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === "object") {
        if (n["@type"] === "Question") questions.push(n);
        Object.values(n).forEach(walk);
      }
    };
    walk(headOf(html).jsonld);
    if (!questions.length) continue;
    const visible = plain(body(html));
    for (const q of questions) {
      assert.ok(visible.includes(squash(q.name)), `${page} : question absente ${q.name}`);
      const answer = squash(q.acceptedAnswer.text.replace(/<[^>]+>/g, " "));
      assert.ok(visible.includes(answer), `${page} : réponse absente pour « ${q.name} »`);
    }
  }
});

test("accueil : les neuf questions de la FAQ d'origine sont présentes et les services conservent leurs liens internes", () => {
  const home = read("index.html");
  assert.equal([...home.matchAll(/<details\b/g)].length, 9);
  for (const href of ["/peintre-saint-cyprien/", "/perpignan.html", "/facade-saint-cyprien/", "/realisations/"]) {
    assert.ok(home.includes(`href="${href}"`), `lien interne ${href}`);
  }
  const text = plain(body(home));
  for (const h of ["Nos dernières réalisations dans les Pyrénées-Orientales", "Avis clients publiés sur Google", "Demander un devis"]) {
    assert.ok(text.includes(h), `titre d'origine : ${h}`);
  }
});

test("sécurité : aucune ressource externe ni script incorporé (la politique CSP du site n'autorise que 'self')", () => {
  for (const page of [...PAGES, "merci.html", "merci-rappel.html", "lead-rate-limited.html"]) {
    const html = read(page);
    assert.doesNotMatch(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ""), /<script(?![^>]*\bsrc=)[^>]*>/, `${page} : script incorporé`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=\s*"/i, `${page} : gestionnaire d'événement incorporé`);
    for (const m of html.matchAll(/<(?:link|script|img|iframe|source)\b[^>]*\b(?:src|href|srcset)="(https?:)?\/\/[^"]*"/g)) {
      if (/rel="canonical"/.test(m[0])) continue;
      assert.fail(`${page} : ressource externe ${m[0].slice(0, 100)}`);
    }
    assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/, `${page} : polices Google`);
  }
  const css = read("assets/css/style.css");
  assert.doesNotMatch(css, /url\(\s*["']?https?:/, "CSS : aucune ressource externe");
  assert.doesNotMatch(css, /@import/, "CSS : aucun @import");
  for (const f of ["plus-jakarta-sans-latin.woff2", "plus-jakarta-sans-latin-ext.woff2"]) assert.ok(existsSync(path.join(SITE, "assets/fonts", f)), f);
  const headers = read("_headers");
  assert.match(headers, /Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'/);
});

test("JavaScript : app.js, lead-form.js et business-hours.js sont du code valide", () => {
  for (const f of ["app.js", "lead-form.js", "business-hours.js", "merci.js"]) new vm.Script(read(`assets/js/${f}`), { filename: f });
});

const FORMS_SERVEUR = new Set([...readFileSync(path.join(ROOT, "netlify/functions/lead.mjs"), "utf8").match(/const ORIGIN_LABELS = \{([\s\S]*?)\};/)[1].matchAll(/^\s*(lead_[a-z_]+):/gm)].map((m) => m[1]));

test("formulaires : chaque formulaire envoie à la fonction « lead » avec un nom connu du serveur, un champ piège et les champs attendus", () => {
  let total = 0;
  for (const page of PAGES) {
    const html = read(page);
    for (const m of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)) {
      total += 1;
      const form = m[0];
      const name = (form.match(/<form[^>]*\bname="([^"]+)"/) || [])[1];
      assert.ok(FORMS_SERVEUR.has(name), `${page} : formulaire inconnu du serveur ${name}`);
      assert.match(form, /method="POST" action="\/\.netlify\/functions\/lead"/, page);
      assert.match(form, /class="js-lead-form"/, page);
      assert.match(form, new RegExp(`<input type="hidden" name="form-name" value="${name}">`), page);
      assert.match(form, /<input type="hidden" name="lead_priority" value="(RAPPEL_30_MIN|STANDARD)">/, page);
      assert.match(form, /<p class="hp-field" aria-hidden="true"><label>[^<]*<input name="bot-field" tabindex="-1" autocomplete="off"><\/label><\/p>/, page);
      assert.match(form, /name="name"[^>]*required/, page);
      assert.match(form, /name="phone"[^>]*required/, page);
      if (/data-fixed-mode="callback"/.test(form)) assert.match(form, /name="lead_priority" value="RAPPEL_30_MIN"/, `${page} : un formulaire de rappel reste en rappel`);
    }
    if (/<form\b/.test(html)) {
      const order = [...html.matchAll(/<script src="[^"]*assets\/js\/([a-z-]+)\.js\?v=[0-9a-f]{10}"/g)].map((m) => m[1]);
      assert.deepEqual(order, ["lead-form", "business-hours", "app"], `${page} : scripts dans l'ordre`);
    }
  }
  assert.ok(total >= 20, `formulaires trouvés : ${total}`);
});

test("formulaire de contact : onglets rappel/devis et champs réservés au devis (mêmes hooks que le formulaire d'origine)", () => {
  const home = read("index.html");
  const form = home.match(/<form[^>]*name="lead_contact"[\s\S]*?<\/form>/)[0];
  for (const hook of ["js-name-label", "js-email-field", "js-email-label", "js-devis-required", "js-devis-only", "js-form-status", "js-form-submit"]) assert.ok(form.includes(hook), hook);
  assert.match(form, /name="email"[^>]*type="email"|type="email"[^>]*name="email"/);
  assert.match(form, /<textarea[^>]*name="details"/);
  assert.match(home, /class="onglets"/);
  assert.ok(FORMS_SERVEUR.has("lead_hero") && FORMS_SERVEUR.has("lead_contact"));
});

test("avis Google : note et nombre pilotés par google-reviews.json, aucune note balisée, chaque extrait est une citation exacte", () => {
  const cfg = fixture("../../scripts/google-reviews.json");
  const full = fixture("avis-complets.json").map((t) => t.replace(/\s+/g, " "));
  const norm = (s) => s.replace(/[«»]/g, "").replace(/’/g, "'").replace(/\s+/g, " ").trim().replace(/\.$/, "");
  for (const page of ["index.html", "peintre-saint-cyprien/index.html", "facade-saint-cyprien/index.html", "perpignan.html"]) {
    const html = read(page);
    assert.match(html, /<span data-google-rating>4,9<\/span>/, page);
    assert.match(html, new RegExp(`<span data-google-count>${cfg.count}</span>`), page);
    assert.doesNotMatch(html, /aggregateRating|"ratingValue"|"reviewCount"/, `${page} : note balisée`);
    for (const m of html.matchAll(/<blockquote class="carte-avis"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/g)) {
      const quote = norm(plain(m[1]));
      assert.ok(full.some((f) => norm(f).replace(/’/g, "'").includes(quote.replace(/ \.\.\.$/, ""))), `${page} : extrait introuvable dans les avis d'origine : ${quote.slice(0, 60)}`);
    }
    for (const m of html.matchAll(/<a[^>]*href="https:\/\/www\.google\.com\/[^"]*"[^>]*>/g)) assert.match(m[0], /rel="noopener noreferrer"/, `${page} : lien Google sûr`);
  }
  assert.ok(!/aggregateRating/.test(JSON.stringify(SEO)));
});

test("assurances : « décennale » sans durée, une seule attestation, aucune garantie inventée", () => {
  for (const page of PAGES) {
    const text = plain(body(read(page)));
    assert.doesNotMatch(text, /décennale[^.]{0,40}\b(?:10|dix)\s*ans|\b(?:10|dix)\s*ans[^.]{0,40}décennale/i, `${page} : durée de la décennale`);
    assert.doesNotMatch(text, /biennale|n° ?de contrat|numéro de contrat|police n/i, `${page} : mention non souhaitée`);
  }
  const home = read("index.html");
  assert.match(home, /id="assurances"/);
  assert.match(plain(home), /Notre attestation d'assurance est remise sur demande, avec votre devis\./);
  assert.equal([...home.matchAll(/class="feuille feuille--rc"/g)].length, 1, "un seul document d'attestation");
});

test("identité : nom commercial, 104 chantiers, horaires lundi-vendredi 8 h-18 h, téléphone et e-mail visibles", () => {
  const home = read("index.html");
  const text = plain(body(home));
  assert.match(text, /104 chantiers réalisés/);
  assert.doesNotMatch(text, /plus de 104|\b(?:100|120) chantiers/);
  assert.match(text, /Du lundi au vendredi, de 8 h à 18 h/);
  assert.ok(home.includes("tel:+33650756242") && home.includes("mailto:style.deco66@gmail.com"));
  for (const page of PAGES) {
    assert.match(read(page), /<meta property="og:site_name" content="Style &amp; Déco" \/>|<title>[^<]*Style &amp; Déco<\/title>/, page);
    assert.doesNotMatch(body(read(page)).replace(/<input type="hidden" name="subject"[^>]*>/g, "").replace(/EI Style et Deco/g, ""), /Style (?:et|&amp;) Deco\b/, `${page} : ancienne graphie`);
  }
});

const INTERNES = (html) => [...html.matchAll(/(?:href|src|data-src)="(\/[^"#?]*|\.{1,2}\/[^"#?]*)(?:[#?][^"]*)?"/g)].map((m) => m[1]);

test("liens et images : chaque adresse interne existe, chaque image a ses dimensions et un texte alternatif (vide seulement si décorative)", () => {
  for (const page of [...PAGES, "merci.html", "merci-rappel.html", "lead-rate-limited.html"]) {
    const html = read(page);
    const dir = path.dirname(page);
    for (const url of INTERNES(html)) {
      let target = url.startsWith("/") ? path.join(SITE, url) : path.join(SITE, dir, url);
      if (url.endsWith("/")) target = path.join(target, "index.html");
      if (!path.extname(target)) continue;
      assert.ok(existsSync(target), `${page} : lien cassé ${url}`);
    }
    for (const m of html.matchAll(/<img\b[^>]*>/g)) {
      const tag = m[0];
      assert.match(tag, /\bwidth="\d+"/, `${page} : largeur ${tag.slice(0, 80)}`);
      assert.match(tag, /\bheight="\d+"/, `${page} : hauteur ${tag.slice(0, 80)}`);
      assert.match(tag, /\balt="/, `${page} : alt ${tag.slice(0, 80)}`);
    }
  }
});

test("ancres : les liens #… d'une page mènent à un identifiant existant (et les ancres d'origine sont conservées)", () => {
  for (const page of PAGES) {
    const html = read(page);
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    for (const m of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(m[1]), `${page} : ancre #${m[1]} sans cible`);
  }
  const home = new Set([...read("index.html").matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const id of ["avis", "contact", "contact-details", "faq", "realisations", "services", "assurances"]) assert.ok(home.has(id), `accueil : #${id}`);
  assert.ok(read("peintre-saint-cyprien/index.html").includes('id="faq-local"'));
  assert.ok(read("facade-saint-cyprien/index.html").includes('id="faq-local"'));
  assert.ok(read("perpignan.html").includes('id="faq-perpignan"'));
});

test("navigation : mêmes entrées sur toutes les pages, menu mobile affiché sous 1000 px", () => {
  const labels = ["Services", "Réalisations", "Saint-Cyprien", "Perpignan", "Façades", "FAQ", "Contact"];
  for (const page of PAGES) {
    const html = read(page);
    const nav = html.match(/<nav class="nav-principale"[\s\S]*?<\/nav>/)[0];
    assert.deepEqual([...nav.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]), labels, page);
    const mobile = html.match(/<nav class="menu-mobile[\s\S]*?<\/nav>/)[0];
    assert.deepEqual([...mobile.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]), labels, `${page} : menu mobile`);
    assert.match(html, /<footer class="pied">/, `${page} : pied de page`);
    assert.ok(html.includes("/legal/mentions-legales.html") && html.includes("/legal/politique-confidentialite.html"), `${page} : liens légaux`);
  }
  const css = read("assets/css/style.css");
  const base = css.indexOf(".burger{display:none");
  const mobile = css.indexOf(".burger{display:grid}", base);
  assert.ok(base > 0 && mobile > base, "le bouton du menu mobile doit être réaffiché APRÈS sa règle de base (sinon il reste invisible sur téléphone)");
  assert.match(css, /\.carte\{position:relative;max-width:560px\}/, "la carte reste ancrée sur mobile");
});

test("pages de confirmation : contenu et suivi conservés", () => {
  assert.match(read("merci.html"), /Votre demande de devis a bien été reçue\./);
  assert.match(read("merci-rappel.html"), /data-slot="sentence"/);
  assert.match(read("merci-rappel.html"), /merci\.js/);
  assert.match(read("lead-rate-limited.html"), /role="alert"/);
  for (const f of ["merci.html", "merci-rappel.html", "lead-rate-limited.html"]) assert.match(read(f), /<meta name="robots" content="noindex/);
});

test("sitemap : toutes les pages publiques et toutes les images listées existent", () => {
  const xml = read("sitemap.xml");
  for (const m of xml.matchAll(/<loc>https:\/\/styleetdeco\.fr([^<]*)<\/loc>/g)) {
    const url = m[1];
    const target = path.join(SITE, url === "/" ? "index.html" : url.endsWith("/") ? path.join(url, "index.html") : url);
    assert.ok(existsSync(target), `sitemap : ${url}`);
  }
});

test("textes : chaque paragraphe, titre ou question du site d'origine est toujours présent, sauf les micro-textes d'interface remplacés (liste explicite)", () => {
  const origine = fixture("textes-origine.json");
  const remplaces = fixture("textes-remplaces.json");
  const visible = (page) => plain(body(read(page)).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, " ")).replace(/\s+([,.;:!?])/g, "$1");
  for (const [page, paragraphs] of Object.entries(origine)) {
    const text = visible(page);
    const permis = new Set(remplaces[page] || []);
    const manquants = paragraphs.filter((p) => !text.includes(p) && !permis.has(p));
    assert.deepEqual(manquants, [], `${page} : texte d'origine disparu`);
  }
});

test("avis : l'invitation à laisser un avis Google est présente sur les pages avec mur d'avis, avec un lien sûr vers la fiche", () => {
  for (const page of ["index.html", "peintre-saint-cyprien/index.html", "facade-saint-cyprien/index.html", "perpignan.html", "realisations/index.html"]) {
    const html = read(page);
    assert.match(html, /Vous avez fait appel à nous \?/, page);
    assert.match(html, /<a class="laisser-avis__lien" href="https:\/\/www\.google\.com\/[^"]+" target="_blank" rel="noopener noreferrer">/, page);
  }
});

test("photos : la hauteur affichée n'est jamais fixée par les attributs width/height (cadrages de la maquette conservés)", () => {
  assert.match(read("assets/css/style.css"), /(^|\n)img\{height:auto\}/);
});

test("titres : le complément après un tiret passe sur une seconde ligne sans tiret visible, le texte du titre reste identique", () => {
  const css = read("assets/css/style.css");
  assert.match(css, /\.h-tiret\{display:none\}/);
  assert.match(css, /\.h-suite\{display:block/);
  const home = read("index.html");
  assert.match(home, /<span class="h-suite"><span class="h-tiret" aria-hidden="true">— <\/span>un artisan local à votre service<\/span>/);
  assert.ok(plain(home).includes("Saint-Cyprien — un artisan local à votre service"));
});

test("boutons d'avis : tous les boutons Google (laisser un avis, voir sur Google, vérifier) ont l'effet de remplissage orange", () => {
  const css = read("assets/css/style.css");
  assert.match(css, /\.laisser-avis__lien:hover \.laisser-avis__btn/);
  assert.match(css, /\.verifier,\.avis-heros__lien\{[^}]*background:linear-gradient/);
  assert.match(css, /\.verifier:hover[^{]*\{background-size:51% 100%/);
});
