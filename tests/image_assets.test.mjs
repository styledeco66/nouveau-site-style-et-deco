// Lot 3A : intégrité des photographies (références, dimensions, alt, confidentialité, poids).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../sitesite-template", import.meta.url));
const IMAGES = join(ROOT, "assets/images");
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
const htmlFiles = walk(ROOT).filter((f) => f.endsWith(".html"));
const read = (f) => readFileSync(f, "utf8");
const IMG_EXT = /\.(?:webp|jpe?g|png|avif|gif|svg)$/i;

function localRefs(file, text) {
  const refs = [];
  for (const m of text.matchAll(/(?:src|href|srcset|content)="([^"]+)"|url\("([^")]+)"\)/g)) {
    for (const part of (m[1] || m[2]).split(",")) {
      const u = part.trim().split(/\s+/)[0].split("?")[0];
      if (!IMG_EXT.test(u)) continue;
      if (u.startsWith("https://styleetdeco.fr/")) refs.push(join(ROOT, u.slice("https://styleetdeco.fr/".length)));
      else if (u.startsWith("/")) refs.push(join(ROOT, u));
      else if (!/^(https?:|data:)/.test(u)) refs.push(resolve(dirname(file), u));
    }
  }
  return refs;
}

test("toutes les images référencées (HTML, CSS, sitemap) existent", () => {
  const files = [...htmlFiles, join(ROOT, "assets/css/style.css"), join(ROOT, "sitemap.xml")];
  for (const f of files) {
    for (const ref of localRefs(f, read(f))) assert.ok(existsSync(ref), `${relative(ROOT, f)} → ${relative(ROOT, ref)} introuvable`);
  }
});

test("les fichiers retirés (JPEG avec GPS, ancien logo) ne sont plus servis ni référencés", () => {
  const removed = ["peinture-plafond-perpignan-avant.jpg", "peinture-plafond-perpignan-apres.jpg",
    "chantier-st-cyprien.jpg", "logo-fin.webp", "real-1-2.webp", "real-2.webp", "real-3.webp", "real-4.webp"];
  for (const n of removed) assert.ok(!existsSync(join(IMAGES, n)), `${n} ne doit plus être déployé`);
  const corpus = [...htmlFiles, join(ROOT, "assets/css/style.css"), join(ROOT, "sitemap.xml")].map(read).join("\n");
  for (const n of removed) assert.ok(!corpus.includes(`/${n}`), `${n} encore référencé`);
  const redirects = read(join(ROOT, "_redirects"));
  for (const n of removed) {
    const line = redirects.split("\n").find((l) => l.startsWith(`/assets/images/${n} `));
    assert.ok(line, `redirection 301 manquante pour ${n}`);
    const target = line.split(/\s+/)[1];
    assert.ok(existsSync(join(ROOT, target)), `cible de redirection absente : ${target}`);
  }
});

test("aucune image publiée ne contient de coordonnées GPS ou d'EXIF de localisation", () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/check-image-metadata.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("chaque <img> a un alt, des dimensions et (hors logo) un alt descriptif non vide", () => {
  for (const f of htmlFiles) {
    for (const [tag] of read(f).matchAll(/<img\b[^>]*>/gs)) {
      assert.match(tag, /\balt="/, `${relative(ROOT, f)} : alt manquant`);
      assert.match(tag, /\bwidth="\d+"/, `${relative(ROOT, f)} : width manquant`);
      assert.match(tag, /\bheight="\d+"/, `${relative(ROOT, f)} : height manquant`);
      if (!/brand__logo/.test(tag)) {
        const alt = tag.match(/\balt="([^"]*)"/)[1];
        assert.ok(alt.length >= 20 && alt.length <= 180, `alt trop court/long : ${alt}`);
      }
    }
  }
});

test("galerie de l'accueil : 4 vraies images, lazy, srcset valide, alt visuel sans commune ni matériau inventé", () => {
  const html = read(join(ROOT, "index.html"));
  const gallery = html.slice(html.indexOf('id="realisations"'), html.indexOf('id="process"'));
  const imgs = [...gallery.matchAll(/<img\b[^>]*>/gs)].map((m) => m[0]);
  assert.equal(imgs.length, 4);
  for (const tag of imgs) {
    assert.match(tag, /loading="lazy"/);
    assert.match(tag, /width="1536"\s+height="1024"/);
    assert.match(tag, /sizes="/);
    const alt = tag.match(/alt="([^"]*)"/)[1];
    assert.ok(!/perpignan|saint-cyprien|cyprien|m²|parquet|stratifi|vinyle|lvt/i.test(alt), `alt non factuel : ${alt}`);
  }
  assert.ok(!/shot__media[^"]*" aria-hidden/.test(gallery), "les photos informatives ne doivent plus être masquées");
});

test("photos de Perpignan : WebP responsives légères, dimensions cohérentes", () => {
  const html = read(join(ROOT, "perpignan.html"));
  for (const n of ["avant", "apres"]) {
    const base = `peinture-plafond-perpignan-${n}`;
    for (const w of [640, 960, 1280]) {
      const f = join(IMAGES, `${base}-${w}.webp`);
      assert.ok(statSync(f).size < 120_000, `${base}-${w}.webp trop lourd`);
      assert.ok(html.includes(`${base}-${w}.webp ${w}w`) || (w === 960 && html.includes(`${base}-960.webp"`)));
    }
  }
});

test("poids : aucune image servie ne dépasse 260 Ko (hors logo/favicons déjà légers)", () => {
  for (const f of readdirSync(IMAGES)) assert.ok(statSync(join(IMAGES, f)).size <= 260_000, `${f} dépasse 260 Ko`);
});

test("sitemap : aucune image décorative présentée comme réalisation, titres sans lieu non confirmé", () => {
  const xml = read(join(ROOT, "sitemap.xml"));
  assert.ok(!xml.includes("banniere-facade"), "image décorative dans le sitemap");
  const home = xml.slice(xml.indexOf("<loc>https://styleetdeco.fr/</loc>"), xml.indexOf("perpignan.html"));
  assert.ok(!/Perpignan|m²/.test(home), "titre d'image d'accueil avec lieu non confirmé");
});
