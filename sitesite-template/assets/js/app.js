/*
 * Style & Déco : interactions du site.
 * - Horaires et textes de rappel : assets/js/business-hours.js (source unique, heure de Paris).
 * - Envoi des formulaires : assets/js/lead-form.js (fonction Netlify « lead »). Ce fichier ne fait que préparer les
 *   formulaires (mode rappel / devis, validation lisible) ; il n'envoie rien lui-même.
 */
(function(){
  "use strict";
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var horaires = window.StyleDecoHours || null;
  var promesseActuelle = "sous 30 min";

  /* Textes de rappel : une seule source (business-hours.js). Estimation d'affichage : le serveur décide du créneau réel. */
  function copieRappel(){
    if (!horaires) return null;
    try { return horaires.describe(horaires.callbackSlot(new Date())); } catch (e) { return null; }
  }

  /* Validation lisible (le serveur revalide tout) */
  var TEL_OK = /^\+?[0-9 .()\-]{6,25}$/;
  function telValide(v){ v = v.trim(); return TEL_OK.test(v) && v.replace(/\D/g, "").length >= 9 && v.replace(/\D/g, "").length <= 15; }
  function mailValide(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
  function rempli(v){ return v.trim().length > 1; }

  /* Statut d'ouverture (bandeau du haut) : heure de Paris, jours fériés et fermetures compris */
  function majStatut(){
    var now = new Date(), ouvert = false, rapide = false, copie = copieRappel();
    if (horaires){ try { ouvert = horaires.isOpen(now); rapide = horaires.callbackSlot(now).within30; } catch (e) {} }
    var quand = copie ? copie.pill.replace(/^Rappel /, "") : "sous 30 min";
    promesseActuelle = quand;
    var titre, sous, court;
    if (rapide){ titre = "On décroche maintenant."; sous = "Rappel sous 30 min si vous laissez votre numéro."; court = "Disponible maintenant"; }
    else if (ouvert){ titre = "Ouvert jusqu'à 18 h."; sous = "Rappel " + quand + "."; court = "Disponible jusqu'à 18 h"; }
    else { titre = "Demandez votre rappel gratuit."; sous = "Nous vous rappelons " + quand + "."; court = "Vous rappelle " + quand; }
    document.documentElement.classList.toggle("is-open", ouvert);
    var t = $(".js-statut-titre"), s = $(".js-statut-sous");
    if (t) t.textContent = titre;
    if (s) s.textContent = sous;
    $$(".js-statut-court").forEach(function(e){ e.textContent = court; });
    $$(".js-promesse").forEach(function(e){ e.textContent = promesseActuelle; });
    $$("[data-callback-text]").forEach(function(e){ if (copie && copie[e.getAttribute("data-callback-text")]) e.textContent = copie[e.getAttribute("data-callback-text")]; });
    /* Le formulaire de contact en mode rappel suit le créneau (ouverture, 17 h 30, minuit) */
    if (formContact && formContact.classList.contains("form--callback-mode")) appliquerMode(formContact, "callback");
  }
  majStatut(); setInterval(majStatut, 60000);
  document.addEventListener("visibilitychange", function(){ if (!document.hidden) majStatut(); });

  /* ---------- Formulaires : validation lisible avant l'envoi (lead-form.js envoie, le serveur revalide) ---------- */
  var SUJET_DEVIS = "📩 DEMANDE DE DEVIS - Style & Deco";
  var SUJET_RAPPEL = "[RAPPEL CLIENT] Nouveau rappel à effectuer";

  function enRappel(form){ return form.getAttribute("data-fixed-mode") === "callback" || form.classList.contains("form--callback-mode"); }
  function champ(form, nom){ return form.querySelector('[name="' + nom + '"]'); }

  function verifier(form){
    var zone = $(".js-form-status", form);
    $$("[aria-invalid]", form).forEach(function(c){ c.removeAttribute("aria-invalid"); });
    var rappel = enRappel(form);
    var regles = [
      ["name", rempli, "Indiquez votre nom pour que nous sachions qui rappeler."],
      ["phone", telValide, "Numéro incomplet : au moins 9 chiffres, par exemple 06 12 34 56 78."]
    ];
    if (rappel) regles.push(["email", function(v){ return !v.trim() || mailValide(v); }, "Cet e-mail ne semble pas valide."]);
    else regles.push(
      ["email", mailValide, "Indiquez un e-mail valide pour recevoir votre devis."],
      ["city", rempli, "Indiquez la ville des travaux."],
      ["details", function(v){ return v.trim().length > 5; }, "Décrivez votre projet en quelques mots : surface, support, délai."]
    );
    for (var i = 0; i < regles.length; i++){
      var c = champ(form, regles[i][0]);
      if (!c || c.disabled) continue;
      if (!regles[i][1](c.value)){
        c.setAttribute("aria-invalid", "true");
        if (zone){ zone.textContent = regles[i][2]; zone.hidden = false; }
        c.focus();
        return false;
      }
    }
    if (zone) zone.hidden = true;
    return true;
  }

  $$(".js-lead-form").forEach(function(form){
    form.setAttribute("novalidate", "");
    /* Phase de capture : un formulaire invalide n'atteint jamais l'envoi de lead-form.js */
    form.addEventListener("submit", function(e){ if (!verifier(form)){ e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    form.addEventListener("input", function(e){ if (e.target.removeAttribute) e.target.removeAttribute("aria-invalid"); });
  });

  /* Formulaire de contact : mode rappel ou devis (mêmes règles que le formulaire d'origine) */
  var boite = $(".js-formulaire"), formContact = boite ? $(".js-lead-form", boite) : null;

  function syncRequis(blocs, actif){
    blocs.forEach(function(el){
      $$("input, select, textarea", el).forEach(function(c){
        if (c.dataset.wasRequired === undefined) c.dataset.wasRequired = c.required ? "1" : "0";
        c.disabled = !actif; c.required = actif && c.dataset.wasRequired === "1";
      });
    });
  }
  function syncFacultatifs(blocs, rappel){
    blocs.forEach(function(el){
      $$("input, select, textarea", el).forEach(function(c){
        if (c.dataset.wasRequired === undefined) c.dataset.wasRequired = c.required ? "1" : "0";
        c.required = !rappel && c.dataset.wasRequired === "1";
      });
    });
  }
  function appliquerMode(form, mode){
    var rappel = mode === "callback";
    var devisSeul = $$(".js-devis-only", form), devisCache = $$(".js-devis-required", form), mails = $$(".js-email-field", form);
    form.classList.toggle("form--callback-mode", rappel);
    devisSeul.forEach(function(el){ el.classList.toggle("is-hidden", rappel); });
    devisCache.forEach(function(el){ el.classList.toggle("is-hidden", rappel); });
    syncRequis(devisSeul, !rappel);
    syncFacultatifs(devisCache, rappel);
    syncFacultatifs(mails, rappel);
    mails.forEach(function(el){
      var l = $(".js-email-label", el);
      if (l) l.textContent = rappel ? l.dataset.labelCallback : l.dataset.labelDevis;
    });
    var copie = rappel ? copieRappel() : null;
    var titre = $(".js-form-title", form.parentNode) || $(".js-form-title"), intro = $(".js-form-intro", form.parentNode) || $(".js-form-intro");
    var bouton = $(".js-form-submit", form), nom = $(".js-name-label", form);
    if (titre) titre.textContent = rappel ? ((copie && copie.title) || titre.dataset.titleCallback) : titre.dataset.titleDevis;
    if (intro) intro.textContent = rappel ? ((copie && copie.intro) || intro.dataset.introCallback) : intro.dataset.introDevis;
    if (bouton) bouton.textContent = rappel ? bouton.dataset.labelCallback : bouton.dataset.labelDevis;
    if (nom) nom.textContent = rappel ? nom.dataset.labelCallback : nom.dataset.labelDevis;
    var priorite = champ(form, "lead_priority"), sujet = champ(form, "subject");
    if (priorite) priorite.value = rappel ? "RAPPEL_30_MIN" : "STANDARD";
    if (sujet) sujet.value = rappel ? SUJET_RAPPEL : SUJET_DEVIS;
    if (boite){
      boite.dataset.mode = rappel ? "rappel" : "devis";
      $$(".onglets button", boite).forEach(function(b){ b.setAttribute("aria-selected", (b.dataset.mode === "rappel") === rappel ? "true" : "false"); });
      var panneau = $(".js-panneau", boite);
      if (panneau) panneau.setAttribute("aria-labelledby", rappel ? "tab-rappel" : "tab-devis");
    }
    var zone = $(".js-form-status", form); if (zone) zone.hidden = true;
  }
  if (formContact){
    $$(".onglets button", boite).forEach(function(b){ b.addEventListener("click", function(){ appliquerMode(formContact, b.dataset.mode === "rappel" ? "callback" : "devis"); }); });
    appliquerMode(formContact, "callback");
    /* Tout bouton « devis » ouvre l'onglet devis, avec le projet déjà indiqué s'il y en a un */
    $$(".js-devis").forEach(function(a){
      a.addEventListener("click", function(){
        appliquerMode(formContact, "devis");
        var d = champ(formContact, "details");
        if (d && a.dataset.projet && !d.value.trim()) d.value = "Projet : " + a.dataset.projet + ".\n";
        setTimeout(function(){ var n = champ(formContact, "name"); if (n) n.focus({preventScroll:true}); }, reduit ? 0 : 600);
      });
    });
  }
  /* Liens du site actuel vers un formulaire en mode rappel */
  $$('[data-form-mode-intent="callback"]').forEach(function(a){ a.addEventListener("click", function(){ if (formContact) appliquerMode(formContact, "callback"); }); });
  $$('[data-form-mode-intent="devis"]').forEach(function(a){ a.addEventListener("click", function(){ if (formContact) appliquerMode(formContact, "devis"); }); });

  /* Menu mobile */
  var burger = $(".js-burger"), menu = $(".js-menu");
  if (burger && menu){
    function fermerMenu(){ menu.hidden = true; burger.setAttribute("aria-expanded", "false"); burger.setAttribute("aria-label", "Ouvrir le menu"); }
    burger.addEventListener("click", function(){
      var ouvrir = menu.hidden;
      menu.hidden = !ouvrir; burger.setAttribute("aria-expanded", String(ouvrir)); burger.setAttribute("aria-label", ouvrir ? "Fermer le menu" : "Ouvrir le menu");
    });
    $$("a", menu).forEach(function(l){ l.addEventListener("click", fermerMenu); });
    document.addEventListener("keydown", function(e){ if (e.key === "Escape") fermerMenu(); });
  }

  /* Zones d'intervention : la liste des communes et la carte se répondent au survol */
  $$(".js-zone").forEach(function(zone){
    var carteZone = $(".carte", zone), points = $$(".pt", zone), items = $$(".communes__liste li", zone);
    var routes = $$(".trajet", zone), defaut = $(".trajet--defaut", zone), info = $(".js-carte-info", zone);
    routes.forEach(function(t){ t.style.setProperty("--l", Math.ceil(t.getTotalLength()) + 2); });
    function majInfo(t){
      if (!info || !t) return;
      $(".js-carte-dest", info).textContent = t.dataset.c;
      $(".js-carte-detail", info).textContent = t.dataset.km + " km, environ " + t.dataset.min + " min";
    }
    /* Le trajet par défaut (vers Perpignan) se dessine quand la carte arrive à l'écran */
    if (reduit || !("IntersectionObserver" in window)) carteZone.classList.add("is-pret");
    else {
      var oc = new IntersectionObserver(function(es){ if (es[0].isIntersecting){ carteZone.classList.add("is-pret"); oc.disconnect(); } }, {threshold:.35});
      oc.observe(carteZone);
    }
    function allumer(nom, on){
      var route = routes.filter(function(t){ return t.dataset.c === nom; })[0];
      if (route){
        route.classList.toggle("is-actif", on);
        if (defaut && route !== defaut) defaut.classList.toggle("masque", on);
        majInfo(on ? route : defaut);
      }
      if (nom === "littoral"){ carteZone.classList.toggle("is-littoral", on); }
      points.forEach(function(p){
        var cible = nom === "voisines" ? !p.classList.contains("attenue") && !p.classList.contains("base") && !p.classList.contains("ville") : p.dataset.c === nom;
        if (cible) p.classList.toggle("is-actif", on);
      });
      items.forEach(function(li){ if (li.dataset.c === nom) li.classList.toggle("is-actif", on); });
    }
    items.forEach(function(li){
      li.addEventListener("mouseenter", function(){ allumer(li.dataset.c, true); });
      li.addEventListener("mouseleave", function(){ allumer(li.dataset.c, false); });
    });
    points.forEach(function(p){
      p.addEventListener("mouseenter", function(){ allumer(p.dataset.c, true); });
      p.addEventListener("mouseleave", function(){ allumer(p.dataset.c, false); });
    });
  });

  /* Fiches chantier : barre de lecture orange en haut de l'écran */
  var barreLecture = $(".js-lecture");
  if (barreLecture){
    var lectureAttente = false;
    function majLecture(){
      var max = document.documentElement.scrollHeight - window.innerHeight;
      barreLecture.style.transform = "scaleX(" + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ")";
    }
    window.addEventListener("scroll", function(){
      if (lectureAttente) return; lectureAttente = true;
      requestAnimationFrame(function(){ lectureAttente = false; majLecture(); });
    }, {passive:true});
    majLecture();
  }

  /* Listes d'engagements et protocoles : les éléments s'allument l'un après l'autre */
  $$(".js-pourquoi, .js-etapes-num, .js-lignes, .js-fiche-diag, .js-engage, .js-dossier").forEach(function(liste){
    var pas = liste.classList.contains("js-pourquoi") || liste.classList.contains("js-etapes-num") ? 0.09 : 0.22;
    $$("li, .ligne", liste).forEach(function(li, k){ li.style.setProperty("--d", (k * pas) + "s"); });
    if (reduit || !("IntersectionObserver" in window)){ liste.classList.add("is-vu"); return; }
    /* Déjà à l'écran au chargement : affiché directement. Plus bas : l'animation joue à son arrivée. */
    if (liste.getBoundingClientRect().top < window.innerHeight * 0.85){ liste.classList.add("is-vu"); return; }
    liste.classList.add("attente");
    var o = new IntersectionObserver(function(es){ if (es[0].isIntersecting){ liste.classList.add("is-vu"); o.disconnect(); } }, {threshold:.2});
    o.observe(liste);
  });

  /* Assurances : le titre se surligne et les documents s'animent en boucle tant qu'ils sont à l'écran,
     de la même façon sur toutes les pages qui ont cette section. */
  var assur = document.getElementById("assurances");
  if (assur && !reduit && "IntersectionObserver" in window){
    var titre = document.getElementById("titre-assurances"), cible = "nous vous le prouvons";
    var texte = titre ? titre.textContent : "", ou = texte.indexOf(cible);
    if (ou >= 0 && !titre.children.length){
      var bloc = document.createElement("span");
      bloc.className = "prouve";
      cible.split(" ").forEach(function(mot, i, mots){
        var m = document.createElement("span");
        m.className = "prouve__mot";
        m.style.setProperty("--i", i);
        m.textContent = mot + (i < mots.length - 1 ? " " : "");
        bloc.appendChild(m);
      });
      var coche = document.createElement("span");
      coche.className = "prouve__coche";
      coche.setAttribute("aria-hidden", "true");
      bloc.appendChild(coche);
      titre.textContent = texte.slice(0, ou);
      titre.appendChild(bloc);
      titre.appendChild(document.createTextNode(texte.slice(ou + cible.length)));
      /* rejoue à chaque retour à l'écran */
      new IntersectionObserver(function(es){ bloc.classList.toggle("is-prouve", es[0].isIntersecting); }, {threshold:.6}).observe(bloc);
    }
    var dossier = assur.querySelector(".js-dossier"), depart;
    if (dossier){
      dossier.classList.add("dossier--vivant");
      new IntersectionObserver(function(es){
        var visible = es[0].isIntersecting;
        clearTimeout(depart);
        dossier.classList.toggle("en-pause", !visible);
        /* la boucle commence une fois les feuilles déployées */
        if (visible && !dossier.classList.contains("is-anime")) depart = setTimeout(function(){ dossier.classList.add("is-anime"); }, 650);
      }, {threshold:.35}).observe(dossier);
    }
  }

  /* Photos de chantiers en fond du héros */
  var fonds = $$(".js-fond img"), iFond = 0;
  if (!reduit && fonds.length > 1){
    setInterval(function(){
      fonds[iFond].classList.remove("is-on");
      iFond = (iFond + 1) % fonds.length;
      fonds[iFond].classList.add("is-on");
      $(".js-fond-legende").textContent = fonds[iFond].dataset.legende;
    }, 7000);
  }

  /* Réalisations : vignettes */
  $$(".js-cas").forEach(function(cas){
    var principale = $(".js-cas-img", cas), legende = $(".js-cas-legende", cas);
    $$(".vignette", cas).forEach(function(v){
      v.addEventListener("click", function(){
        $$(".vignette", cas).forEach(function(x){ x.setAttribute("aria-pressed", x === v ? "true" : "false"); });
        principale.classList.add("is-sortie");
        setTimeout(function(){
          principale.src = v.dataset.src; principale.alt = v.dataset.legende; legende.textContent = v.dataset.legende;
          principale.classList.remove("is-sortie");
        }, reduit ? 0 : 200);
      });
    });
  });

  /* Craintes barrées : chaque trait avance au rythme du défilement.
     Il démarre quand la ligne entre en bas de l'écran (90 % de la hauteur)
     et se termine quand elle atteint le milieu (45 %). */
  var lignes = $$(".js-jamais li");
  function tracer(){
    var h = window.innerHeight;
    lignes.forEach(function(l){
      var y = l.getBoundingClientRect().top + l.offsetHeight / 2;
      var p = Math.min(1, Math.max(0, (h * .9 - y) / (h * .45)));
      l.style.setProperty("--p", p.toFixed(3));
    });
  }
  if (reduit){ lignes.forEach(function(l){ l.style.setProperty("--p", "1"); }); }
  else {
    var enAttente = false;
    window.addEventListener("scroll", function(){
      if (enAttente) return; enAttente = true;
      requestAnimationFrame(function(){ enAttente = false; tracer(); });
    }, {passive:true});
    window.addEventListener("resize", tracer);
    tracer();
  }

  /* Chantier au scroll */
  var blocs = $$(".etape-bloc"), images = $$(".js-visuel img");
  function active(n){
    blocs.forEach(function(b, k){ b.classList.toggle("is-on", k === n); });
    images.forEach(function(im, k){ im.classList.toggle("is-on", k === n); });
    $(".js-compteur").textContent = "Étape " + (n + 1) + " sur " + blocs.length;
  }
  var ecranEtroit = window.matchMedia("(max-width: 1000px)");
  if ("IntersectionObserver" in window){
    var io2 = new IntersectionObserver(function(es){ if (ecranEtroit.matches) return; es.forEach(function(e){ if (e.isIntersecting) active(blocs.indexOf(e.target)); }); }, {rootMargin:"-45% 0px -45% 0px"});
    blocs.forEach(function(b){ io2.observe(b); });
  }
  /* Téléphone et tablette : la photo reste en haut ; l'étape active est la dernière dont le début est passé sous la photo */
  var visuelFixe = $(".js-visuel"), etapeAttente = false;
  function majEtapeEtroit(){
    if (!ecranEtroit.matches || !visuelFixe || !blocs.length) return;
    var ligne = visuelFixe.getBoundingClientRect().bottom + 90, n = 0;
    blocs.forEach(function(b, k){ if (b.getBoundingClientRect().top <= ligne) n = k; });
    active(n);
  }
  if (blocs.length && visuelFixe){
    window.addEventListener("scroll", function(){
      if (etapeAttente) return; etapeAttente = true;
      requestAnimationFrame(function(){ etapeAttente = false; majEtapeEtroit(); });
    }, {passive:true});
    window.addEventListener("resize", majEtapeEtroit);
    majEtapeEtroit();
  }

  /* Chiffres du héros : comptage jusqu'à la valeur finale (déjà écrite dans la page) */
  if (!reduit){
    $$(".chiffres strong").forEach(function(el){
      var m = el.textContent.match(/^(\d+)((?:\s.*)?)$/); if (!m) return;
      var fin = Number(m[1]), suite = m[2], t0 = null, duree = 1400;
      var debut = Math.round(fin * .6); el.textContent = debut + suite;
      setTimeout(function(){
        requestAnimationFrame(function pas(t){
          if (t0 === null) t0 = t;
          var k = Math.min(1, (t - t0) / duree), e = 1 - Math.pow(1 - k, 3);
          el.textContent = Math.round(debut + e * (fin - debut)) + suite;
          if (k < 1) requestAnimationFrame(pas);
        });
      }, 400);
    });
  }

  /* Téléphone : zoom des photos à l'arrivée et frise de la méthode */
  var petit = window.matchMedia("(max-width: 1000px)");
  if (!reduit && "IntersectionObserver" in window){
    var photos = $$(".tuile img, .etape-bloc img, .autre img, .recit__photos img, .chantier__photo img");
    photos.forEach(function(im){ im.classList.add("anim-zoom"); });
    var io3 = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting){ e.target.classList.add("is-visible"); io3.unobserve(e.target); } }); }, {threshold:.2});
    photos.forEach(function(im){ io3.observe(im); });
  }
  var frise = $(".etapes__liste"), etapesMobile = $$(".etape-bloc");
  function majFrise(){
    if (!frise || !petit.matches) return;
    var h = window.innerHeight, r = frise.getBoundingClientRect();
    var p = reduit ? 1 : Math.min(1, Math.max(0, (h * .6 - r.top) / r.height));
    frise.style.setProperty("--fill", p.toFixed(3));
    etapesMobile.forEach(function(b){ b.classList.toggle("is-passe", reduit || b.getBoundingClientRect().top + 30 < h * .6); });
  }
  var friseAttente = false;
  window.addEventListener("scroll", function(){
    if (friseAttente) return; friseAttente = true;
    requestAnimationFrame(function(){ friseAttente = false; majFrise(); });
  }, {passive:true});
  window.addEventListener("resize", majFrise);
  majFrise();

  if ($(".js-dialog")) {
  /* Appel : compose sur mobile, fenêtre (numéro + rappel) sur ordinateur */
  var dlg = $(".js-dialog"), tactile = window.matchMedia("(pointer: coarse)").matches;
  function ouvrir(focusRappel){
    var z = $(".js-form-status", dlg); if (z) z.hidden = true;
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    if (focusRappel){ var n = champ(dlg, "name"); if (n) n.focus(); }
  }
  $$(".js-appel").forEach(function(a){ a.addEventListener("click", function(e){ if (!tactile){ e.preventDefault(); ouvrir(false); } }); });
  $$(".js-ouvrir-rappel").forEach(function(b){ b.addEventListener("click", function(){ ouvrir(true); }); });
  $(".js-fermer").addEventListener("click", function(){ dlg.close(); });
  dlg.addEventListener("click", function(e){ if (e.target === dlg) dlg.close(); });
  $(".js-copier").addEventListener("click", function(){
    var b = this;
    function ok(){ b.textContent = "Numéro copié"; setTimeout(function(){ b.textContent = "Copier le numéro"; }, 2000); }
    function choisir(){ var r = document.createRange(); r.selectNodeContents($(".dlg .numero")); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    try { navigator.clipboard.writeText($(".dlg .numero").textContent.trim()).then(ok, choisir); } catch(_){ choisir(); }
  });
  }

  /* Bouton flottant et barre mobile : après le héros, cachés sur la section contact */
  var horsHeros = false, dansContact = false;
  function majFlottants(){ var on = horsHeros && !dansContact; $(".js-flottant").classList.toggle("is-on", on); $(".js-barre-mobile").classList.toggle("is-on", on); }
  if ("IntersectionObserver" in window){
    var haut = $(".heros") || $(".entete-page");
    if (haut) new IntersectionObserver(function(es){ horsHeros = !es[0].isIntersecting; majFlottants(); }).observe(haut); else { horsHeros = true; majFlottants(); }
    if ($("#contact")) new IntersectionObserver(function(es){ dansContact = es[0].isIntersecting; majFlottants(); }, {threshold:.2}).observe($("#contact"));
  } else { horsHeros = true; majFlottants(); }
  /* Mur d'avis : une seule série d'avis dans la page ; la boucle continue est créée ici (le texte n'est pas dupliqué dans le HTML) */
  var rangees = $$(".rangee");
  rangees.forEach(function(r){
    if (reduit) return;
    $$(".carte-avis", r).forEach(function(c){ var k = c.cloneNode(true); k.setAttribute("aria-hidden", "true"); $$("a", k).forEach(function(a){ a.tabIndex = -1; }); r.appendChild(k); });
    r.classList.add("is-boucle");
  });
  /* La barre d'appel mobile s'efface pendant la saisie : aucun champ ni bouton d'envoi ne passe dessous */
  var barre = $(".js-barre-mobile");
  if (barre){
    var dansForm = function(el){ return !!(el && el.closest && el.closest("form")); };
    document.addEventListener("focusin", function(e){ if (dansForm(e.target)) barre.classList.add("is-away"); });
    document.addEventListener("focusout", function(e){ if (!dansForm(e.relatedTarget)) barre.classList.remove("is-away"); });
  }
})();
