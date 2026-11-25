import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Fiches « parquet » : grand local commercial de Perpignan et maison d'Estagel.
// Contrôle le référencement de chaque fiche, la présence et les dimensions des images, les liens depuis le reste du site.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "sitesite-template");
const read = (f) => readFileSync(path.join(SITE, f), "utf8");
const ORIGIN = "https://styleetdeco.fr";
const decode = (t) => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");

const FICHES = [
  { slug: "sol-aspect-parquet-local-commercial-perpignan", dir: "sol-aspect-parquet-local-perpignan", lieu: "Perpignan", photos: 10 },
  { slug: "pose-sol-maison-estagel", dir: "sol-maison-estagel", lieu: "Estagel", photos: 22 },
];

/** Largeur et hauteur d'un WebP (VP8 / VP8L / VP8X). */
function tailleWebp(file) {
  const b = readFileSync(file);
  assert.equal(b.toString("ascii", 0, 4), "RIFF", file);
  const type = b.toString("ascii", 12, 16);
  if (type === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (type === "VP8L") { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
  if (type === "VP8X") return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  throw new Error(`format WebP inconnu : ${file}`);
}

for (const f of FICHES) {
  const file = `realisations/${f.slug}/index.html`;
  const url = `${ORIGIN}/realisations/${f.slug}/`;

  test(`${f.slug} : title, description, canonique, balisage et un seul H1`, () => {
    const html = read(file);
    const title = decode((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
    const desc = decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "");
    assert.ok(title.length >= 30 && title.length <= 70, `title : ${title.length} signes`);
    assert.ok(title.endsWith("| Style & Déco"), title);
    assert.ok(desc.length >= 80 && desc.length <= 165, `description : ${desc.length} signes`);
    assert.ok(title.includes(f.lieu) && desc.includes(f.lieu), "la commune figure dans le title et la description");
    assert.equal((html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1], url);
    assert.equal((html.match(/<meta property="og:url" content="([^"]+)"/) || [])[1], url);
    assert.equal(decode((html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1]), title);
    assert.match(html, /<meta name="robots" content="index,follow,max-image-preview:large" \/>/);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
    assert.ok(decode(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]).includes(f.lieu));
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];
    const page = ld.find((n) => n["@type"] === "WebPage");
    assert.equal(page.url, url);
    assert.equal(page.isPartOf["@id"], `${ORIGIN}/#website`);
    assert.equal(page.about["@id"], `${ORIGIN}/#business`);
    const crumbs = ld.find((n) => n["@type"] === "BreadcrumbList").itemListElement;
    assert.deepEqual(crumbs.map((c) => c.position), [1, 2, 3]);
    assert.equal(crumbs[2].item, url);
    const og = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
    assert.ok(og.startsWith(`${ORIGIN}/assets/images/realisations/${f.dir}/`), og);
    assert.ok(existsSync(path.join(SITE, og.replace(ORIGIN + "/", ""))), og);
    assert.doesNotMatch(html, /Nicolas/, "la fiche met en avant Style & Déco, pas un prénom");
    assert.doesNotMatch(html, /décennale[^<]{0,40}\d+\s*ans|10 ans/i, "décennale sans durée");
  });

  test(`${f.slug} : toutes les images existent, leurs dimensions sont exactes et leurs textes alternatifs sont utiles`, () => {
    const html = read(file);
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((t) => t.includes(`/realisations/${f.dir}/`));
    assert.ok(imgs.length >= f.photos, `${imgs.length} images de chantier`);
    for (const tag of imgs) {
      const src = tag.match(/src="([^"]+)"/)[1];
      const abs = path.join(SITE, "realisations", f.slug, src);
      assert.ok(existsSync(abs), src);
      const [w, h] = tailleWebp(abs);
      assert.equal(Number(tag.match(/width="(\d+)"/)[1]), w, `${src} : largeur`);
      assert.equal(Number(tag.match(/height="(\d+)"/)[1]), h, `${src} : hauteur`);
      const alt = tag.match(/alt="([^"]*)"/)[1];
      if (alt) assert.ok(alt.length >= 30 && alt.length <= 200, `alt de ${src} : ${alt.length} signes`);
    }
    const figures = [...html.matchAll(/<figure\b[\s\S]*?<\/figure>/g)].map((m) => m[0]);
    assert.ok(figures.length >= f.photos - 1);
    for (const fig of figures) assert.match(fig, /<figcaption>[^<]{15,}<\/figcaption>/);
  });

  test(`${f.slug} : listée dans le plan du site et la galerie, formulaire de la page des réalisations`, () => {
    assert.ok(read("sitemap.xml").includes(`<loc>${url}</loc>`));
    assert.ok(read("realisations/index.html").includes(`href="/realisations/${f.slug}/"`));
    const html = read(file);
    assert.match(html, /name="lead_realisations"/);
    assert.match(html, /<a class="autre-real" href="\/realisations\//);
    assert.ok(existsSync(path.join(SITE, "assets/images/realisations", f.dir)));
  });
}

test("la carte « Parquet & revêtements de sol » de l'accueil mène au chantier de parquet", () => {
  const home = read("index.html");
  const carte = home.slice(home.indexOf("<h3>Parquet &amp; revêtements de sol</h3>"));
  const lien = carte.slice(0, carte.indexOf("</article>")).match(/<a class="lien" href="([^"]+)">Voir un chantier<\/a>/);
  assert.ok(lien, "lien « Voir un chantier » de la carte Parquet");
  assert.equal(lien[1], "/realisations/sol-aspect-parquet-local-commercial-perpignan/");
});

test("les deux fiches se renvoient l'une vers l'autre", () => {
  assert.match(read("realisations/sol-aspect-parquet-local-commercial-perpignan/index.html"), /class="autre-real" href="\/realisations\/pose-sol-maison-estagel\/"/);
  assert.match(read("realisations/pose-sol-maison-estagel/index.html"), /class="autre-real" href="\/realisations\/sol-aspect-parquet-local-commercial-perpignan\/"/);
});

test("les fiches parquet parlent de sol : ni formules toutes faites (finition nette, coupes nettes…), ni murs", () => {
  for (const f of FICHES) {
    const html = read(`realisations/${f.slug}/index.html`);
    const avantContact = html.slice(0, html.indexOf('<section class="sec contact"'));
    const visible = avantContact
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
      .replace(/\ssrc="[^"]*"/g, "") // les noms de fichiers ne comptent pas
      .replace(/<[^>]+?(alt="[^"]*")[^>]*>/g, " $1 ")
      .replace(/<[^>]+>/g, " ");
    assert.doesNotMatch(visible, /\bmurs?\b/i, `${f.slug} : il est question de murs`);
    assert.doesNotMatch(visible, /\bnett?es?\b|\bsoign\w+|impeccable|parfaitement/i, `${f.slug} : formule toute faite`);
  }
});
