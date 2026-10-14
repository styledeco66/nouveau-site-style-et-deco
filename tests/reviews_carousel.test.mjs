import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

// Comportement du carrousel d'avis (assets/js/app.js) avec un DOM et une horloge simulés : aucun navigateur, aucun réseau.

const SOURCE = new URL("../sitesite-template/assets/js/app.js", import.meta.url);

const makeElement = (extra = {}) => {
  const classes = new Set();
  const attributes = new Map();
  const listeners = new Map();
  const element = {
    hidden: false,
    inert: false,
    textContent: "",
    style: { props: {}, setProperty(name, value) { this.props[name] = value; } },
    offsetWidth: 1,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, force) => { if (force === undefined ? !classes.has(name) : force) classes.add(name); else classes.delete(name); },
      contains: (name) => classes.has(name),
    },
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    addEventListener: (type, handler) => { listeners.set(type, [...(listeners.get(type) || []), handler]); },
    dispatch(type, event = {}) { for (const handler of listeners.get(type) || []) handler({ preventDefault() { event.prevented = true; }, ...event }); return event; },
    classes,
    attributes,
    ...extra,
  };
  return element;
};

const WORDS = [97, 31, 56, 77, 22, 26]; // nombres de mots proches des six avis réels
const HEIGHTS = [260, 150, 210, 280, 130, 140];

const setup = ({ reduced = false } = {}) => {
  const timers = new Map();
  let nextTimer = 1;
  let now = 0;
  const window = {
    matchMedia: () => media,
    setTimeout: (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, at: now + delay, delay }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    addEventListener() {},
    location: { hash: "" },
    requestAnimationFrame(callback) { callback(); },
  };
  const mediaListeners = [];
  const media = {
    matches: reduced,
    addEventListener: (type, handler) => mediaListeners.push(handler),
  };
  let observerCallback;
  // plusieurs observateurs existent (révélation au défilement, carrousel) : on retient celui du carrousel (seuil 0,2)
  window.IntersectionObserver = class { constructor(callback, options) { if (options && options.threshold === 0.2) observerCallback = callback; } observe() {} unobserve() {} };

  const slides = WORDS.map((words, i) => makeElement({ textContent: Array(words).fill("mot").join(" "), offsetHeight: HEIGHTS[i] }));
  const viewport = makeElement();
  const dots = slides.map(() => makeElement());
  const prev = makeElement();
  const next = makeElement();
  const pause = makeElement();
  const controls = makeElement({ hidden: true });
  const track = makeElement();
  const members = new Set([...slides, ...dots, prev, next, pause, controls, track, viewport]);
  const carousel = makeElement({
    contains: (node) => members.has(node),
    querySelector: (selector) => ({
      ".reviewsTrack": track,
      ".reviewsViewport": viewport,
      ".reviewsControls": controls,
      '.reviewsNav[data-dir="-1"]': prev,
      '.reviewsNav[data-dir="1"]': next,
      ".reviewsPause": pause,
    })[selector] || null,
    querySelectorAll: (selector) => ({ ".reviewCard": slides, ".reviewsDot": dots })[selector] || [],
  });

  let onReady;
  const visibilityHandlers = [];
  const document = {
    hidden: false,
    addEventListener(type, handler) {
      if (type === "DOMContentLoaded") onReady = handler;
      if (type === "visibilitychange") visibilityHandlers.push(handler);
    },
    querySelectorAll: (selector) => (selector === ".js-reviews-carousel" ? [carousel] : []),
    querySelector: () => null,
  };
  const sessionStorage = { getItem() { return null; }, removeItem() {}, setItem() {} };
  vm.runInNewContext(readFileSync(SOURCE, "utf8"), { document, window, sessionStorage, IntersectionObserver: window.IntersectionObserver });
  onReady();

  const active = () => slides.findIndex((slide) => slide.classes.has("is-active"));
  const pending = () => [...timers.values()];
  const advance = (ms) => {
    now += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) { timers.delete(id); timer.callback(); }
    }
  };
  return {
    slides, dots, prev, next, pause, controls, track, viewport, carousel, document, media, mediaListeners,
    active, pending, advance,
    hidden: (value) => { document.hidden = value; visibilityHandlers.forEach((handler) => handler()); },
    observe: (isIntersecting) => observerCallback([{ isIntersecting }]),
  };
};

test("initialisation : première carte active, commandes révélées, une seule carte exposée aux lecteurs d'écran", () => {
  const c = setup();
  assert.equal(c.active(), 0);
  assert.equal(c.controls.hidden, false);
  assert.ok(c.carousel.classes.has("is-enhanced"));
  assert.deepEqual(c.slides.map((slide) => slide.getAttribute("aria-hidden")), ["false", "true", "true", "true", "true", "true"]);
  assert.deepEqual(c.slides.map((slide) => slide.inert), [false, true, true, true, true, true]);
  assert.equal(c.dots[0].getAttribute("aria-current"), "true");
  assert.equal(c.dots[1].getAttribute("aria-current"), null);
  assert.equal(c.track.getAttribute("aria-live"), "off", "pas d'annonce pendant le défilement automatique");
});

test("défilement automatique lent : durée proportionnelle au nombre de mots (3,5 s + 0,33 s par mot, entre 7 s et 45 s)", () => {
  const c = setup();
  const expected = (words) => Math.min(45000, Math.max(7000, 3500 + words * 330));
  assert.equal(c.pending().length, 1);
  for (let i = 0; i < WORDS.length; i += 1) {
    assert.equal(c.pending()[0].delay, expected(WORDS[i]), `carte ${i + 1}`);
    assert.ok(c.pending()[0].delay >= 7000, "au moins 7 s de lecture");
    c.advance(c.pending()[0].delay);
  }
  assert.equal(c.active(), 0, "retour à la première carte après un tour complet");
  assert.ok(expected(97) > 30000, "le long avis de M. Despinoy (~97 mots) reste affiché plus de 30 s");
  assert.ok(expected(22) < 12000, "un avis court n'attend pas inutilement");
  assert.ok(expected(97) / 97 < expected(22) / 22, "proportionnel : le temps par mot est plus faible pour un long avis (durée de base amortie)");
});

test("le défilement n'est jamais plus rapide que la lecture : aucune avance avant la fin de la durée", () => {
  const c = setup();
  c.advance(c.pending()[0].delay - 1);
  assert.equal(c.active(), 0);
  c.advance(1);
  assert.equal(c.active(), 1);
});

test("navigation manuelle : précédent, suivant, points, boucle aux extrémités", () => {
  const c = setup();
  c.next.dispatch("click");
  assert.equal(c.active(), 1);
  c.prev.dispatch("click");
  c.prev.dispatch("click");
  assert.equal(c.active(), 5, "précédent depuis la première carte → dernière");
  c.next.dispatch("click");
  assert.equal(c.active(), 0);
  c.dots[3].dispatch("click");
  assert.equal(c.active(), 3);
  assert.equal(c.dots[3].getAttribute("aria-current"), "true");
  assert.equal(c.dots[0].getAttribute("aria-current"), null);
  assert.equal(c.slides[3].getAttribute("aria-hidden"), "false");
  assert.equal(c.slides[0].getAttribute("aria-hidden"), "true");
});

test("clavier : flèches gauche/droite, Début et Fin ; les autres touches et combinaisons sont ignorées", () => {
  const c = setup();
  const press = (key, extra = {}) => c.carousel.dispatch("keydown", { key, ...extra });
  assert.equal(press("ArrowRight").prevented, true);
  assert.equal(c.active(), 1);
  press("ArrowLeft");
  press("ArrowLeft");
  assert.equal(c.active(), 5);
  press("Home");
  assert.equal(c.active(), 0);
  press("End");
  assert.equal(c.active(), 5);
  assert.equal(press("a").prevented, undefined);
  press("ArrowRight", { ctrlKey: true });
  assert.equal(c.active(), 5, "Ctrl+flèche laissée au navigateur");
});

test("pause pendant l'interaction : survol souris, focus clavier, toucher ; reprise ensuite", () => {
  const c = setup();
  c.carousel.dispatch("pointerenter", { pointerType: "mouse" });
  assert.equal(c.pending().length, 0);
  assert.equal(c.track.getAttribute("aria-live"), "polite");
  c.carousel.dispatch("pointerleave", { pointerType: "mouse" });
  assert.equal(c.pending().length, 1);

  c.carousel.dispatch("pointerenter", { pointerType: "touch" });
  assert.equal(c.pending().length, 1, "un toucher n'est pas un survol durable");

  c.carousel.dispatch("focusin", { target: c.next });
  assert.equal(c.pending().length, 0);
  c.carousel.dispatch("focusout", { relatedTarget: c.prev });
  assert.equal(c.pending().length, 0, "le focus reste dans le carrousel");
  c.carousel.dispatch("focusout", { relatedTarget: null });
  assert.equal(c.pending().length, 1);

  c.carousel.dispatch("touchstart", { touches: [{ clientX: 100, clientY: 10 }] });
  assert.equal(c.pending().length, 0);
});

test("balayage tactile : vers la gauche = suivant, vers la droite = précédent ; défilement relancé après 8 s", () => {
  const c = setup();
  c.carousel.dispatch("touchstart", { touches: [{ clientX: 200, clientY: 50 }] });
  c.carousel.dispatch("touchend", { changedTouches: [{ clientX: 100, clientY: 55 }] });
  assert.equal(c.active(), 1);
  c.carousel.dispatch("touchstart", { touches: [{ clientX: 100, clientY: 50 }] });
  c.carousel.dispatch("touchend", { changedTouches: [{ clientX: 220, clientY: 52 }] });
  assert.equal(c.active(), 0);
  c.carousel.dispatch("touchstart", { touches: [{ clientX: 100, clientY: 50 }] });
  c.carousel.dispatch("touchend", { changedTouches: [{ clientX: 130, clientY: 200 }] });
  assert.equal(c.active(), 0, "geste vertical ou trop court : ignoré");
  assert.equal(c.pending().some((timer) => timer.delay === 8000), true);
  c.advance(8000);
  assert.ok(c.pending().some((timer) => timer.delay >= 7000), "défilement relancé");
});

test("bouton pause : bascule, état annoncé (aria-pressed, libellé), arrêt et reprise du défilement", () => {
  const c = setup();
  assert.equal(c.pause.getAttribute("aria-pressed"), "false");
  c.pause.dispatch("click");
  assert.equal(c.pause.getAttribute("aria-pressed"), "true");
  assert.equal(c.pause.getAttribute("aria-label"), "Reprendre le défilement automatique des avis");
  assert.ok(c.carousel.classes.has("is-user-paused"));
  assert.equal(c.pending().length, 0);
  c.next.dispatch("click");
  assert.equal(c.active(), 1, "navigation manuelle toujours possible");
  assert.equal(c.pending().length, 0, "une pause demandée reste une pause");
  c.pause.dispatch("click");
  assert.equal(c.pause.getAttribute("aria-label"), "Mettre en pause le défilement automatique des avis");
  assert.equal(c.pending().length, 1);
});

test("préférence de réduction des animations : aucun défilement automatique, bouton pause masqué, navigation manuelle conservée", () => {
  const c = setup({ reduced: true });
  assert.equal(c.pending().length, 0);
  assert.equal(c.pause.hidden, true);
  assert.equal(c.track.getAttribute("aria-live"), "polite");
  c.next.dispatch("click");
  assert.equal(c.active(), 1);
  assert.equal(c.pending().length, 0);
  // la préférence peut changer en cours de visite
  c.media.matches = false;
  c.mediaListeners.forEach((handler) => handler());
  assert.equal(c.pause.hidden, false);
  assert.equal(c.pending().length, 1);
});

test("onglet masqué ou carrousel hors écran : défilement suspendu, relancé au retour", () => {
  const c = setup();
  c.hidden(true);
  assert.equal(c.pending().length, 0);
  c.hidden(false);
  assert.equal(c.pending().length, 1);
  c.observe(false);
  assert.equal(c.pending().length, 0);
  c.observe(true);
  assert.equal(c.pending().length, 1);
});

test("la barre de progression est relancée à chaque carte et durée fixée par avis", () => {
  const c = setup();
  assert.ok(c.carousel.classes.has("is-running"));
  assert.equal(c.carousel.style.props["--reviews-dwell"], `${c.pending()[0].delay}ms`);
  c.carousel.dispatch("pointerenter", { pointerType: "mouse" });
  assert.ok(!c.carousel.classes.has("is-running"), "barre arrêtée pendant la pause");
});

test("un carrousel de moins de deux avis n'est pas activé (le contenu reste lisible sans JavaScript)", () => {
  const carousel = makeElement({ querySelector: (s) => (s === ".reviewsTrack" ? makeElement() : null), querySelectorAll: (s) => (s === ".reviewCard" ? [makeElement()] : []) });
  let onReady;
  const document = { hidden: false, addEventListener(type, handler) { if (type === "DOMContentLoaded") onReady = handler; }, querySelectorAll: (s) => (s === ".js-reviews-carousel" ? [carousel] : []), querySelector: () => null };
  const window = { matchMedia: () => ({ matches: false }), setTimeout() {}, clearTimeout() {}, addEventListener() {}, location: { hash: "" }, requestAnimationFrame(c) { c(); } };
  vm.runInNewContext(readFileSync(SOURCE, "utf8"), { document, window, sessionStorage: { getItem() { return null; }, removeItem() {}, setItem() {} } });
  onReady();
  assert.ok(!carousel.classes.has("is-enhanced"));
});

test("hauteur : la fenêtre prend la hauteur de l'avis affiché, sans saut à l'initialisation", () => {
  const c = setup();
  assert.equal(c.viewport.style.height, `${HEIGHTS[0]}px`);
  c.next.dispatch("click");
  assert.equal(c.viewport.style.height, `${HEIGHTS[1]}px`);
  c.dots[3].dispatch("click");
  assert.equal(c.viewport.style.height, `${HEIGHTS[3]}px`);
  assert.equal(c.viewport.style.transition, "", "transition CSS conservée après l'ajustement immédiat initial");
});

test("reflet doré : déclenché uniquement lors d'un changement d'avis, retiré à la fin de l'animation", () => {
  const c = setup();
  assert.ok(!c.carousel.classes.has("is-shimmering"), "aucune lumière au chargement");
  c.next.dispatch("click");
  assert.ok(c.carousel.classes.has("is-shimmering"));
  c.carousel.dispatch("animationend", { animationName: "reviewsSheen" });
  assert.ok(c.carousel.classes.has("is-shimmering"), "seule la fin de l'animation de la bordure retire le reflet");
  c.carousel.dispatch("animationend", { animationName: "reviewsRing" });
  assert.ok(!c.carousel.classes.has("is-shimmering"), "aucune lumière permanente");
  c.dots[1].dispatch("click"); // déjà sur l'avis 2 : pas de changement, pas de reflet
  assert.ok(!c.carousel.classes.has("is-shimmering"));
  c.advance(c.pending()[0].delay); // changement automatique
  assert.ok(c.carousel.classes.has("is-shimmering"));
});

test("reflet doré : supprimé avec la préférence de réduction des animations", () => {
  const c = setup({ reduced: true });
  c.next.dispatch("click");
  c.dots[3].dispatch("click");
  assert.equal(c.active(), 3, "navigation fonctionnelle");
  assert.ok(!c.carousel.classes.has("is-shimmering"));
});
