// Synchronise la note et le nombre d'avis Google affichés sur le site avec scripts/google-reviews.json.
//   node scripts/google-reviews.mjs           met à jour les pages HTML
//   node scripts/google-reviews.mjs --check   ne modifie rien ; code de sortie 1 si une page est périmée
// Repères dans les pages : data-google-rating (texte « 4,9 »), data-google-count (texte « 16 »),
// data-google-rating-kpi (compteur animé : data-value="4.9" et texte « 4,9/5 »). Voir docs/google-reviews.md.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "sitesite-template");

export const loadConfig = () => JSON.parse(readFileSync(join(ROOT, "scripts", "google-reviews.json"), "utf8"));

export const syncHtml = (html, cfg) =>
  html
    .replace(/(<span\b[^>]*\bdata-google-rating\b(?!-)[^>]*>)[^<]*(<\/span>)/g, `$1${cfg.rating}$2`)
    .replace(/(<span\b[^>]*\bdata-google-count\b[^>]*>)[^<]*(<\/span>)/g, `$1${cfg.count}$2`)
    .replace(/(<div\b[^>]*\bdata-google-rating-kpi\b[^>]*>)[^<]*(<\/div>)/g, (_, open, close) =>
      `${open.replace(/data-value="[^"]*"/, `data-value="${cfg.ratingValue}"`)}${cfg.rating}/5${close}`)
    .replace(/(href=")https:\/\/www\.google\.com\/maps\?cid=\d+(")/g, `$1${cfg.url}$2`);

const htmlFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "assets" ? [] : htmlFiles(path);
    return name.endsWith(".html") ? [path] : [];
  });

export const run = ({ check = false } = {}) => {
  const cfg = loadConfig();
  const stale = [];
  for (const file of htmlFiles(SITE)) {
    const before = readFileSync(file, "utf8");
    const after = syncHtml(before, cfg);
    if (after === before) continue;
    stale.push(file.slice(SITE.length + 1));
    if (!check) writeFileSync(file, after);
  }
  return stale;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const stale = run({ check });
  if (check && stale.length) {
    console.error(`Note ou nombre d'avis Google périmés dans : ${stale.join(", ")}\nLancer : node scripts/google-reviews.mjs`);
    process.exit(1);
  }
  console.log(check ? "Note et nombre d'avis Google à jour." : stale.length ? `Pages mises à jour : ${stale.join(", ")}` : "Aucune page à mettre à jour.");
}
