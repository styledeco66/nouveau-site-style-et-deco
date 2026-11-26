import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import http from "node:http";
import path from "node:path";
import { test, before, after } from "node:test";
import { fileURLToPath } from "node:url";

// Contrôle dans un vrai navigateur (Chrome ou Chromium, mode sans fenêtre) : le site est servi avec les VRAIS en-têtes
// de sécurité de _headers (CSP « 'self' » uniquement), la fonction d'envoi est simulée et enregistre ce qu'elle reçoit.
// Vérifie : aucune erreur JavaScript, aucune violation de la CSP, menu mobile visible, envoi réel des formulaires.
// Ignoré automatiquement si aucun navigateur n'est trouvé (variable CHROME_BIN pour en indiquer un).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "sitesite-template");
const CANDIDATES = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const CHROME = CANDIDATES.find((c) => existsSync(c));
const skip = CHROME ? false : "aucun navigateur Chrome/Chromium trouvé";

const CSP = readFileSync(path.join(SITE, "_headers"), "utf8").split("\n\n")[0].match(/Content-Security-Policy:\s*(.*)/)[1].trim();
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain" };

const COLLECT = `(function(){window.__err=[];window.__csp=[];
window.onerror=function(m,f,l){window.__err.push(m+" @"+(f||"").split("/").pop()+":"+l)};
document.addEventListener("securitypolicyviolation",function(e){window.__csp.push(e.violatedDirective+" "+e.blockedURI)});
addEventListener("load",function(){setTimeout(function(){var d=document.documentElement;d.setAttribute("data-err",window.__err.join(" | ")||"aucune");d.setAttribute("data-csp",window.__csp.join(" | ")||"aucune");
var b=document.querySelector(".js-burger"),c=document.querySelector(".carte");
d.setAttribute("data-layout","burger="+(b?getComputedStyle(b).display:"absent")+" carte="+(c?getComputedStyle(c).position:"absent")+" debordement="+(document.documentElement.scrollWidth>innerWidth));},2500)});})();`;

const SCENARIOS = `(function(){
var t=new URLSearchParams(location.search).get("t");
var $=function(s,r){return (r||document).querySelector(s)};
function saisir(el,v){el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}))}
function note(x){document.documentElement.setAttribute("data-test",x)}
function envoyer(f){f.querySelector('[type="submit"]').click()}
addEventListener("load",function(){setTimeout(function(){try{
if(t==="hero"||t==="tel"){var f=$(".rappel .js-lead-form");saisir($('[name="name"]',f),"Test Auto");saisir($('[name="phone"]',f),t==="tel"?"06 12":"06 12 34 56 78");envoyer(f);
 setTimeout(function(){var z=$(".js-form-status",f);note("msg="+(z.hidden?"aucun":z.textContent))},600)}
if(t==="devis"){var c=$(".formulaire");$('.onglets button[data-mode="devis"]',c).click();var g=$(".js-lead-form",c);
 saisir($('[name="name"]',g),"Test Devis");saisir($('[name="phone"]',g),"+34 600 11 22 33");saisir($('[name="email"]',g),"test@example.com");saisir($('[name="city"]',g),"Perpignan");saisir($('[name="details"]',g),"Repeindre un salon de 30 m2");envoyer(g)}
if(t==="devisvide"){var c2=$(".formulaire");$('.onglets button[data-mode="devis"]',c2).click();var g2=$(".js-lead-form",c2);saisir($('[name="name"]',g2),"Test");saisir($('[name="phone"]',g2),"0612345678");envoyer(g2);
 setTimeout(function(){note("msg="+$(".js-form-status",g2).textContent+" | focus="+(document.activeElement&&document.activeElement.name))},600)}
if(t==="rappelmail"){var g3=$(".formulaire .js-lead-form");saisir($('[name="name"]',g3),"Test Rappel");saisir($('[name="phone"]',g3),"0612345678");envoyer(g3)}
if(t==="dialog"){var d=$(".js-dialog");d.showModal();var h=$(".js-lead-form",d);saisir($('[name="name"]',h),"Test Dialogue");saisir($('[name="phone"]',h),"0612345678");envoyer(h)}
if(t==="cible"){var liens=[].slice.call(document.querySelectorAll("a.js-devis")).map(function(a){return a.getAttribute("href")});
 note("liens="+liens.filter(function(h,i){return liens.indexOf(h)===i}).join(",")+" | cible="+(document.getElementById("demande-devis")||{}).className)}
if(t==="arrivee"){note("mode="+$(".js-formulaire").dataset.mode)}
if(t==="champ"){var c3=$(".formulaire");$('.onglets button[data-mode="devis"]',c3).click();var g4=$(".js-lead-form",c3);envoyer(g4);
 setTimeout(function(){var z=$(".js-form-status",g4),sous=z.parentNode.className.indexOf("champ")>=0?z.parentNode.querySelector("input").name:"hors champ";
 saisir($('[name="name"]',g4),"Test");saisir($('[name="phone"]',g4),"0612345678");saisir($('[name="email"]',g4),"test@example.com");saisir($('[name="city"]',g4),"Perpignan");saisir($('[name="details"]',g4),"Salon a repeindre");
 $('.onglets button[data-mode="rappel"]',c3).click();
 note("sous="+sous+" | apres="+(z.parentNode===g4&&z.nextElementSibling===$(".js-form-submit",g4)?"a sa place":"ailleurs"))},600)}
if(t==="statut"){note("statut="+$(".js-statut-titre").textContent+" | promesse="+$(".js-promesse").textContent)}
}catch(e){note("EXC "+e.message)}},800)});})();`;

const leads = [];
let server;
let base;

before(async () => {
  if (skip) return;
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type) => {
      res.writeHead(code, { "Content-Type": type, "Content-Security-Policy": CSP.replace("frame-ancestors 'none'; ", ""), "Cache-Control": "no-store" });
      res.end(body);
    };
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const payload = JSON.parse(raw || "{}");
        leads.push(payload);
        send(200, JSON.stringify({ ok: true, next: payload.lead_priority === "RAPPEL_30_MIN" ? "/merci-rappel.html?s=30" : "/merci.html" }), "application/json");
      });
      return;
    }
    if (url.pathname === "/__collect.js") return send(200, COLLECT, "text/javascript");
    if (url.pathname === "/__test.js") return send(200, SCENARIOS, "text/javascript");
    let file = path.join(SITE, decodeURIComponent(url.pathname));
    if (!file.startsWith(SITE)) return send(403, "", "text/plain");
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    if (!existsSync(file)) return send(404, "introuvable", "text/plain");
    let body = readFileSync(file);
    const type = TYPES[path.extname(file)] || "application/octet-stream";
    if (file.endsWith(".html")) {
      let text = body.toString("utf8").replace("</head>", '<script src="/__collect.js"></script></head>');
      if (url.searchParams.has("t")) text = text.replace("</body>", '<script src="/__test.js"></script></body>');
      body = text;
    }
    send(200, body, type);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server && server.close());

// Asynchrone : le serveur de contrôle tourne dans ce même processus et doit pouvoir répondre pendant que le navigateur charge la page.
const dump = (pathAndQuery, width = 1280) =>
  new Promise((resolve) => {
    // Un profil Chrome propre à chaque lancement : deux navigateurs lancés en même temps (autres fichiers de test) ne se gênent pas.
    const profile = mkdtempSync(path.join(os.tmpdir(), "sd-chrome-"));
    const child = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${profile}`, `--window-size=${width},900`, "--virtual-time-budget=9000", "--dump-dom", base + pathAndQuery], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    const timer = setTimeout(() => child.kill("SIGKILL"), 60000);
    child.on("close", () => {
      clearTimeout(timer);
      rmSync(profile, { recursive: true, force: true });
      resolve(out);
    });
  });
const attr = (dom, name) => (dom.match(new RegExp(`data-${name}="([^"]*)"`)) || [])[1];

const PAGES = [
  "/", "/peintre-saint-cyprien/", "/facade-saint-cyprien/", "/perpignan.html", "/realisations/", "/en-bref/",
  "/realisations/ravalement-facade-immeuble-perpignan/", "/realisations/peinture-interieure-maison-standing-perpignan/", "/realisations/sol-aspect-parquet-local-commercial-perpignan/", "/realisations/pose-sol-maison-estagel/", "/realisations/peinture-express-local-commercial-saint-nazaire/",
  "/legal/mentions-legales.html", "/legal/politique-confidentialite.html", "/merci.html", "/merci-rappel.html?s=30",
];

test("navigateur : aucune erreur JavaScript ni violation de la CSP sur toutes les pages", { skip }, async () => {
  for (const page of PAGES) {
    const dom = await dump(page);
    assert.equal(attr(dom, "err"), "aucune", `${page} : erreur JavaScript`);
    assert.equal(attr(dom, "csp"), "aucune", `${page} : violation de la CSP`);
  }
});

test("navigateur : menu mobile visible sur téléphone, caché sur ordinateur ; carte ancrée ; pas de débordement horizontal", { skip }, async () => {
  for (const page of ["/", "/peintre-saint-cyprien/", "/facade-saint-cyprien/", "/perpignan.html", "/realisations/"]) {
    const phone = attr(await dump(page, 500), "layout");
    assert.match(phone, /burger=grid/, `${page} : bouton du menu invisible sur mobile`);
    assert.doesNotMatch(phone, /carte=static|carte=absolute|carte=fixed/, `${page} : carte non ancrée sur mobile`);
    assert.match(phone, /debordement=false/, `${page} : défilement horizontal sur mobile`);
    assert.match(attr(await dump(page, 1280), "layout"), /burger=none/, `${page} : bouton du menu visible sur ordinateur`);
  }
});

test("navigateur : rappel depuis la carte du héros envoyé à la fonction, puis page de remerciement", { skip }, async () => {
  leads.length = 0;
  const dom = await dump("/peintre-saint-cyprien/?t=hero");
  assert.equal(leads.length, 1);
  assert.deepEqual(
    { form: leads[0]["form-name"], priorite: leads[0].lead_priority, nom: leads[0].name, tel: leads[0].phone, piege: leads[0]["bot-field"] },
    { form: "lead_saint_cyprien", priorite: "RAPPEL_30_MIN", nom: "Test Auto", tel: "06 12 34 56 78", piege: "" }
  );
  assert.match(leads[0].submission_id, /^[A-Za-z0-9_-]{8,64}$/);
  assert.match(dom, /<title>Demande de rappel reçue \| Style &amp; Déco<\/title>/);
});

test("navigateur : numéro incomplet refusé avec un message lisible, rien n'est envoyé", { skip }, async () => {
  leads.length = 0;
  const dom = await dump("/peintre-saint-cyprien/?t=tel");
  assert.equal(leads.length, 0);
  assert.match(attr(dom, "test"), /Numéro incomplet/);
});

test("navigateur : devis complet envoyé (numéro étranger accepté), puis page de remerciement du devis", { skip }, async () => {
  leads.length = 0;
  const dom = await dump("/perpignan.html?t=devis");
  assert.equal(leads.length, 1);
  assert.deepEqual(
    { form: leads[0]["form-name"], priorite: leads[0].lead_priority, tel: leads[0].phone, mail: leads[0].email, ville: leads[0].city },
    { form: "lead_perpignan", priorite: "STANDARD", tel: "+34 600 11 22 33", mail: "test@example.com", ville: "Perpignan" }
  );
  assert.match(leads[0].subject, /DEMANDE DE DEVIS/);
  assert.match(dom, /<title>Demande de devis reçue/);
});

test("navigateur : devis incomplet refusé (e-mail demandé en premier), rien n'est envoyé", { skip }, async () => {
  leads.length = 0;
  const dom = await dump("/?t=devisvide");
  assert.equal(leads.length, 0);
  assert.match(attr(dom, "test"), /e-mail valide.*focus=email/);
});

test("navigateur : le formulaire de contact en mode rappel envoie nom et téléphone seuls (e-mail facultatif)", { skip }, async () => {
  leads.length = 0;
  await dump("/facade-saint-cyprien/?t=rappelmail");
  assert.equal(leads.length, 1);
  assert.equal(leads[0].lead_priority, "RAPPEL_30_MIN");
  assert.equal(leads[0].name, "Test Rappel");
  assert.equal(leads[0]["form-name"], "lead_facades");
  assert.ok(!leads[0].details);
});

test("navigateur : la fenêtre d'appel (ordinateur) envoie un rappel", { skip }, async () => {
  leads.length = 0;
  await dump("/realisations/?t=dialog");
  assert.equal(leads.length, 1);
  assert.equal(leads[0]["form-name"], "lead_realisations");
  assert.equal(leads[0].lead_priority, "RAPPEL_30_MIN");
});

test("navigateur : le bandeau d'ouverture et la promesse de rappel sont renseignés", { skip }, async () => {
  const info = attr(await dump("/?t=statut"), "test");
  assert.match(info, /statut=.+ \| promesse=.+/);
  assert.doesNotMatch(info, /promesse=\s*$/);
});

test("navigateur : tous les boutons devis d'une page à formulaire mènent au formulaire", { skip }, async () => {
  for (const page of ["/", "/perpignan.html", "/facade-saint-cyprien/"]) {
    assert.equal(attr(await dump(`${page}?t=cible`), "test"), "liens=#demande-devis | cible=formulaire js-formulaire", page);
  }
});

test("navigateur : l'adresse /#demande-devis ouvre l'onglet devis, l'accueil seul reste en rappel", { skip }, async () => {
  assert.equal(attr(await dump("/?t=arrivee#demande-devis"), "test"), "mode=devis");
  assert.equal(attr(await dump("/?t=arrivee"), "test"), "mode=rappel");
});

test("navigateur : le message d'une saisie à corriger se place sous le champ, puis revient au-dessus du bouton", { skip }, async () => {
  leads.length = 0;
  assert.equal(attr(await dump("/?t=champ"), "test"), "sous=name | apres=a sa place");
  assert.equal(leads.length, 0);
});
