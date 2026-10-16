// Régénère netlify/lib/email-logo.mjs (logo officiel en base64) à partir du PNG optimisé pour les e-mails.
// Usage : node scripts/build-email-logo.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const png = readFileSync(path.join(root, "sitesite-template/assets/images/email/logo-style-deco-email.png"));
const target = path.join(root, "netlify/lib/email-logo.mjs");
const content = `// GÉNÉRÉ par scripts/build-email-logo.mjs à partir de sitesite-template/assets/images/email/logo-style-deco-email.png.
// Ne pas modifier à la main. Le logo officiel est joint en image intégrée (CID) aux e-mails clients.
export const LOGO_PNG_BASE64 =
  "${png.toString("base64")}";
`;
if (process.argv.includes("--check")) {
  if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
    console.error("netlify/lib/email-logo.mjs n'est pas à jour : exécuter node scripts/build-email-logo.mjs");
    process.exit(1);
  }
  console.log("Logo e-mail à jour.");
} else {
  writeFileSync(target, content);
  console.log(`netlify/lib/email-logo.mjs écrit (${png.length} octets de PNG).`);
}
