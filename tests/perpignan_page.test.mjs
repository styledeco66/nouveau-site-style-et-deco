// Refonte graphique de /perpignan.html : SEO conservé, illustration d'ambiance signalée, secteurs en HTML.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const SITE = fileURLToPath(new URL("../sitesite-template", import.meta.url));
const html = readFileSync(join(SITE, "perpignan.html"), "utf8");
const plain = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("SEO conservé : titre, canonique, un H1 court, données structurées inchangées", () => {
  assert.match(html, /<title>Artisan Peintre en Bâtiment à Perpignan \(66000\) \| Style &amp; Déco<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/styleetdeco\.fr\/perpignan\.html"/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<h1>Artisan peintre à Perpignan<\/h1>/);
  assert.equal((html.match(/application\/ld\+json/g) || []).length, 2);
  assert.ok(html.includes('"@id": "https://styleetdeco.fr/perpignan.html#webpage"'));
});

test("illustration d'ambiance : jamais présentée comme un chantier, WebP sans métadonnées, dimensions renseignées", () => {
  assert.match(html, /Illustration d'ambiance, non issue d'un chantier réalisé\./);
  const tag = html.match(/<img src="\.\/assets\/images\/ambiance-salon-contemporain-960\.webp"[\s\S]*?\/>/)[0];
  assert.match(tag, /alt="Illustration d'un intérieur contemporain/);
  assert.match(tag, /width="1151" height="863"/);
  for (const f of ["640", "960", "1151", "large-1151"]) assert.ok(existsSync(join(SITE, `assets/images/ambiance-salon-contemporain-${f}.webp`)));
  assert.ok(!readFileSync(join(SITE, "realisations/index.html"), "utf8").includes("ambiance-salon"), "absente de la galerie Réalisations");
});

test("secteurs : toutes les communes d'origine restent dans le HTML, aucune ajoutée", () => {
  const expected = ["Centre-ville historique", "Saint-Jacques", "Saint-Mathieu", "La Réal", "Saint-Assiscle", "Moulin à Vent", "Las Cobas", "Mailloles", "Vernet", "Haut-Vernet", "Bas-Vernet", "Clodion", "Champ de Mars", "Saint-Gaudérique", "Catalunya",
    "Cabestany", "Canet-en-Roussillon", "Saint-Estève", "Le Soler", "Bompas", "Rivesaltes", "Toulouges", "Saleilles", "Pollestres", "Pézilla-la-Rivière", "Baixas", "Villeneuve-de-la-Raho",
    "Saint-Génis-des-Fontaines", "Sorède", "Argelès-sur-Mer", "Laroque-des-Albères", "Villelongue-dels-Monts", "Saint-André", "Palau-del-Vidre",
    "Saint-Cyprien", "Elne", "Latour-Bas-Elne", "Théza", "Alénya", "Corneilla-del-Vercol"];
  const chips = [...html.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1]);
  for (const c of expected) assert.ok(chips.includes(c), c);
  assert.ok(plain.toLowerCase().includes("littoral des pyrénées-orientales"));
});

test("contenu éditorial : meta/OG/WebPage harmonisés, FAQPage identique au visible, aucune mention non confirmée", () => {
  const DESC = "Artisan peintre à Perpignan : peinture intérieure et extérieure, rénovation des murs et plafonds, enduits et revêtements de sol. Devis gratuit sous 24 h.";
  assert.equal((html.match(new RegExp(DESC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 4);
  const faq = JSON.parse([...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((j) => j.includes('"FAQPage"')));
  const visible = plain.replace(/&amp;/g, "&");
  for (const q of faq.mainEntity) {
    assert.ok(visible.includes(q.name), q.name);
    assert.ok(visible.includes(q.acceptedAnswer.text.replace(/\s+/g, " ")), q.name);
  }
  assert.ok(faq.mainEntity.some((q) => q.name === "Intervenez-vous après un dégât des eaux ?"));
  assert.ok(!/béton ciré|patine|chaulé|pliolite|siloxane|hydrofuge|microporeux|créneaux d'urgence|jusqu'à 36/i.test(plain), "mentions non confirmées retirées");
  assert.equal((html.match(/<details class="pg-zone"/g) || []).length, 4);
  for (const label of ["Peinture intérieure", "Peinture extérieure et façades", "Murs, plafonds et enduits", "Parquets et revêtements de sol"]) assert.ok(plain.includes(label), label);
});

test("maillage : fiche de chantier, galerie, Façades, Saint-Cyprien ; illustration du Hero séparée des photos de chantier", () => {
  assert.match(html, /href="\.\/realisations\/ravalement-facade-immeuble-perpignan\/">Découvrir ce chantier de façade à Perpignan<\/a>/);
  assert.match(html, /href="\.\/realisations\/">Toutes nos réalisations<\/a>/);
  assert.match(html, /href="\.\/facade-saint-cyprien\/"/);
  assert.match(html, /href="\.\/peintre-saint-cyprien\/"/);
  const real = html.slice(html.indexOf('aria-label="Réalisations à Perpignan"'), html.indexOf('aria-label="Zones d\'intervention"'));
  assert.ok(!real.includes("ambiance-salon"));
});

test("formulaire et conversion conservés (même nom, même fonction, téléphone, boutons)", () => {
  assert.match(html, /name="lead_perpignan" method="POST" action="\/\.netlify\/functions\/lead"/);
  assert.match(html, /name="bot-field"/);
  assert.match(html, /href="tel:\+33650756242"/);
  assert.match(html, /Demander un devis à Perpignan/);
  assert.match(html, /Réponse sous 24 h\. Devis gratuit\./);
});

test("FAQ alignée sur le modèle officiel de /facade-saint-cyprien/ (mêmes classes, aucun style propre)", () => {
  const fac = readFileSync(join(SITE, "facade-saint-cyprien/index.html"), "utf8");
  const shape = (h) => {
    const sec = h.slice(h.search(/<section class="section" id="faq-/), h.indexOf("</section>", h.search(/<section class="section" id="faq-/)));
    return { classes: [...new Set([...sec.matchAll(/class="([^"]+)"/g)].map((m) => m[1]))].filter((c) => c !== "container").sort(), items: (sec.match(/<details class="faq__item">/g) || []).length, bare: (sec.match(/<details>/g) || []).length };
  };
  const a = shape(fac), b = shape(html);
  assert.deepEqual(b.classes, a.classes);
  assert.equal(b.bare, 0);
  assert.equal(b.items, 6);
  assert.ok(!/\.faq__item|\.faq details|\.faq summary/.test(html.slice(0, html.indexOf("</style>"))), "aucun style de carte de FAQ propre à la page");
});
