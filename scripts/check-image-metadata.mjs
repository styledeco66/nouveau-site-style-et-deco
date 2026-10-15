#!/usr/bin/env node
// Vérifie qu'aucune image publiée ne contient de métadonnées sensibles (GPS, adresse, etc.).
// Aucune valeur n'est affichée : seulement la présence de blocs de métadonnées.
// Usage : node scripts/check-image-metadata.mjs [dossier]   (code de sortie 1 si GPS trouvé)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2] || fileURLToPath(new URL("../sitesite-template/assets/images", import.meta.url));

function tiffHasGps(buf, start) {
  const le = buf.toString("ascii", start, start + 2) === "II";
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  try {
    const ifd0 = start + u32(start + 4);
    const n = u16(ifd0);
    for (let i = 0; i < n; i++) if (u16(ifd0 + 2 + i * 12) === 0x8825) return true;
  } catch { /* EXIF tronqué */ }
  return false;
}

function inspectJpeg(buf) {
  const found = { exif: false, gps: false, xmp: false, iptc: false, other: [] };
  let o = 2;
  while (o + 4 <= buf.length && buf[o] === 0xff) {
    const m = buf[o + 1];
    if (m === 0xda || m === 0xd9) break;
    const len = buf.readUInt16BE(o + 2);
    const body = o + 4;
    if (m === 0xe1 && buf.toString("ascii", body, body + 6) === "Exif\0\0") {
      found.exif = true;
      found.gps = tiffHasGps(buf, body + 6);
    } else if (m === 0xe1 && buf.toString("ascii", body, body + 28).startsWith("http://ns.adobe.com/xap")) {
      found.xmp = true;
    } else if (m === 0xed) found.iptc = true;
    o += 2 + len;
  }
  return found;
}

function chunks(buf, kind) {
  const names = [];
  if (kind === "webp") {
    let o = 12;
    while (o + 8 <= buf.length) {
      names.push(buf.toString("ascii", o, o + 4));
      o += 8 + buf.readUInt32LE(o + 4) + (buf.readUInt32LE(o + 4) & 1);
    }
  } else {
    let o = 8;
    while (o + 8 <= buf.length) {
      names.push(buf.toString("ascii", o + 4, o + 8));
      o += 12 + buf.readUInt32BE(o);
    }
  }
  return names;
}

const walk = (d) => readdirSync(d).sort().flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
let bad = 0;
for (const full of walk(dir)) {
  const f = full.slice(dir.length + 1);
  const ext = extname(f).toLowerCase();
  if (![".jpg", ".jpeg", ".webp", ".png", ".avif"].includes(ext)) continue;
  const buf = readFileSync(full);
  let status;
  if (ext === ".jpg" || ext === ".jpeg") {
    const r = inspectJpeg(buf);
    status = `EXIF:${r.exif ? "oui" : "non"} GPS:${r.gps ? "OUI" : "non"} XMP:${r.xmp ? "oui" : "non"} IPTC:${r.iptc ? "oui" : "non"}`;
    if (r.gps) bad++;
  } else if (ext === ".webp") {
    const c = chunks(buf, "webp");
    const meta = c.filter((n) => n === "EXIF" || n === "XMP ");
    status = `EXIF/XMP:${meta.length ? meta.join(",") : "non"}`;
    if (meta.includes("EXIF")) bad++;
  } else if (ext === ".png") {
    const c = chunks(buf, "png");
    const meta = c.filter((n) => ["eXIf", "tEXt", "iTXt", "zTXt"].includes(n));
    status = `métadonnées PNG:${meta.length ? meta.join(",") : "non"}`;
    if (meta.includes("eXIf")) bad++;
  } else status = "format non analysé";
  console.log(`${f.padEnd(70)} ${buf.length.toString().padStart(8)} o  ${status}`);
}
if (bad) { console.error(`\n${bad} fichier(s) avec métadonnées de localisation.`); process.exit(1); }
console.log("\nAucune coordonnée GPS détectée.");
