// Mesure des demandes de devis issues de ChatGPT Ads : variante « Image Tag » d'OpenAI.
// https://developers.openai.com/ads/image-tag
// Choix distinct de celui de Google Ads. Rien n'est gardé ni envoyé sans accord, et seul un devis confirmé par le
// serveur compte. Aucune saisie du visiteur n'est transmise.
(() => {
  const PIXEL_ID = "7bK57co1StvC56N5EfpoFB";
  const ENDPOINT = "https://bzr.openai.com/v1/sdk/events";
  const CONSENT_KEY = "styledeco-openai-consent-v1";
  const VISIT_KEY = "styledeco-openai-visit";
  const QUOTE_KEY = "styledeco-openai-quote";
  const EVENT_KEY = "styledeco-openai-event";
  const VISIT_DURATION = 30 * 60 * 1000;
  const QUOTE_DURATION = 5 * 60 * 1000;
  const CONSENT_DURATION = 180 * 24 * 60 * 60 * 1000;
  const production = window.location.hostname === "styleetdeco.fr" && window.location.protocol === "https:";
  const preview = /^deploy-preview-\d+--[a-z0-9-]+\.netlify\.app$/.test(window.location.hostname);
  if (!production && !preview) return;

  // OpenAI ne publie pas le format de sa référence de clic : on exige seulement du texte sans espace, de longueur raisonnable.
  const validRef = (value) => typeof value === "string" && /^[\x21-\x7E]{1,2048}$/.test(value);
  const validId = (value) => typeof value === "string" && /^[\w-]{10,80}$/.test(value);
  const stillValid = (item) => Number.isFinite(item?.expires) && item.expires > Date.now();

  const read = (storageName, key) => {
    try { return JSON.parse(window[storageName].getItem(key)); } catch (_) { return null; }
  };

  const write = (storageName, key, data) => {
    try { window[storageName].setItem(key, JSON.stringify(data)); } catch (_) { /* stockage désactivé */ }
  };

  const remove = (storageName, key) => {
    try { window[storageName].removeItem(key); } catch (_) { /* stockage désactivé */ }
  };

  const getConsent = () => {
    const preference = read("localStorage", CONSENT_KEY);
    return ["granted", "denied"].includes(preference?.choice) && stillValid(preference) ? preference.choice : null;
  };

  const activeVisit = () => {
    const visit = read("sessionStorage", VISIT_KEY);
    return validRef(visit?.ref) && stillValid(visit) ? visit : null;
  };

  const endVisit = () => {
    remove("sessionStorage", VISIT_KEY);
    remove("sessionStorage", QUOTE_KEY);
  };

  const forget = () => {
    endVisit();
    remove("sessionStorage", EVENT_KEY);
  };

  const values = new URLSearchParams(window.location.search).getAll("oppref");
  const landingRef = values.length === 1 && validRef(values[0]) ? values[0] : null;
  let consent = getConsent();
  // Le référent ne peut que prolonger une visite déjà établie dans cet onglet après accord.
  const continued = consent === "granted" && document.referrer.startsWith(window.location.origin + "/") ? activeVisit() : null;
  const paidPath = Boolean(landingRef || continued);
  let ref = landingRef || continued?.ref || null;
  if (landingRef || !continued) endVisit();
  if (consent !== "granted") forget();

  const startVisit = () => {
    if (!production || !ref || consent !== "granted") return;
    write("sessionStorage", VISIT_KEY, { ref, expires: Date.now() + VISIT_DURATION });
  };

  const newEventId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return `devis-${window.crypto.randomUUID()}`;
    return `devis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  };

  const sendPendingQuote = () => {
    if (!/^\/merci(?:\.html|\/)?$/.test(window.location.pathname)) return;
    const quote = read("sessionStorage", QUOTE_KEY);
    // Retiré avant l'envoi : un rechargement de la confirmation ne renvoie rien.
    remove("sessionStorage", QUOTE_KEY);
    const visit = activeVisit();
    if (!production || getConsent() !== "granted" || !visit || !validId(quote?.eventId) || !stillValid(quote)) return;
    const parameters = new URLSearchParams({
      pid: PIXEL_ID,
      event: "lead_created",
      event_id: quote.eventId,
      oppref: visit.ref,
      "data[type]": "customer_action",
    });
    const image = document.createElement("img");
    image.width = 1;
    image.height = 1;
    image.alt = "";
    image.style.display = "none";
    image.src = `${ENDPOINT}?${parameters}`;
    document.body.append(image);
  };

  window.StyleDecoChatGPTAds = {
    // Appelé par lead-form.js quand le serveur a confirmé un devis.
    registerQuote(submissionId) {
      if (!production || getConsent() !== "granted" || !activeVisit() || !validId(submissionId)) return;
      // Identifiant tiré au hasard pour OpenAI, conservé pour les nouvelles tentatives du même devis.
      const known = read("sessionStorage", EVENT_KEY);
      const eventId = known?.submission === submissionId && validId(known.eventId) ? known.eventId : newEventId();
      write("sessionStorage", EVENT_KEY, { submission: submissionId, eventId });
      write("sessionStorage", QUOTE_KEY, { eventId, expires: Date.now() + QUOTE_DURATION });
    },
  };

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    consent = getConsent();
    if (consent !== "granted") return forget();
    // Une page directe restaurée coupe une visite publicitaire plus récente.
    if (!paidPath) return endVisit();
    ref = landingRef || activeVisit()?.ref || null;
    startVisit();
  });

  if (!paidPath && consent !== "granted") return;

  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "ads-consent-settings";
  settings.textContent = "Mesure ChatGPT Ads";
  (document.querySelector(".pied .wrap, .merci__inner") || document.body).append(settings);

  const panel = document.createElement("section");
  panel.className = "ads-consent";
  panel.setAttribute("aria-labelledby", "chatgpt-consent-title");
  panel.innerHTML = paidPath ? `
    <h2 id="chatgpt-consent-title">Mesure publicitaire ChatGPT</h2>
    <p>Vous arrivez depuis une de nos annonces sur ChatGPT. Avec votre accord, nous signalons à OpenAI qu’une demande de devis a été envoyée pendant cette visite, sans votre nom, vos coordonnées, votre message ni vos photos. Vous pouvez changer votre choix à tout moment.</p>
    <div class="ads-consent__actions">
      <button type="button" data-choice="denied">Refuser</button>
      <button type="button" data-choice="granted">Accepter</button>
    </div>
    <a href="/legal/politique-confidentialite.html#cookies">Politique de confidentialité</a>
  ` : `
    <h2 id="chatgpt-consent-title">Mesure ChatGPT Ads</h2>
    <p>Vous pouvez retirer l’accord donné à la mesure de nos annonces sur ChatGPT (OpenAI).</p>
    <div class="ads-consent__actions">
      <button type="button" data-choice="denied">Retirer mon accord</button>
      <button type="button" data-dismiss>Fermer</button>
    </div>
    <a href="/legal/politique-confidentialite.html#cookies">Politique de confidentialité</a>
  `;
  panel.hidden = !landingRef || consent !== null;
  document.body.append(panel);

  let trigger;
  const openPanel = (event) => {
    trigger = event.currentTarget;
    panel.hidden = false;
    panel.querySelector("button").focus();
  };
  settings.addEventListener("click", openPanel);
  document.querySelectorAll("[data-chatgpt-consent-settings]").forEach((button) => {
    button.hidden = false;
    button.addEventListener("click", openPanel);
  });
  const closePanel = () => {
    panel.hidden = true;
    trigger?.focus();
    trigger = undefined;
  };
  panel.querySelector("[data-dismiss]")?.addEventListener("click", closePanel);
  panel.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.choice === "granted" && !paidPath) return;
    consent = button.dataset.choice;
    write("localStorage", CONSENT_KEY, { choice: consent, expires: Date.now() + CONSENT_DURATION });
    if (consent === "granted") {
      startVisit();
    } else {
      forget();
      ref = landingRef; // hors page d'arrivée, la référence effacée ne revient pas
    }
    closePanel();
  }));

  // Choix modifié dans un autre onglet : la référence gardée dans celui-ci est effacée.
  window.addEventListener("storage", (event) => {
    if (event.key !== CONSENT_KEY && event.key !== null) return;
    consent = getConsent();
    if (consent === "granted") return;
    forget();
    ref = landingRef;
  });

  startVisit();
  sendPendingQuote();
})();
