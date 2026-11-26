// Mesure d'audience sans cookie (Umami Cloud) : pages consultées et étapes franchies ou abandonnées. Voir docs/audience.md.
// Aucune saisie des visiteurs n'est transmise : seulement des noms d'actions, de formulaires et de champs.
(() => {
  // Identifiant public du site dans Umami (« Website ID »). Tant qu'il est vide, rien n'est chargé ni envoyé.
  const WEBSITE_ID = "0e42e49d-d885-46dc-b106-3c244d1345b3";
  const SCRIPT_URL = "https://cloud.umami.is/script.js";
  const OPT_OUT_KEY = "umami.disabled"; // clé lue par le script Umami lui-même
  const HOSTS = ["styleetdeco.fr", "www.styleetdeco.fr"];
  const FILTER_NAME = "styleDecoAudienceFiltre";
  const AD_CLICK_IDS = ["gclid", "gbraid", "wbraid"];
  const KEPT_PARAMS = ["utm_source", "utm_medium", "utm_campaign"];
  // Numéros français uniquement : le téléphone de l'hébergeur (mentions légales) n'est pas un appel à l'entreprise.
  const PHONE_LINKS = 'a.js-appel, a[href^="tel:+33"], a[href^="tel:0"]';
  // Laisse partir la page vue avant les actions, pour que les entonnoirs restent dans le bon ordre.
  const FLUSH_DELAY_MS = 400;

  const optedOut = () => {
    try { return window.localStorage.getItem(OPT_OUT_KEY) !== null; } catch (_) { return false; }
  };

  // Bouton de refus de la politique de confidentialité.
  const status = document.querySelector("[data-audience-etat]");
  document.querySelectorAll("[data-audience-choix]").forEach((button) => {
    const render = () => {
      const off = optedOut();
      button.textContent = off ? "Compter à nouveau mes visites" : "Ne plus compter mes visites";
      if (status) {
        status.textContent = off
          ? "Vos visites ne sont pas comptées sur ce navigateur."
          : "Vos visites sont comptées sur ce navigateur.";
      }
    };
    button.addEventListener("click", () => {
      try {
        if (optedOut()) window.localStorage.removeItem(OPT_OUT_KEY);
        else window.localStorage.setItem(OPT_OUT_KEY, "1");
      } catch (_) {
        if (status) status.textContent = "Votre navigateur ne permet pas d’enregistrer ce choix.";
        return;
      }
      render();
    });
    button.hidden = false;
    render();
  });

  const configured = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(WEBSITE_ID);
  const production = window.location.protocol === "https:" && HOSTS.includes(window.location.hostname);
  if (!configured || !production || optedOut()) return;

  // Retire des adresses tout ce qui pourrait désigner une personne (identifiant de clic, paramètres libres).
  // Une arrivée par une annonce reste reconnaissable : elle est notée « google / cpc ».
  window[FILTER_NAME] = (type, payload) => {
    if (!payload) return payload;
    const clean = { ...payload };
    if (typeof clean.url === "string") {
      const url = new URL(clean.url, window.location.origin);
      const query = new URLSearchParams();
      KEPT_PARAMS.forEach((key) => {
        const value = url.searchParams.get(key);
        if (value) query.set(key, value);
      });
      if (!query.has("utm_source") && AD_CLICK_IDS.some((key) => url.searchParams.has(key))) {
        query.set("utm_source", "google");
        query.set("utm_medium", "cpc");
      }
      url.search = query.toString();
      url.hash = "";
      clean.url = url.toString();
    }
    if (typeof clean.referrer === "string") clean.referrer = clean.referrer.split(/[?#]/)[0];
    return clean;
  };

  const queue = [];
  let ready = false;
  const track = (name, data) => {
    if (ready) window.umami?.track(name, data);
    else if (queue.length < 20) queue.push([name, data]);
  };
  const done = new Set();
  const trackOnce = (name, data) => {
    if (done.has(name)) return;
    done.add(name);
    track(name, data);
  };

  const flush = () => window.setTimeout(() => {
    if (!window.umami) return;
    ready = true;
    queue.splice(0).forEach(([name, data]) => track(name, data));
  }, FLUSH_DELAY_MS);

  const script = document.createElement("script");
  script.defer = true;
  script.src = SCRIPT_URL;
  script.setAttribute("data-website-id", WEBSITE_ID);
  script.setAttribute("data-domains", HOSTS.join(","));
  script.setAttribute("data-do-not-track", "true");
  script.setAttribute("data-exclude-hash", "true");
  script.setAttribute("data-before-send", FILTER_NAME);
  script.addEventListener("load", () => {
    if (document.readyState === "complete") flush();
    else window.addEventListener("load", flush, { once: true });
  });
  document.head.append(script);

  const formName = (form) => form.getAttribute("name") || "inconnu";
  const formKind = (form) =>
    form.querySelector('[name="lead_priority"]')?.value === "RAPPEL_30_MIN" ? "rappel" : "devis";

  // Phase de capture : le clic est compté même si la page l'intercepte (fenêtre d'appel sur ordinateur).
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!target?.closest) return;
    if (target.closest(PHONE_LINKS)) {
      // Sur téléphone, le numéro se compose ; sur ordinateur, il s'affiche seulement.
      track(window.matchMedia("(pointer: coarse)").matches ? "clic-appel-mobile" : "clic-numero-ordinateur");
    } else if (target.closest('a[href^="mailto:"]')) {
      track("clic-email");
    } else if (target.closest(".js-ouvrir-rappel")) {
      track("ouverture-rappel");
    }
  }, true);

  document.addEventListener("input", (event) => {
    const form = event.target?.closest?.(".js-lead-form");
    if (!form || event.target.name === "bot-field") return;
    trackOnce(`${formKind(form)}-commence`, { formulaire: formName(form) });
  }, true);

  // Envoi refusé par les contrôles de saisie : le champ en cause est marqué juste après l'événement.
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!form?.matches?.(".js-lead-form")) return;
    window.setTimeout(() => {
      const field = form.querySelector('[aria-invalid="true"]');
      if (field) track("formulaire-champ-a-corriger", { formulaire: formName(form), champ: field.name });
    }, 0);
  }, true);

  window.StyleDecoAudience = {
    // Appelé par lead-form.js quand une demande n'a pas pu être envoyée.
    sendFailed(form) { track("formulaire-echec-envoi", { formulaire: formName(form) }); },
  };

  if (typeof window.IntersectionObserver === "function") {
    const observer = new window.IntersectionObserver((entries) => {
      const visible = entries.find((entry) => entry.isIntersecting);
      if (!visible) return;
      observer.disconnect();
      trackOnce("formulaire-vu", { formulaire: formName(visible.target) });
    }, { threshold: 0.5 });
    document.querySelectorAll(".js-lead-form").forEach((form) => observer.observe(form));
  }

  window.addEventListener("scroll", () => {
    const height = document.documentElement.scrollHeight;
    if (!height) return;
    const reached = (window.scrollY + window.innerHeight) / height;
    if (reached >= 0.5) trackOnce("page-descendue-moitie");
    if (reached >= 0.9) trackOnce("page-descendue-bas");
  }, { passive: true });
})();
