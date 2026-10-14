(() => {
  const FORM_MODE_KEY = "lead_form_mode_intent";
  const FORM_SELECTOR = ".js-lead-form";
  const DEFAULT_MODE = "devis";
  const MOBILE_CONTACT_OFFSET = 170;
  const SUBJECT_DEVIS = "📩 DEMANDE DE DEVIS - Style & Deco";
  const SUBJECT_CALLBACK = "🚨 RAPPEL 30 MIN - Style & Deco";

  const getModeFromStorage = () => {
    const mode = sessionStorage.getItem(FORM_MODE_KEY);
    return mode === "callback" || mode === "devis" ? mode : DEFAULT_MODE;
  };

  const consumeModeFromStorage = () => {
    const mode = getModeFromStorage();
    sessionStorage.removeItem(FORM_MODE_KEY);
    return mode;
  };

  const setPriority = (form, isCallbackMode) => {
    const checkbox = form.querySelector('input[name="callback_30min"]');
    const hiddenPriority = form.querySelector('input[name="lead_priority"]');

    if (checkbox) {
      checkbox.checked = isCallbackMode || checkbox.checked;
    }
    if (hiddenPriority) {
      hiddenPriority.value = isCallbackMode || (checkbox && checkbox.checked) ? "RAPPEL_30_MIN" : "STANDARD";
    }
  };

  const syncSubject = (form, mode) => {
    const subjectInput = form.querySelector('input[name="subject"]');
    if (!subjectInput) return;
    subjectInput.value = mode === "callback" ? SUBJECT_CALLBACK : SUBJECT_DEVIS;
  };

  const syncRequiredState = (elements, enabled) => {
    elements.forEach((el) => {
      const controls = el.querySelectorAll("input, select, textarea");
      controls.forEach((control) => {
        if (control.dataset.wasRequired === undefined) {
          control.dataset.wasRequired = control.required ? "1" : "0";
        }
        control.disabled = !enabled;
        control.required = enabled && control.dataset.wasRequired === "1";
      });
    });
  };

  const applyModeToForm = (form, mode) => {
    const isCallbackMode = mode === "callback";
    const devisOnlyBlocks = form.querySelectorAll(".js-devis-only");
    const callbackOnlyBlocks = form.querySelectorAll(".js-callback-only");
    const callbackBadge = form.querySelector(".js-callback-badge");
    const modeSwitch = form.querySelector(".js-mode-switch");
    const title = form.querySelector(".js-form-title");
    const intro = form.querySelector(".js-form-intro");
    const submit = form.querySelector(".js-form-submit");
    const nameLabel = form.querySelector(".js-name-label");

    form.classList.toggle("form--callback-mode", isCallbackMode);

    devisOnlyBlocks.forEach((el) => el.classList.toggle("is-hidden", isCallbackMode));
    callbackOnlyBlocks.forEach((el) => el.classList.toggle("is-hidden", !isCallbackMode));
    syncRequiredState(devisOnlyBlocks, !isCallbackMode);
    syncRequiredState(callbackOnlyBlocks, isCallbackMode);

    if (callbackBadge) callbackBadge.classList.toggle("is-hidden", !isCallbackMode);
    if (modeSwitch) modeSwitch.classList.toggle("is-hidden", !isCallbackMode);

    if (title) {
      title.textContent = isCallbackMode ? title.dataset.titleCallback : title.dataset.titleDevis;
    }
    if (intro) {
      intro.textContent = isCallbackMode ? intro.dataset.introCallback : intro.dataset.introDevis;
    }
    if (submit) {
      submit.textContent = isCallbackMode ? submit.dataset.labelCallback : submit.dataset.labelDevis;
    }
    if (nameLabel) {
      nameLabel.textContent = isCallbackMode ? nameLabel.dataset.labelCallback : nameLabel.dataset.labelDevis;
    }

    setPriority(form, isCallbackMode);
    syncSubject(form, isCallbackMode ? "callback" : "devis");
  };

  const isModeManagedForm = (form) => Boolean(form.querySelector('input[name="lead_priority"]'));

  const applyModeToAllForms = (mode) => {
    document.querySelectorAll(FORM_SELECTOR).forEach((form) => {
      if (isModeManagedForm(form)) applyModeToForm(form, mode);
    });
  };

  const bindFormPrioritySync = (form) => {
    const checkbox = form.querySelector('input[name="callback_30min"]');
    const hiddenPriority = form.querySelector('input[name="lead_priority"]');
    if (!checkbox || !hiddenPriority) return;

    checkbox.addEventListener("change", () => {
      hiddenPriority.value = checkbox.checked ? "RAPPEL_30_MIN" : "STANDARD";
    });
  };

  // Avis clients : une carte à la fois, fondu progressif, navigation manuelle (boutons, points, clavier, balayage).
  // Amélioration progressive : sans JavaScript, le défilement horizontal d'origine reste utilisable.
  // Le défilement automatique est lent (durée proportionnelle à la longueur de l'avis), se met en pause au survol, au
  // focus, au toucher et sur demande, et n'existe pas lorsque l'utilisateur préfère réduire les animations.
  const initReviewsCarousel = () => {
    const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const DWELL_BASE_MS = 5000;
    const DWELL_PER_CHAR_MS = 50;
    const DWELL_MIN_MS = 9000;
    const DWELL_MAX_MS = 26000;
    const TOUCH_RESUME_MS = 8000;

    document.querySelectorAll(".js-reviews-carousel").forEach((carousel) => {
      const track = carousel.querySelector(".reviewsTrack");
      const slides = Array.from(carousel.querySelectorAll(".reviewCard"));
      if (!track || slides.length < 2) return;

      const controls = carousel.querySelector(".reviewsControls");
      const dots = Array.from(carousel.querySelectorAll(".reviewsDot"));
      const prevButton = carousel.querySelector('.reviewsNav[data-dir="-1"]');
      const nextButton = carousel.querySelector('.reviewsNav[data-dir="1"]');
      const pauseButton = carousel.querySelector(".reviewsPause");

      let index = 0;
      let timer = null;
      let touchTimer = null;
      let userPaused = false;
      let hovering = false;
      let focusInside = false;
      let touching = false;
      let offscreen = false;

      const reduced = () => Boolean(reduceQuery && reduceQuery.matches);
      // Durée de lecture : calculée sur le texte de l'avis (pas sur les espaces du balisage ni sur l'auteur).
      const readableLength = (slide) => {
        const parts = typeof slide.querySelectorAll === "function" ? Array.from(slide.querySelectorAll(".reviewCard__text")) : [];
        const text = parts.length ? parts.map((part) => part.textContent).join(" ") : slide.textContent;
        return text.trim().length;
      };
      const dwellFor = (slide) =>
        Math.min(DWELL_MAX_MS, Math.max(DWELL_MIN_MS, DWELL_BASE_MS + readableLength(slide) * DWELL_PER_CHAR_MS));
      const canAutoplay = () =>
        !reduced() && !userPaused && !hovering && !focusInside && !touching && !offscreen && !document.hidden;

      const render = () => {
        slides.forEach((slide, i) => {
          const active = i === index;
          slide.classList.toggle("is-active", active);
          slide.setAttribute("aria-hidden", active ? "false" : "true");
          if ("inert" in slide) slide.inert = !active;
        });
        dots.forEach((dot, i) => {
          if (i === index) dot.setAttribute("aria-current", "true");
          else dot.removeAttribute("aria-current");
        });
      };

      const restartProgress = (running, dwell) => {
        carousel.classList.remove("is-running");
        if (!running) return;
        carousel.style.setProperty("--reviews-dwell", `${dwell}ms`);
        void carousel.offsetWidth; // relance l'animation de la barre de progression
        carousel.classList.add("is-running");
      };

      const stop = () => {
        if (timer) {
          window.clearTimeout(timer);
          timer = null;
        }
        restartProgress(false);
        track.setAttribute("aria-live", "polite"); // annonce les changements demandés par l'utilisateur
      };

      const schedule = () => {
        stop();
        if (!canAutoplay()) return;
        const dwell = dwellFor(slides[index]);
        track.setAttribute("aria-live", "off"); // pas d'annonce répétée pendant le défilement automatique
        restartProgress(true, dwell);
        timer = window.setTimeout(() => {
          index = (index + 1) % slides.length;
          render();
          schedule();
        }, dwell);
      };

      const goTo = (target) => {
        index = ((target % slides.length) + slides.length) % slides.length;
        render();
        schedule();
      };

      const syncPauseButton = () => {
        if (!pauseButton) return;
        pauseButton.hidden = reduced();
        pauseButton.setAttribute("aria-pressed", userPaused ? "true" : "false");
        pauseButton.setAttribute(
          "aria-label",
          userPaused ? "Reprendre le défilement automatique des avis" : "Mettre en pause le défilement automatique des avis"
        );
        carousel.classList.toggle("is-user-paused", userPaused);
      };

      carousel.classList.add("is-enhanced");
      if (controls) controls.hidden = false;
      render();
      syncPauseButton();

      if (prevButton) prevButton.addEventListener("click", () => goTo(index - 1));
      if (nextButton) nextButton.addEventListener("click", () => goTo(index + 1));
      dots.forEach((dot, i) => dot.addEventListener("click", () => goTo(i)));
      if (pauseButton) {
        pauseButton.addEventListener("click", () => {
          userPaused = !userPaused;
          syncPauseButton();
          schedule();
        });
      }

      carousel.addEventListener("keydown", (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const keys = { ArrowLeft: () => goTo(index - 1), ArrowRight: () => goTo(index + 1), Home: () => goTo(0), End: () => goTo(slides.length - 1) };
        if (!keys[event.key]) return;
        event.preventDefault();
        keys[event.key]();
      });

      // Pause pendant toute interaction : survol, focus clavier, toucher.
      carousel.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "mouse") return; // un toucher n'est pas un survol durable
        hovering = true;
        schedule();
      });
      carousel.addEventListener("pointerleave", (event) => {
        if (event.pointerType !== "mouse") return;
        hovering = false;
        schedule();
      });
      carousel.addEventListener("focusin", () => { focusInside = true; schedule(); });
      carousel.addEventListener("focusout", (event) => {
        if (event.relatedTarget && carousel.contains(event.relatedTarget)) return;
        focusInside = false;
        schedule();
      });

      let touchStartX = 0;
      let touchStartY = 0;
      carousel.addEventListener("touchstart", (event) => {
        const point = event.touches && event.touches[0];
        if (point) {
          touchStartX = point.clientX;
          touchStartY = point.clientY;
        }
        touching = true;
        if (touchTimer) window.clearTimeout(touchTimer);
        schedule();
      }, { passive: true });
      carousel.addEventListener("touchend", (event) => {
        const point = event.changedTouches && event.changedTouches[0];
        if (point) {
          const dx = point.clientX - touchStartX;
          const dy = point.clientY - touchStartY;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) goTo(dx < 0 ? index + 1 : index - 1);
        }
        if (touchTimer) window.clearTimeout(touchTimer);
        touchTimer = window.setTimeout(() => {
          touching = false;
          schedule();
        }, TOUCH_RESUME_MS);
      }, { passive: true });

      document.addEventListener("visibilitychange", schedule);
      if (reduceQuery && typeof reduceQuery.addEventListener === "function") {
        reduceQuery.addEventListener("change", () => {
          syncPauseButton();
          schedule();
        });
      }
      if ("IntersectionObserver" in window) {
        new IntersectionObserver((entries) => {
          offscreen = !entries.some((entry) => entry.isIntersecting);
          schedule();
        }, { threshold: 0.2 }).observe(carousel);
      }

      schedule();
    });
  };

  const initScrollReveal = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    const sections = ["#avis", "#realisations"]
      .map((selector) => document.querySelector(selector))
      .filter(Boolean);
    sections.forEach((section, i) => {
      section.classList.add("reveal-item");
      section.classList.add("reveal-cinematic");
      section.style.setProperty("--reveal-delay", `${i * 50}ms`);
    });

    const serviceCards = Array.from(document.querySelectorAll("#services .card"));
    serviceCards.forEach((card, i) => {
      card.classList.add("reveal-item");
      card.style.setProperty("--reveal-delay", `${80 + (i * 90)}ms`);
    });

    const processSteps = Array.from(document.querySelectorAll("#process .step"));
    processSteps.forEach((step, i) => {
      step.classList.add("reveal-item");
      step.style.setProperty("--reveal-delay", `${80 + (i * 100)}ms`);
    });

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      });
    }, {
      threshold: isMobile ? 0.08 : 0.12,
      rootMargin: isMobile ? "0px 0px -4% 0px" : "0px 0px -8% 0px"
    });

    document.querySelectorAll(".reveal-item").forEach((el) => {
      observer.observe(el);
    });
  };

  const initHeroParallax = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(max-width: 720px)").matches) return;

    const hero = document.querySelector(".hero");
    const bgBlend = hero && hero.querySelector(".hero__bgBlend");
    if (!hero || !bgBlend) return;

    let rafId = null;

    const update = () => {
      rafId = null;
      const rect = hero.getBoundingClientRect();
      const factor = 0.032;
      const limit = 14; // subtle but clearly visible
      const offset = Math.max(-limit, Math.min(limit, -rect.top * factor));
      bgBlend.style.setProperty("--hero-parallax", `${offset.toFixed(2)}px`);
    };

    const onScrollOrResize = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    update();
  };

  const initBeforeAfterSliders = () => {
    document.querySelectorAll(".js-compare").forEach((compare) => {
      const range = compare.querySelector(".js-compare-range");
      if (!range) return;

      const update = () => {
        compare.style.setProperty("--compare", `${range.value}%`);
      };

      range.addEventListener("input", update, { passive: true });
      update();
    });
  };

  const initKpiCounters = () => {
    const counters = Array.from(document.querySelectorAll(".js-kpi-counter"));
    if (!counters.length) return;

    const formatValue = (value, decimals) => {
      if (decimals > 0) {
        return value.toFixed(decimals).replace(".", ",");
      }
      return String(Math.round(value));
    };

    const render = (el, value) => {
      const prefix = el.dataset.prefix || "";
      const suffix = el.dataset.suffix || "";
      const decimals = Number(el.dataset.decimals || "0");
      el.textContent = `${prefix}${formatValue(value, decimals)}${suffix}`;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      counters.forEach((el) => {
        const target = Number(el.dataset.value || "0");
        render(el, target);
      });
      return;
    }

    const animateCounter = (el) => {
      const target = Number(el.dataset.value || "0");
      const duration = 700;
      const start = performance.now();

      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        render(el, target * eased);
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          render(el, target);
        }
      };
      requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCounter(entry.target);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.4 });

    counters.forEach((el) => observer.observe(el));
  };

  const initMobileMenu = () => {
    const toggle = document.querySelector(".mobileMenuToggle");
    const menu = document.querySelector(".mobileMenu");
    if (!toggle || !menu) return;

    const closeMenu = () => {
      toggle.classList.remove("is-open");
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      menu.hidden = true;
    };

    const openMenu = () => {
      toggle.classList.add("is-open");
      menu.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      menu.hidden = false;
    };

    toggle.addEventListener("click", () => {
      const isOpen = toggle.classList.contains("is-open");
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });

    window.addEventListener("resize", () => {
      if (!window.matchMedia("(max-width: 720px)").matches) {
        closeMenu();
      }
    });
  };

  const moveHeroFormBelowReviewsOnMobile = () => {
    if (!window.matchMedia("(max-width: 720px)").matches) return;
    const heroForm = document.querySelector("#contact.hero__visual");
    const reviews = document.querySelector("#avis");
    if (!heroForm || !reviews) return;
    reviews.insertAdjacentElement("afterend", heroForm);
  };

  const flashFocusedForm = (container) => {
    if (!container) return;
    const form = container.matches("form") ? container : container.querySelector(".js-lead-form");
    if (!form) return;
    form.classList.remove("form--focus-glow");
    void form.offsetWidth; // restart animation if already applied
    form.classList.add("form--focus-glow");
    window.setTimeout(() => {
      form.classList.remove("form--focus-glow");
    }, 1400);
  };

  document.addEventListener("DOMContentLoaded", () => {
    moveHeroFormBelowReviewsOnMobile();

    document.querySelectorAll(FORM_SELECTOR).forEach((form) => {
      bindFormPrioritySync(form);
    });

    document.querySelectorAll(".js-mode-switch").forEach((button) => {
      button.addEventListener("click", () => {
        sessionStorage.setItem(FORM_MODE_KEY, "devis");
        applyModeToAllForms("devis");
      });
    });

    document.querySelectorAll("[data-form-mode-intent]").forEach((link) => {
      link.addEventListener("click", () => {
        const mode = link.getAttribute("data-form-mode-intent") === "callback" ? "callback" : "devis";
        sessionStorage.setItem(FORM_MODE_KEY, mode);
        if (link.getAttribute("href") === "#contact" || link.getAttribute("href") === "#contact-details") {
          applyModeToAllForms(mode);
        }
      });
    });

    document.querySelectorAll('[data-rappel-intent="true"][href="#contact"], [data-rappel-intent="true"][href="#contact-details"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        if (!window.matchMedia("(max-width: 720px)").matches) return;

        event.preventDefault();
        sessionStorage.setItem(FORM_MODE_KEY, "callback");
        applyModeToAllForms("callback");

        const targetSelector = link.getAttribute("href") === "#contact-details" ? "#contact-details" : "#contact";
        const contact = document.querySelector(targetSelector);
        if (!contact) return;
        flashFocusedForm(contact);

        const submitButton = contact.querySelector(".js-form-submit");
        window.requestAnimationFrame(() => {
          if (submitButton) {
            const rect = contact.getBoundingClientRect();
            const targetY = window.scrollY + rect.top - MOBILE_CONTACT_OFFSET;
            window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
          } else {
            contact.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      });
    });

    document.querySelectorAll('[data-form-mode-intent="devis"][href="#contact"], [data-form-mode-intent="devis"][href="#contact-details"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        if (!window.matchMedia("(max-width: 720px)").matches) return;

        event.preventDefault();
        sessionStorage.setItem(FORM_MODE_KEY, "devis");
        applyModeToAllForms("devis");

        const targetSelector = link.getAttribute("href") === "#contact-details" ? "#contact-details" : "#contact";
        const contact = document.querySelector(targetSelector);
        if (!contact) return;
        flashFocusedForm(contact);

        window.requestAnimationFrame(() => {
          const rect = contact.getBoundingClientRect();
          const targetY = window.scrollY + rect.top - MOBILE_CONTACT_OFFSET;
          window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
        });
      });
    });

    applyModeToAllForms(DEFAULT_MODE);
    initReviewsCarousel();
    initScrollReveal();
    initHeroParallax();
    initBeforeAfterSliders();
    initKpiCounters();
    initMobileMenu();

    if (window.location.hash === "#contact" || window.location.hash === "#contact-details") {
      applyModeToAllForms(consumeModeFromStorage());
    }

    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#contact" || window.location.hash === "#contact-details") {
        applyModeToAllForms(consumeModeFromStorage());
      }
    });

  });
})();
