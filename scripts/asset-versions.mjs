#!/usr/bin/env node
// Versionnement des ressources CSS/JS par empreinte de contenu (voir docs/asset-versioning.md).
//
// `_headers` sert /assets/* en `immutable` pendant un an : un navigateur qui a déjà un fichier ne le
// redemande plus. Seul un changement d'adresse force le téléchargement. Chaque référence à un fichier
// de assets/css ou assets/js reçoit donc `?v=<empreinte SHA-256 du contenu>` : l'adresse change quand
// (et seulement quand) le contenu change. Les pages HTML restent revalidées à chaque visite et
// portent donc toujours les adresses à jour.
//
//   node scripts/asset-versions.mjs           met à jour les références dans les pages HTML
//   node scripts/asset-versions.mjs --check   ne modifie rien ; échoue si une référence est périmée
//
// Aucune dépendance : modules intégrés de Node uniquement.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HASH_LENGTH = 10;

const ASSET_DIRS = ["assets/css", "assets/js"];
const ASSET_FILE = /\.(?:css|m?js)$/;
// href="…/assets/css/x.css?v=…" ou src='…/assets/js/x.js' ; couvre aussi rel="preload" / "modulepreload".
const REFERENCE = /(\b(?:href|src)\s*=\s*)(["'])([^"'?#]*\bassets\/(?:css|js)\/[^"'?#]+)(\?[^"'#]*)?\2/g;
const KNOWN_QUERY = /^\?v=[0-9a-f]+$/;
// Une ressource qui en charge une autre échapperait au versionnement : on refuse plutôt que de l'ignorer.
const NESTED_LOADS = [
  [/@import\b/, "@import"],
  [/\bimportScripts\s*\(/, "importScripts()"],
  [/\bimport\s*\(/, "import()"],
  [/^\s*import\s[^;]*?\sfrom\s*["']/m, "import … from"],
  [/^\s*import\s*["']/m, "import \"…\""],
  [/\bnew\s+(?:Shared)?Worker\s*\(/, "new Worker()"],
];

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    })
    .sort();

const toPosix = (file) => file.split(path.sep).join("/");

export const fingerprint = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, HASH_LENGTH);

const listAssets = (siteRoot) =>
  ASSET_DIRS.flatMap((dir) => {
    try {
      return walk(path.join(siteRoot, dir)).filter((file) => ASSET_FILE.test(file));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  });

const resolveReference = (siteRoot, htmlFile, reference) =>
  reference.startsWith("/")
    ? path.join(siteRoot, reference)
    : path.resolve(path.dirname(htmlFile), reference);

// Retourne { problems, changed, references, unreferenced }. En mode `write`, met à jour les pages.
export const run = ({ siteRoot, write = false }) => {
  const problems = [];
  const changed = [];
  const referenced = new Set();
  let references = 0;

  const assets = listAssets(siteRoot);
  for (const asset of assets) {
    const source = readFileSync(asset, "utf8");
    for (const [pattern, label] of NESTED_LOADS) {
      if (pattern.test(source)) {
        problems.push(`${toPosix(path.relative(siteRoot, asset))} : ${label} non pris en charge par le versionnement`);
      }
    }
  }

  const cache = new Map();
  const stamp = (file) => {
    if (!cache.has(file)) cache.set(file, fingerprint(file));
    return cache.get(file);
  };
  const assetRoots = ASSET_DIRS.map((dir) => path.join(siteRoot, dir) + path.sep);

  const pages = walk(siteRoot).filter((file) => file.endsWith(".html"));
  for (const page of pages) {
    const pageName = toPosix(path.relative(siteRoot, page));
    const original = readFileSync(page, "utf8");
    const updated = original.replace(REFERENCE, (match, prefix, quote, reference, query = "") => {
      references += 1;
      const target = resolveReference(siteRoot, page, reference);
      if (!assetRoots.some((root) => target.startsWith(root))) {
        problems.push(`${pageName} : ${reference} sort des dossiers assets/css et assets/js`);
        return match;
      }
      if (!assets.includes(target)) {
        problems.push(`${pageName} : ${reference} ne correspond à aucun fichier`);
        return match;
      }
      if (query && !KNOWN_QUERY.test(query)) {
        problems.push(`${pageName} : paramètre inattendu « ${query} » sur ${reference}`);
        return match;
      }
      referenced.add(target);
      const expected = `?v=${stamp(target)}`;
      if (query !== expected) {
        if (!write) problems.push(`${pageName} : ${reference}${query} devrait être ${reference}${expected}`);
        return `${prefix}${quote}${reference}${expected}${quote}`;
      }
      return match;
    });
    if (updated !== original) {
      changed.push(pageName);
      if (write) writeFileSync(page, updated);
    }
  }

  const unreferenced = assets
    .filter((asset) => !referenced.has(asset))
    .map((asset) => toPosix(path.relative(siteRoot, asset)));

  return { problems, changed, references, unreferenced };
};

const main = () => {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const siteIndex = args.indexOf("--site");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const siteRoot = siteIndex >= 0 ? path.resolve(args[siteIndex + 1]) : path.join(root, "sitesite-template");

  const result = run({ siteRoot, write: !check });
  for (const file of result.unreferenced) console.warn(`Avertissement : ${file} n'est référencé par aucune page.`);

  if (result.problems.length) {
    console.error("Versionnement des ressources : problèmes détectés.");
    for (const problem of result.problems) console.error(` - ${problem}`);
    if (check) console.error("Corriger avec : node scripts/asset-versions.mjs");
    process.exit(1);
  }
  if (check) {
    console.log(`Versionnement des ressources : ${result.references} références à jour.`);
  } else if (result.changed.length) {
    console.log(`Références mises à jour dans ${result.changed.length} page(s) :`);
    for (const page of result.changed) console.log(` - ${page}`);
  } else {
    console.log(`Aucun changement : ${result.references} références déjà à jour.`);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
