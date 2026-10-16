/*
 * Horaires de Style & Déco : logique UNIQUE partagée par le navigateur (textes des boutons et des formulaires)
 * et par la Netlify Function (décision autoritative, e-mails, rappel interne programmé).
 * Voir docs/lead-delivery.md (« Horaires, jours fériés et fermetures »).
 *
 * Tout est calculé en heure de Paris (Europe/Paris), jamais dans le fuseau du visiteur, changements d'heure inclus.
 * Aucune dépendance. Fonctions pures : l'instant courant est toujours passé en paramètre.
 *
 * ┌────────────────────────────────────────────────────────────────────────────────────────────┐
 * │ CONFIGURATION — seule partie à modifier (voir « Modifier une période de fermeture »).       │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
(function (root) {
  "use strict";

  var CONFIG = {
    timeZone: "Europe/Paris",
    // Jours d'ouverture : 1 = lundi … 5 = vendredi (0 = dimanche, 6 = samedi).
    openWeekdays: [1, 2, 3, 4, 5],
    openTime: "08:00",
    closeTime: "18:00",
    // Dernier instant où l'on annonce « rappelé sous 30 min » (le rappel doit tenir avant la fermeture).
    callbackCutoffTime: "17:30",
    callbackWindowMinutes: 30,
    // Le rappel interne programmé part cette durée avant l'ouverture.
    reminderLeadMinutes: 30,

    // Jours fériés français officiels (fixes + Pâques, Ascension, Pentecôte). Par défaut, l'entreprise est FERMÉE ces jours-là.
    // ⚠ À valider par le dirigeant : liste des jours fériés réellement chômés.
    closedOnPublicHolidays: true,
    // Jours fériés officiels que l'entreprise travaille quand même (format "AAAA-MM-JJ"). Ex. : ["2026-05-25"] (lundi de Pentecôte).
    workedPublicHolidays: [],

    // Fermetures exceptionnelles (congés annuels, pont, indisponibilité…) : bornes incluses, format "AAAA-MM-JJ".
    // Exemple (retirer les // pour l'activer) :
    //   { from: "2026-08-10", to: "2026-08-21", label: "Congés d'été" },
    closures: [],
  };

  var DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  var MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var MINUTE = 60000;
  var DAY = 24 * 60 * MINUTE;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function minutesOf(hhmm) { var p = hhmm.split(":"); return Number(p[0]) * 60 + Number(p[1]); }
  function dateKey(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }

  var formatterCache = null;
  function formatter() {
    if (!formatterCache) {
      formatterCache = new Intl.DateTimeFormat("en-GB", {
        timeZone: CONFIG.timeZone, hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
    }
    return formatterCache;
  }

  // Éléments de l'heure de Paris pour un instant donné.
  function parisParts(instant) {
    var map = {};
    formatter().formatToParts(instant).forEach(function (p) { map[p.type] = p.value; });
    var y = Number(map.year), m = Number(map.month), d = Number(map.day);
    return {
      year: y, month: m, day: d, hour: Number(map.hour), minute: Number(map.minute), second: Number(map.second),
      minutes: Number(map.hour) * 60 + Number(map.minute),
      date: dateKey(y, m, d),
      weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
    };
  }

  // Décalage (ms) de Paris par rapport à UTC à un instant donné.
  function offsetMs(instant) {
    var p = parisParts(instant);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant.getTime() / 1000) * 1000;
  }

  // Instant UTC correspondant à une heure murale de Paris (AAAA-MM-JJ + minutes depuis minuit).
  function parisInstant(date, minutes) {
    var a = date.split("-").map(Number);
    var wall = Date.UTC(a[0], a[1] - 1, a[2], 0, 0, 0) + minutes * MINUTE;
    var guess = new Date(wall - offsetMs(new Date(wall)));
    return new Date(wall - offsetMs(guess));
  }

  function addDays(date, n) {
    var a = date.split("-").map(Number);
    var t = new Date(Date.UTC(a[0], a[1] - 1, a[2] + n));
    return dateKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function diffDays(from, to) {
    var f = from.split("-").map(Number), t = to.split("-").map(Number);
    return Math.round((Date.UTC(t[0], t[1] - 1, t[2]) - Date.UTC(f[0], f[1] - 1, f[2])) / DAY);
  }
  function weekdayOf(date) {
    var a = date.split("-").map(Number);
    return new Date(Date.UTC(a[0], a[1] - 1, a[2])).getUTCDay();
  }

  // Dimanche de Pâques (algorithme grégorien de Meeus/Jones/Butcher).
  function easter(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return dateKey(year, month, day);
  }

  var holidayCache = {};
  function publicHolidays(year) {
    if (holidayCache[year]) return holidayCache[year];
    var e = easter(year), h = {};
    h[dateKey(year, 1, 1)] = "Jour de l'an";
    h[addDays(e, 1)] = "Lundi de Pâques";
    h[dateKey(year, 5, 1)] = "Fête du Travail";
    h[dateKey(year, 5, 8)] = "Victoire 1945";
    h[addDays(e, 39)] = "Ascension";
    h[addDays(e, 50)] = "Lundi de Pentecôte";
    h[dateKey(year, 7, 14)] = "Fête nationale";
    h[dateKey(year, 8, 15)] = "Assomption";
    h[dateKey(year, 11, 1)] = "Toussaint";
    h[dateKey(year, 11, 11)] = "Armistice 1918";
    h[dateKey(year, 12, 25)] = "Noël";
    holidayCache[year] = h;
    return h;
  }

  function holidayName(date) {
    return publicHolidays(Number(date.slice(0, 4)))[date] || null;
  }

  function closureFor(date) {
    for (var i = 0; i < CONFIG.closures.length; i++) {
      var c = CONFIG.closures[i];
      if (date >= c.from && date <= c.to) return c;
    }
    return null;
  }

  // Jour d'ouverture réel : jour de semaine ouvré, ni férié chômé, ni fermeture exceptionnelle.
  function isOpenDay(date) {
    if (CONFIG.openWeekdays.indexOf(weekdayOf(date)) === -1) return false;
    if (CONFIG.closedOnPublicHolidays && holidayName(date) && CONFIG.workedPublicHolidays.indexOf(date) === -1) return false;
    if (closureFor(date)) return false;
    return true;
  }

  function nextOpenDate(fromDate, includeFrom) {
    var d = includeFrom ? fromDate : addDays(fromDate, 1);
    for (var i = 0; i < 400; i++) {
      if (isOpenDay(d)) return d;
      d = addDays(d, 1);
    }
    return null; // configuration incohérente (aucune ouverture sur plus d'un an)
  }

  var OPEN = function () { return minutesOf(CONFIG.openTime); };
  var CLOSE = function () { return minutesOf(CONFIG.closeTime); };
  var CUTOFF = function () { return minutesOf(CONFIG.callbackCutoffTime); };

  function isOpen(now) {
    var p = parisParts(now);
    return isOpenDay(p.date) && p.minutes >= OPEN() && p.minutes < CLOSE();
  }

  /*
   * Créneau de rappel applicable à une demande reçue à l'instant `now`.
   *   within30 : true si l'on annonce « rappelé sous 30 min » ;
   *   openingDate / openingAt : prochaine ouverture réelle (si within30 est faux) ;
   *   reminderAt : instant du rappel interne programmé (ouverture − 30 min), ou null s'il est déjà passé / inutile.
   */
  function callbackSlot(now) {
    var p = parisParts(now);
    var openToday = isOpenDay(p.date);
    if (openToday && p.minutes >= OPEN() && p.minutes < CUTOFF()) {
      return { within30: true, today: p.date, todayOpen: true, openingDate: p.date, openingAt: null, reminderAt: null };
    }
    var date = openToday && p.minutes < OPEN() ? p.date : nextOpenDate(p.date, false);
    if (!date) return { within30: false, today: p.date, todayOpen: openToday, openingDate: null, openingAt: null, reminderAt: null };
    var openingAt = parisInstant(date, OPEN());
    var reminderAt = new Date(openingAt.getTime() - CONFIG.reminderLeadMinutes * MINUTE);
    // Pas de rappel programmé dans le passé : une demande reçue après l'heure du rappel est signalée immédiatement.
    if (reminderAt.getTime() <= now.getTime()) reminderAt = null;
    return { within30: false, today: p.date, todayOpen: openToday, openingDate: date, openingAt: openingAt, reminderAt: reminderAt };
  }

  function longDate(date) {
    var a = date.split("-").map(Number);
    return DAY_NAMES[weekdayOf(date)] + " " + a[2] + (a[2] === 1 ? "er" : "") + " " + MONTH_NAMES[a[1] - 1];
  }

  // « aujourd'hui », « demain », « lundi » ou « le lundi 19 octobre » (au-delà d'une semaine).
  // « demain » seulement si aujourd'hui est lui-même un jour d'ouverture (le dimanche, on dit « lundi »).
  function dayLabel(date, today, todayOpen) {
    var n = diffDays(today, date);
    if (n <= 0) return "aujourd'hui";
    if (n === 1 && todayOpen) return "demain";
    if (n <= 6) return DAY_NAMES[weekdayOf(date)];
    return "le " + longDate(date);
  }

  var OPEN_LABEL = function () { return CONFIG.openTime.replace(/^0/, "").replace(":00", " h").replace(":", " h "); };

  /*
   * Textes (une seule source pour tous les boutons, formulaires, pages de confirmation et e-mails) :
   *   button   : « Être rappelé sous 30 min » / « Être rappelé dès 8 h » / « Être rappelé demain dès 8 h » / « Être rappelé lundi dès 8 h »
   *   pill     : version courte (« Rappel sous 30 min », « Rappel lundi dès 8 h »)
   *   title    : titre du formulaire en mode rappel
   *   intro    : phrase du formulaire en mode rappel
   *   heading  : titre de la section « rappel » de l'accueil
   *   sentence : phrase de confirmation (page et e-mail client)
   *   action   : consigne interne (e-mail au dirigeant)
   */
  function describe(slot) {
    var h = OPEN_LABEL();
    if (slot.within30) {
      return {
        button: "Être rappelé sous 30 min", pill: "Rappel sous 30 min", title: "Demande de rappel sous 30 min",
        intro: "Laissez votre nom et votre numéro : nous vous rappelons sous 30 minutes.",
        heading: "Nous vous rappelons sous 30 minutes",
        sentence: "Nous vous rappelons sous 30 minutes.",
        action: "Rappeler ce client sous 30 minutes.",
      };
    }
    if (!slot.openingDate) {
      return {
        button: "Être rappelé dès notre prochaine ouverture", pill: "Rappel dès notre ouverture", title: "Demande de rappel",
        intro: "Laissez votre nom et votre numéro : nous vous rappelons dès notre prochaine ouverture.",
        heading: "Nous vous rappelons dès notre prochaine ouverture",
        sentence: "Nous vous recontacterons dès notre prochaine ouverture.",
        action: "Rappeler ce client dès la prochaine ouverture.",
      };
    }
    var day = dayLabel(slot.openingDate, slot.today, slot.todayOpen);
    var when = (day === "aujourd'hui" ? "" : day + " ") + "dès " + h;
    return {
      button: "Être rappelé " + when, pill: "Rappel " + when, title: "Demande de rappel",
      intro: "Laissez votre nom et votre numéro : nous vous rappelons " + when + ".",
      heading: "Nous vous rappelons " + when,
      sentence: "Nous vous recontacterons " + day + " à partir de " + h + ".",
      action: "Rappeler ce client " + when + ".",
    };
  }

  // Prochain instant où les textes ci-dessus peuvent changer (ouverture, limite de 17 h 30, minuit) — pour l'actualisation de la page.
  function nextChange(now) {
    var p = parisParts(now);
    var candidates = [parisInstant(addDays(p.date, 1), 0), parisInstant(addDays(p.date, 2), 0)];
    [OPEN(), CUTOFF(), CLOSE()].forEach(function (m) { candidates.push(parisInstant(p.date, m)); });
    var future = candidates.filter(function (c) { return c.getTime() > now.getTime(); });
    future.sort(function (a, b) { return a - b; });
    return future[0];
  }

  // Code transmis à la page de confirmation : « 30 » (sous 30 min) ou la date d'ouverture « AAAAMMJJ ». Affichage uniquement.
  function slotCode(slot) {
    if (slot.within30) return "30";
    return slot.openingDate ? slot.openingDate.replace(/-/g, "") : "";
  }
  function slotFromCode(code, now) {
    var p = parisParts(now);
    if (code === "30") return { within30: true, today: p.date, todayOpen: true, openingDate: p.date, openingAt: null, reminderAt: null };
    if (/^\d{8}$/.test(code)) {
      var date = code.slice(0, 4) + "-" + code.slice(4, 6) + "-" + code.slice(6, 8);
      if (!isNaN(Date.parse(date)) && date >= p.date) return { within30: false, today: p.date, todayOpen: isOpenDay(p.date), openingDate: date, openingAt: null, reminderAt: null };
    }
    return { within30: false, today: p.date, todayOpen: isOpenDay(p.date), openingDate: null, openingAt: null, reminderAt: null };
  }

  var api = {
    CONFIG: CONFIG,
    parisParts: parisParts, parisInstant: parisInstant, holidayName: holidayName, closureFor: closureFor,
    isOpenDay: isOpenDay, isOpen: isOpen, nextOpenDate: nextOpenDate,
    callbackSlot: callbackSlot, describe: describe, nextChange: nextChange,
    slotCode: slotCode, slotFromCode: slotFromCode, dayLabel: dayLabel, longDate: longDate,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StyleDecoHours = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
