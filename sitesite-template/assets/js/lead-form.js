(() => {
  const ENDPOINT = "/.netlify/functions/lead";
  const SUCCESS_URL = "/merci.html";
  // Seules les pages de confirmation du site sont acceptées comme destination (la réponse du serveur est la source).
  const SUCCESS_PATTERN = /^\/merci(?:-rappel)?\.html(?:\?s=[0-9]{2,8})?$/;
  const REQUEST_TIMEOUT_MS = 15000;
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
  const deliver = async (fetchImpl, payload) => {
    try {
      const response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
      });
      if (!response.ok) return null;
      const result = await response.json();
      if (!result || result.ok !== true) return null;
      return { next: typeof result.next === "string" && SUCCESS_PATTERN.test(result.next) ? result.next : SUCCESS_URL };
    } catch (error) {
      return null;
    }
  };

  const setStatus = (status, message) => {
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
  };

  const bindLeadForm = (form, deps = {}) => {
    const fetchImpl = deps.fetchImpl || ((...args) => window.fetch(...args));
    const redirect = deps.redirect || ((url) => window.location.assign(url));
    const readForm = deps.formData ? (target) => Object.fromEntries(deps.formData(target)) : readFields;
    const pushEvent = (payload) => {
      const layer = deps.dataLayer || (window.dataLayer = window.dataLayer || []);
      layer.push(payload);
    };
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
      const fingerprint = JSON.stringify(fields);
      if (!form.dataset.submissionId || form.dataset.submissionFingerprint !== fingerprint) {
        form.dataset.submissionId = newSubmissionId();
        form.dataset.submissionFingerprint = fingerprint;
      }
      const delivered = await deliver(fetchImpl, { ...fields, submission_id: form.dataset.submissionId });

      if (delivered) {
        const priority = fields.lead_priority === "RAPPEL_30_MIN" ? "RAPPEL_30_MIN" : "STANDARD";
        pushEvent({
          event: priority === "RAPPEL_30_MIN" ? "form_submit_callback" : "form_submit_devis",
          lead_priority: priority
        });
        redirect(delivered.next);
        return;
      }

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
