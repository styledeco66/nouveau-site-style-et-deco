(() => {
  const FORM_MODE_KEY = "lead_form_mode_intent";
  const FORM_SELECTOR = ".js-lead-form";
  const DEFAULT_MODE = "devis";
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
    const nameInput = form.querySelector('input[name="name"]');
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
    if (nameInput) {
      if (nameInput.dataset.wasRequired === undefined) {
        nameInput.dataset.wasRequired = nameInput.required ? "1" : "0";
      }
      nameInput.required = !isCallbackMode && nameInput.dataset.wasRequired === "1";
    }

    setPriority(form, isCallbackMode);
    syncSubject(form, isCallbackMode ? "callback" : "devis");
  };

  const applyModeToAllForms = (mode) => {
    document.querySelectorAll(FORM_SELECTOR).forEach((form) => {
      applyModeToForm(form, mode);
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

  const pushFormSubmitEvent = (form) => {
    form.addEventListener("submit", () => {
      const hiddenPriority = form.querySelector('input[name="lead_priority"]');
      const priority = hiddenPriority && hiddenPriority.value === "RAPPEL_30_MIN" ? "RAPPEL_30_MIN" : "STANDARD";
      syncSubject(form, priority === "RAPPEL_30_MIN" ? "callback" : "devis");
      const eventName = priority === "RAPPEL_30_MIN" ? "form_submit_callback" : "form_submit_devis";

      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: eventName,
        lead_priority: priority
      });
    });
  };

  const initReviewsCarousel = () => {
    document.querySelectorAll(".js-reviews-carousel").forEach((carousel) => {
      const viewport = carousel.querySelector(".reviewsViewport");
      const track = carousel.querySelector(".reviewsTrack");
      const cards = Array.from(carousel.querySelectorAll(".reviewCard"));
      const dots = Array.from(carousel.querySelectorAll(".reviewsDot"));
      const prev = carousel.querySelector('.reviewsNav[data-dir="-1"]');
      const next = carousel.querySelector('.reviewsNav[data-dir="1"]');
      if (!viewport || !track || cards.length < 2) return;

      // Duplicate cards once to create a seamless forward loop.
      const loopFragment = document.createDocumentFragment();
      cards.forEach((card) => {
        loopFragment.appendChild(card.cloneNode(true));
      });
      track.appendChild(loopFragment);

      const getStep = () => {
        const first = cards[0];
        if (!first) return viewport.clientWidth;
        const style = window.getComputedStyle(track);
        const gap = parseFloat(style.columnGap || style.gap || "0") || 0;
        return first.getBoundingClientRect().width + gap;
      };

      const getCycleWidth = () => getStep() * cards.length;
      let isLoopAdjusting = false;

      const normalizeLoop = () => {
        if (isLoopAdjusting) return;
        const cycleWidth = getCycleWidth();
        if (cycleWidth <= 0) return;
        if (viewport.scrollLeft >= cycleWidth) {
          isLoopAdjusting = true;
          viewport.scrollLeft -= cycleWidth;
          window.requestAnimationFrame(() => {
            isLoopAdjusting = false;
          });
        }
      };

      const updateDots = () => {
        if (!dots.length) return;
        const step = getStep();
        const rawIndex = Math.round(viewport.scrollLeft / step);
        const index = ((rawIndex % cards.length) + cards.length) % cards.length;
        dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
      };

      const goToIndex = (index) => {
        const step = getStep();
        viewport.scrollTo({
          left: Math.max(0, Math.min(cards.length - 1, index)) * step,
          behavior: "smooth"
        });
      };

      if (prev) {
        prev.addEventListener("click", () => {
          const step = getStep();
          viewport.scrollBy({ left: -step, behavior: "smooth" });
        });
      }
      if (next) {
        next.addEventListener("click", () => {
          const step = getStep();
          viewport.scrollBy({ left: step, behavior: "smooth" });
        });
      }

      dots.forEach((dot) => {
        dot.addEventListener("click", () => {
          const index = Number(dot.dataset.index || "0");
          goToIndex(index);
        });
      });

      let autoTimer = null;
      const startAuto = () => {
        stopAuto();
        autoTimer = window.setInterval(() => {
          const step = getStep();
          viewport.scrollBy({ left: step, behavior: "smooth" });
        }, 4800);
      };
      const stopAuto = () => {
        if (autoTimer) {
          window.clearInterval(autoTimer);
          autoTimer = null;
        }
      };

      viewport.addEventListener("scroll", () => {
        normalizeLoop();
        updateDots();
      }, { passive: true });
      carousel.addEventListener("mouseenter", stopAuto);
      carousel.addEventListener("mouseleave", startAuto);
      carousel.addEventListener("touchstart", stopAuto, { passive: true });
      carousel.addEventListener("touchend", startAuto, { passive: true });

      updateDots();
      startAuto();
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

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(FORM_SELECTOR).forEach((form) => {
      bindFormPrioritySync(form);
      pushFormSubmitEvent(form);
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
        if (link.getAttribute("href") === "#contact") {
          applyModeToAllForms(mode);
        }
      });
    });

    document.querySelectorAll('[data-rappel-intent="true"][href="#contact"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        if (!window.matchMedia("(max-width: 720px)").matches) return;

        event.preventDefault();
        sessionStorage.setItem(FORM_MODE_KEY, "callback");
        applyModeToAllForms("callback");

        const contact = document.querySelector("#contact");
        if (!contact) return;

        const submitButton = contact.querySelector(".js-form-submit");
        window.requestAnimationFrame(() => {
          if (submitButton) {
            const rect = contact.getBoundingClientRect();
            const targetY = window.scrollY + rect.top - 120;
            window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
          } else {
            contact.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      });
    });

    document.querySelectorAll('[data-form-mode-intent="devis"][href="#contact"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        if (!window.matchMedia("(max-width: 720px)").matches) return;

        event.preventDefault();
        sessionStorage.setItem(FORM_MODE_KEY, "devis");
        applyModeToAllForms("devis");

        const contact = document.querySelector("#contact");
        if (!contact) return;

        window.requestAnimationFrame(() => {
          const rect = contact.getBoundingClientRect();
          const targetY = window.scrollY + rect.top - 120;
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

    if (window.location.hash === "#contact") {
      applyModeToAllForms(consumeModeFromStorage());
    }

    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#contact") {
        applyModeToAllForms(consumeModeFromStorage());
      }
    });

  });
})();
