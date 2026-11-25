(() => {
  const ADS_TAG_ID = "AW-18396032487";
  const QUOTE_LABEL = "DFs4CJqrvr8dEOfb9MNE";
  const CALL_LABEL = "";
  const CONSENT_KEY = "styledeco-ads-consent-v2";
  const LEGACY_CONSENT_KEY = "styledeco-ads-consent-v1";
  const PAID_VISIT_KEY = "styledeco-ads-paid-visit";
  const PAID_VISIT_DURATION = 30 * 60 * 1000;
  const QUOTE_KEY = "styledeco-ads-quote-v1";
  const CONSENT_DURATION = 180 * 24 * 60 * 60 * 1000;
  const QUOTE_DURATION = 5 * 60 * 1000;
  const ORIGINAL_PHONE = "06 50 75 62 42";
  const PHONE_TEXT = /(?:06|\+33\s*6)\s*50\s*75\s*62\s*42(?!\d)/g;
  const DENIED = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" };
  const production = window.location.hostname === "styleetdeco.fr" && window.location.protocol === "https:";
  const preview = /^deploy-preview-\d+--[a-z0-9-]+\.netlify\.app$/.test(window.location.hostname);
  const validLabel = (value) => /^[\w-]{8,}$/.test(value);
  const validSubmission = (value) => typeof value === "string" && /^[\w-]{10,80}$/.test(value);
  const configured = /^AW-\d+$/.test(ADS_TAG_ID) && (validLabel(QUOTE_LABEL) || validLabel(CALL_LABEL));
  let tagStarted = false;

  const read = (storageName, key) => {
    try { return JSON.parse(window[storageName].getItem(key)); } catch (_) { return null; }
  };

  const write = (storageName, key, data) => {
    try { window[storageName].setItem(key, JSON.stringify(data)); } catch (_) { /* stockage désactivé */ }
  };

  const remove = (storageName, key) => {
    try { window[storageName].removeItem(key); } catch (_) { /* stockage désactivé */ }
  };

  const endPaidVisit = () => {
    remove("sessionStorage", PAID_VISIT_KEY);
    remove("sessionStorage", QUOTE_KEY);
  };

  const getPreference = (key) => {
    const preference = read("localStorage", key);
    if (!preference || !["granted", "denied"].includes(preference.choice)) return null;
    if (!Number.isFinite(preference.expires) || preference.expires <= Date.now()) return null;
    return preference.choice;
  };

  // Un ancien refus reste valable. Un ancien accord ne suffit pas pour ce nouveau parcours.
  const getConsent = () => getPreference(CONSENT_KEY) || (getPreference(LEGACY_CONSENT_KEY) === "denied" ? "denied" : null);
  let consent = getConsent();
  const hasRecordedGrant = consent === "granted" || (consent === null && getPreference(LEGACY_CONSENT_KEY) === "granted");

  if ((!production && !preview) || !configured) return;

  // La présence d'un identifiant plausible permet de proposer le choix. Google vérifie l'attribution.
  const query = new URLSearchParams(window.location.search);
  const paidLanding = ["gclid", "gbraid", "wbraid"].some((key) => {
    const values = query.getAll(key);
    return values.length === 1 && /^[A-Za-z0-9_-]{6,512}$/.test(values[0]);
  });
  const hasActivePaidVisit = () => {
    const expires = read("sessionStorage", PAID_VISIT_KEY);
    return Number.isFinite(expires) && expires > Date.now();
  };
  // Le référent ne peut que prolonger une visite déjà établie dans cet onglet après accord.
  const continuesPaidVisit = consent === "granted" && document.referrer.startsWith(window.location.origin + "/") && hasActivePaidVisit();
  const paidPath = paidLanding || continuesPaidVisit;
  if (paidLanding || !continuesPaidVisit) endPaidVisit();

  const setPhone = (formatted, plain) => {
    if (consent !== "granted" || typeof formatted !== "string" || typeof plain !== "string") return;
    const local = /^0[1-9]\d{8}$/.test(plain);
    const international = /^\+?33[1-9]\d{8}$/.test(plain);
    if ((!local && !international) || !/^\+?[\d\s().-]+$/.test(formatted)) return;
    const dial = local ? plain : `+${plain.replace(/^\+/, "")}`;
    document.querySelectorAll('a[href="tel:+33650756242"], .dlg .numero, .carte-appel .numero').forEach((element) => {
      if (element.tagName === "A") element.setAttribute("href", `tel:${dial}`);
      const label = element.getAttribute("aria-label");
      if (label) element.setAttribute("aria-label", label.replace(PHONE_TEXT, () => formatted));
      const textNodes = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = textNodes.nextNode(); node; node = textNodes.nextNode()) {
        node.nodeValue = node.nodeValue.replace(PHONE_TEXT, () => formatted);
      }
    });
  };

  const reportPendingQuote = () => {
    if (!/^\/merci(?:\.html|\/)?$/.test(window.location.pathname) || !validLabel(QUOTE_LABEL)) return;
    const quote = read("sessionStorage", QUOTE_KEY);
    remove("sessionStorage", QUOTE_KEY);
    if (!validSubmission(quote?.id) || !Number.isFinite(quote.expires) || quote.expires <= Date.now()) return;
    window.gtag("event", "conversion", { send_to: `${ADS_TAG_ID}/${QUOTE_LABEL}`, transaction_id: quote.id, user_data: {} });
  };

  const startTag = () => {
    if (!production || !paidPath || consent !== "granted" || tagStarted) return;
    tagStarted = true;
    write("sessionStorage", PAID_VISIT_KEY, Date.now() + PAID_VISIT_DURATION);
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", DENIED);
    window.gtag("consent", "update", { ...DENIED, ad_storage: "granted", ad_user_data: "granted" });
    window.gtag("js", new Date());
    window.gtag("set", { allow_ad_personalization_signals: false, user_data: {} });
    window.gtag("config", ADS_TAG_ID, { send_page_view: false });

    if (validLabel(CALL_LABEL) && document.querySelector('a[href="tel:+33650756242"]')) {
      window.gtag("config", `${ADS_TAG_ID}/${CALL_LABEL}`, {
        phone_conversion_number: ORIGINAL_PHONE,
        phone_conversion_callback: setPhone,
        phone_conversion_options: { cache: false },
      });
    }
    reportPendingQuote();

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${ADS_TAG_ID}`;
    document.head.append(script);
  };

  const clearSiteAdsStorage = () => {
    try { window.localStorage.removeItem("_gcl_ls"); } catch (_) { /* stockage désactivé */ }
    document.cookie.split(";").map((part) => part.trim().split("=")[0]).filter((key) => /^_gcl_\w+$/.test(key) || key === "gwcc").forEach((key) => {
      document.cookie = `${key}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
      document.cookie = `${key}=; Max-Age=0; Path=/; Domain=styleetdeco.fr; Secure; SameSite=Lax`;
    });
  };

  window.StyleDecoAds = {
    registerQuote(id) {
      if (!tagStarted || consent !== "granted" || !hasActivePaidVisit() || !validLabel(QUOTE_LABEL) || !validSubmission(id)) return;
      write("sessionStorage", QUOTE_KEY, { id, expires: Date.now() + QUOTE_DURATION });
    },
  };

  // Une page directe restaurée peut précéder dans l'historique le clic Ads qui a créé la preuve.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    if (paidPath) refreshConsent();
    else endPaidVisit();
  });

  if (!paidPath && !hasRecordedGrant) return;

  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "ads-consent-settings";
  settings.textContent = "Gestion des cookies";
  (document.querySelector(".pied .wrap, .merci__inner") || document.body).append(settings);

  const panel = document.createElement("section");
  panel.className = "ads-consent";
  panel.setAttribute("aria-labelledby", "ads-consent-title");
  const actions = validLabel(CALL_LABEL) ? "les devis et les appels" : "les demandes de devis";
  panel.innerHTML = paidPath ? `
    <h2 id="ads-consent-title">Mesure publicitaire</h2>
    <p>Vous arrivez depuis un lien de nos annonces. Avec votre accord, Google Ads mesure ${actions} pendant cette visite. Vous pouvez changer votre choix à tout moment.</p>
    <div class="ads-consent__actions">
      <button type="button" data-choice="denied">Refuser</button>
      <button type="button" data-choice="granted">Accepter</button>
    </div>
    <a href="/legal/politique-confidentialite.html#cookies">Politique de confidentialité</a>
  ` : `
    <h2 id="ads-consent-title">Gestion des cookies</h2>
    <p>Vous pouvez retirer un accord enregistré pour les visites issues de nos annonces.</p>
    <div class="ads-consent__actions">
      <button type="button" data-choice="denied">Retirer mon accord</button>
      <button type="button" data-dismiss>Fermer</button>
    </div>
    <a href="/legal/politique-confidentialite.html#cookies">Politique de confidentialité</a>
  `;
  panel.hidden = !paidLanding || consent !== null;
  document.body.append(panel);

  let trigger;
  const openPanel = (event) => {
    trigger = event.currentTarget;
    panel.hidden = false;
    panel.querySelector("button").focus();
  };
  settings.addEventListener("click", openPanel);
  document.querySelectorAll("[data-ads-consent-settings]").forEach((button) => {
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
    remove("localStorage", LEGACY_CONSENT_KEY);
    if (consent === "granted") startTag();
    if (consent === "denied") {
      endPaidVisit();
      if (production) clearSiteAdsStorage();
      // Un nouveau document décharge le code Google et rétablit les numéros d’origine.
      if (tagStarted) window.location.reload();
    }
    closePanel();
  }));

  function refreshConsent() {
    if (!tagStarted) return;
    consent = getConsent();
    if (consent === "granted" && hasActivePaidVisit()) return;
    endPaidVisit();
    if (consent !== "granted") clearSiteAdsStorage();
    window.location.reload();
  }
  window.addEventListener("storage", (event) => {
    if (event.key === CONSENT_KEY || event.key === LEGACY_CONSENT_KEY || event.key === null) refreshConsent();
  });
  startTag();
})();
