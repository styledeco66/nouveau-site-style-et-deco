(() => {
  const ENDPOINT = "/.netlify/functions/lead";
  const SUCCESS_URL = "/merci.html";
  // Seules les pages de confirmation du site sont acceptées comme destination (la réponse du serveur est la source).
  const SUCCESS_PATTERN = /^\/merci(?:-rappel)?\.html(?:\?s=[0-9]{2,8})?$/;
  const REQUEST_TIMEOUT_MS = 15000;
  // Photos facultatives d'un devis : réduites dans le navigateur avant l'envoi.
  const MAX_PHOTOS = 5;
  const PHOTO_MAX_CHARS = 900000;
  const PHOTO_SIZES = [[1600, 0.75], [1280, 0.65], [960, 0.6]];
  const PHOTO_TIMEOUT_MS = 60000; // un envoi de photos peut être long sur un réseau mobile
  const PHOTOS_LOST_KEY = "styledeco-photos-perdues";
  const ERROR_MESSAGE =
    "Votre demande n’a pas pu être envoyée. Réessayez dans quelques minutes ou appelez le 06 50 75 62 42.";

  const newSubmissionId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  };

  const readFields = (form) => {
    const fields = {};
    for (const [name, value] of new FormData(form)) {
      if (typeof value === "string" && !(name in fields)) fields[name] = value;
    }
    return fields;
  };

  // Le succès n'est reconnu que si la function confirme explicitement l'envoi ; elle indique aussi la page de confirmation
  // (devis ou rappel) selon le résultat qu'elle a validé.
  const deliver = async (fetchImpl, payload, timeoutMs = REQUEST_TIMEOUT_MS) => {
    try {
      const response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
      });
      if (!response.ok) return null;
      const result = await response.json();
      if (!result || result.ok !== true) return null;
      return {
        kind: result.kind,
        next: typeof result.next === "string" && SUCCESS_PATTERN.test(result.next) ? result.next : SUCCESS_URL,
        photosLost: Number(result.photosLost) || 0,
      };
    } catch (error) {
      return null;
    }
  };

  const setStatus = (status, message) => {
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
  };

  const readAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const loadImage = (source) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = source;
    });

  // Redimensionne et réencode en JPEG : l'envoi reste léger et les données de localisation de la photo sont retirées.
  const preparePhoto = async (file) => {
    const image = await loadImage(await readAsDataUrl(file));
    for (const [edge, quality] of PHOTO_SIZES) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff"; // une image transparente ne devient pas noire en JPEG
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.startsWith("data:image/jpeg;base64,") && url.length <= PHOTO_MAX_CHARS) return url;
    }
    throw new Error("photo_trop_lourde");
  };

  const PLUS_ICON =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  const bindPhotos = (form) => {
    const zone = form.querySelector("[data-photos]");
    if (!zone) return null;
    const open = zone.querySelector(".photos__ouvrir");
    const panel = zone.querySelector(".photos__panneau");
    const input = zone.querySelector('input[type="file"]');
    const list = zone.querySelector(".photos__liste");
    const state = zone.querySelector(".photos__etat");
    const photos = [];
    let pending = Promise.resolve();
    let counter = 0;

    // Toujours cinq cases : une photo choisie, ou un « + » qui ouvre le choix des photos.
    const render = () => {
      list.textContent = "";
      for (let index = 0; index < MAX_PHOTOS; index += 1) {
        const item = document.createElement("li");
        const photo = photos[index];
        const button = document.createElement("button");
        button.type = "button";
        if (photo) {
          const image = document.createElement("img");
          image.src = photo.url;
          image.alt = `Photo ${index + 1}`;
          button.className = "photos__retirer";
          button.setAttribute("aria-label", `Retirer la photo ${index + 1}`);
          button.innerHTML = '<svg width="13" height="13" aria-hidden="true"><use href="#i-x"/></svg>';
          button.addEventListener("click", () => {
            photos.splice(photos.indexOf(photo), 1);
            state.textContent = "";
            render();
          });
          item.append(image, button);
        } else {
          button.className = "photos__case";
          button.setAttribute("aria-label", `Ajouter la photo ${index + 1}`);
          button.innerHTML = PLUS_ICON;
          button.addEventListener("click", () => input.click());
          item.append(button);
        }
        list.append(item);
      }
    };

    // Le texte ouvre les cases et les referme tant qu'aucune photo n'est choisie.
    open.addEventListener("click", () => {
      if (!panel.hidden && photos.length) return;
      panel.hidden = !panel.hidden;
      open.setAttribute("aria-expanded", String(!panel.hidden));
    });

    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      input.value = ""; // permet de rechoisir une photo retirée
      if (!files.length) return;
      pending = pending.then(async () => {
        const room = MAX_PHOTOS - photos.length;
        let failed = 0;
        state.textContent = "Préparation des photos…";
        for (const file of files.slice(0, room)) {
          try {
            const url = await preparePhoto(file);
            counter += 1;
            photos.push({ id: counter, url });
            render();
          } catch (error) {
            failed += 1;
          }
        }
        const messages = [];
        if (failed) messages.push(failed > 1 ? `${failed} photos n’ont pas pu être ajoutées.` : "Une photo n’a pas pu être ajoutée.");
        if (files.length > room) messages.push(`${MAX_PHOTOS} photos au maximum.`);
        state.textContent = messages.join(" ");
      });
    });
    render();
    zone.hidden = false;

    return {
      async collect() {
        await pending;
        return photos.map((photo) => ({ id: photo.id, data: photo.url.slice(photo.url.indexOf(",") + 1) }));
      },
    };
  };

  const bindLeadForm = (form, deps = {}) => {
    const fetchImpl = deps.fetchImpl || ((...args) => window.fetch(...args));
    const redirect = deps.redirect || ((url) => window.location.assign(url));
    const readForm = deps.formData ? (target) => Object.fromEntries(deps.formData(target)) : readFields;
    const pushEvent = (payload) => {
      const layer = deps.dataLayer || (window.dataLayer = window.dataLayer || []);
      layer.push(payload);
    };
    const photos = deps.photos || bindPhotos(form);
    const markPhotosLost = deps.markPhotosLost || ((count) => {
      try { window.sessionStorage.setItem(PHOTOS_LOST_KEY, String(count)); } catch (error) { /* stockage désactivé */ }
    });
    let sending = false;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (sending) return;

      const status = form.querySelector(".js-form-status");
      const submit = form.querySelector('[type="submit"]');
      sending = true;
      setStatus(status, "");
      if (submit) {
        submit.disabled = true;
        submit.setAttribute("aria-busy", "true");
      }

      // Conservé entre deux tentatives : Resend dédoublonne si la première a en fait abouti. Si le visiteur a modifié sa saisie
      // (ou changé de mode) depuis la tentative précédente, le contenu n'est plus le même : nouvel identifiant.
      const fields = readForm(form);
      const chosen = photos && fields.lead_priority !== "RAPPEL_30_MIN" ? await photos.collect() : [];
      const fingerprint = JSON.stringify(chosen.length ? { ...fields, photos: chosen.map((photo) => photo.id) } : fields);
      if (!form.dataset.submissionId || form.dataset.submissionFingerprint !== fingerprint) {
        form.dataset.submissionId = newSubmissionId();
        form.dataset.submissionFingerprint = fingerprint;
      }
      const request = { ...fields, submission_id: form.dataset.submissionId };
      let delivered = chosen.length
        ? await deliver(fetchImpl, { ...request, photos: chosen.map((photo) => photo.data) }, PHOTO_TIMEOUT_MS)
        : await deliver(fetchImpl, request);
      let photosLost = delivered ? delivered.photosLost : 0;
      // La demande ne doit jamais se perdre à cause d'une photo : nouvel essai sans elles, en le signalant.
      if (!delivered && chosen.length) {
        delivered = await deliver(fetchImpl, { ...request, photos_lost: chosen.length });
        if (delivered) photosLost = chosen.length;
      }

      if (delivered) {
        const priority = fields.lead_priority === "RAPPEL_30_MIN" ? "RAPPEL_30_MIN" : "STANDARD";
        pushEvent({
          event: priority === "RAPPEL_30_MIN" ? "form_submit_callback" : "form_submit_devis",
          lead_priority: priority
        });
        if (delivered.kind === "devis" && delivered.next === SUCCESS_URL) {
          window.StyleDecoAds?.registerQuote(form.dataset.submissionId);
        }
        if (photosLost) markPhotosLost(photosLost);
        redirect(delivered.next);
        return;
      }

      window.StyleDecoAudience?.sendFailed(form);
      setStatus(status, ERROR_MESSAGE);
      if (submit) {
        submit.disabled = false;
        submit.removeAttribute("aria-busy");
      }
      sending = false;
    });
  };

  window.StyleDecoLeadForm = { ERROR_MESSAGE, bindLeadForm };

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      document.querySelectorAll(".js-lead-form").forEach((form) => bindLeadForm(form));
    });
  }
})();
