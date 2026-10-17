import assert from "node:assert/strict";
import test from "node:test";
import hours from "../sitesite-template/assets/js/business-hours.js";

// Horaires de Style & Déco (heure de Paris) : créneaux de rappel, jours fériés, fermetures, changements d'heure.
// Les instants sont construits à partir de l'heure MURALE de Paris, puis recontrôlés en UTC pour les cas d'heure d'été/d'hiver.
const at = (date, hhmm, sec = 0) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(hours.parisInstant(date, h * 60 + m).getTime() + sec * 1000);
};
const slotAt = (date, hhmm, sec) => hours.callbackSlot(at(date, hhmm, sec));
const text = (date, hhmm) => hours.describe(slotAt(date, hhmm)).button;
const paris = (instant) => { const p = hours.parisParts(instant); return `${p.date} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`; };

// Semaine de référence : lundi 19 octobre 2026 (heure d'été), vendredi 23, samedi 24, dimanche 25 (retour à l'heure d'hiver).
test("lundi : sous 30 min de 8 h 00 à 17 h 29, puis dès demain 8 h", () => {
  assert.equal(text("2026-10-19", "07:00"), "Être rappelé dès 8 h");
  assert.equal(text("2026-10-19", "07:30"), "Être rappelé dès 8 h");
  assert.equal(text("2026-10-19", "07:45"), "Être rappelé dès 8 h");
  assert.equal(text("2026-10-19", "08:00"), "Être rappelé sous 30 min");
  assert.equal(text("2026-10-19", "12:00"), "Être rappelé sous 30 min");
  assert.equal(text("2026-10-19", "17:29"), "Être rappelé sous 30 min");
  assert.equal(slotAt("2026-10-19", "17:29", 59).within30, true);
  assert.equal(text("2026-10-19", "17:30"), "Être rappelé demain dès 8 h");
  assert.equal(text("2026-10-19", "18:00"), "Être rappelé demain dès 8 h");
  assert.equal(text("2026-10-19", "20:00"), "Être rappelé demain dès 8 h");
});

test("vendredi soir, samedi et dimanche : lundi dès 8 h", () => {
  assert.equal(text("2026-10-23", "17:29"), "Être rappelé sous 30 min");
  assert.equal(text("2026-10-23", "17:30"), "Être rappelé lundi dès 8 h");
  assert.equal(text("2026-10-23", "19:00"), "Être rappelé lundi dès 8 h");
  for (const t of ["09:00", "21:00"]) assert.equal(text("2026-10-24", t), "Être rappelé lundi dès 8 h");
  for (const t of ["09:00", "21:00"]) assert.equal(text("2026-10-25", t), "Être rappelé lundi dès 8 h");
});

test("rappel interne programmé : ouverture − 30 min, jamais dans le passé", () => {
  assert.equal(paris(slotAt("2026-10-19", "20:00").reminderAt), "2026-10-20 07:30"); // lundi soir → mardi 7 h 30
  assert.equal(paris(slotAt("2026-10-23", "19:00").reminderAt), "2026-10-26 07:30"); // vendredi soir → lundi
  assert.equal(paris(slotAt("2026-10-25", "15:00").reminderAt), "2026-10-26 07:30"); // dimanche → lundi
  assert.equal(paris(slotAt("2026-10-19", "07:00").reminderAt), "2026-10-19 07:30"); // avant 7 h 30 : le jour même
  assert.equal(slotAt("2026-10-19", "07:30").reminderAt, null, "7 h 30 pile : déjà l'heure, alerte immédiate seulement");
  assert.equal(slotAt("2026-10-19", "07:45").reminderAt, null, "7 h 45 : signalée immédiatement, rien dans le passé");
  assert.equal(slotAt("2026-10-19", "10:00").reminderAt, null, "pendant l'ouverture : pas de rappel programmé");
});

test("jours fériés : lundi férié → mardi ; férié en milieu de semaine → jour suivant", () => {
  // 2026 : lundi de Pâques le 6 avril ; mercredi 11 novembre (Armistice) ; vendredi 25 décembre ; jeudi 14 mai (Ascension)
  assert.equal(hours.holidayName("2026-04-06"), "Lundi de Pâques");
  assert.equal(hours.holidayName("2026-05-14"), "Ascension");
  assert.equal(hours.holidayName("2026-05-25"), "Lundi de Pentecôte");
  assert.equal(text("2026-04-05", "15:00"), "Être rappelé mardi dès 8 h"); // dimanche avant un lundi férié
  assert.equal(paris(slotAt("2026-04-05", "15:00").reminderAt), "2026-04-07 07:30");
  assert.equal(text("2026-04-06", "10:00"), "Être rappelé mardi dès 8 h"); // le jour férié lui-même
  assert.equal(text("2026-11-11", "10:00"), "Être rappelé jeudi dès 8 h"); // mercredi férié (aujourd'hui fermé) → jeudi
  assert.equal(text("2026-11-10", "17:45"), "Être rappelé jeudi dès 8 h"); // veille d'un férié : demain est fermé
  assert.equal(text("2026-12-24", "17:45"), "Être rappelé lundi dès 8 h"); // jeudi soir, vendredi 25 férié
  assert.equal(hours.isOpenDay("2026-11-11"), false);
});

test("jour férié travaillé : configurable sans toucher au calcul", () => {
  const saved = hours.CONFIG.workedPublicHolidays.slice();
  hours.CONFIG.workedPublicHolidays.push("2026-05-25");
  try {
    assert.equal(hours.isOpenDay("2026-05-25"), true);
    assert.equal(text("2026-05-25", "09:00"), "Être rappelé sous 30 min");
  } finally { hours.CONFIG.workedPublicHolidays.splice(0, hours.CONFIG.workedPublicHolidays.length, ...saved); }
});

test("fermeture exceptionnelle : la veille, pendant, et premier jour de réouverture", () => {
  hours.CONFIG.closures.push({ from: "2026-08-10", to: "2026-08-21", label: "Congés d'été" });
  try {
    assert.equal(text("2026-08-07", "17:45"), "Être rappelé le lundi 24 août dès 8 h"); // veille de fermeture (vendredi soir)
    assert.equal(paris(slotAt("2026-08-07", "17:45").reminderAt), "2026-08-24 07:30");
    assert.equal(text("2026-08-12", "10:00"), "Être rappelé le lundi 24 août dès 8 h");
    assert.equal(text("2026-08-24", "09:00"), "Être rappelé sous 30 min");
    assert.equal(hours.closureFor("2026-08-15").label, "Congés d'été");
  } finally { hours.CONFIG.closures.length = 0; }
});

test("changement d'heure : les heures de Paris restent 8 h / 7 h 30 en UTC décalé", () => {
  // Été → hiver (dimanche 25 octobre 2026 à 3 h → 2 h) : lundi 26 octobre 8 h = 07:00 UTC
  const winter = slotAt("2026-10-25", "15:00");
  assert.equal(winter.openingAt.toISOString(), "2026-10-26T07:00:00.000Z");
  assert.equal(winter.reminderAt.toISOString(), "2026-10-26T06:30:00.000Z");
  // Hiver → été (dimanche 29 mars 2026 à 2 h → 3 h) : lundi 30 mars 8 h = 06:00 UTC
  const summer = slotAt("2026-03-28", "20:00");
  assert.equal(summer.openingAt.toISOString(), "2026-03-30T06:00:00.000Z");
  assert.equal(summer.reminderAt.toISOString(), "2026-03-30T05:30:00.000Z");
  // Le soir même d'un changement d'heure, la veille de l'ouverture reste cohérente
  assert.equal(paris(slotAt("2026-03-28", "20:00").openingAt), "2026-03-30 08:00");
  // Avant/après le changement : 17 h 30 reste 17 h 30 de Paris
  assert.equal(text("2026-10-23", "17:30"), "Être rappelé lundi dès 8 h");
  assert.equal(text("2026-10-26", "17:29"), "Être rappelé sous 30 min");
  assert.equal(text("2026-10-26", "17:30"), "Être rappelé demain dès 8 h");
});

test("le fuseau du visiteur n'intervient jamais : seul l'instant compte", () => {
  // Même instant absolu, quel que soit le fuseau du processus : 15:00 UTC un lundi d'octobre = 17 h 00 à Paris → sous 30 min
  const instant = new Date("2026-10-19T15:00:00Z");
  assert.equal(hours.callbackSlot(instant).within30, true);
  const late = new Date("2026-10-19T15:30:00Z"); // 17 h 30 Paris
  assert.equal(hours.callbackSlot(late).within30, false);
  assert.equal(hours.parisParts(new Date("2026-10-19T22:30:00Z")).date, "2026-10-20");
});

test("textes : phrase de confirmation, consigne interne, titres, jamais un jour fermé", () => {
  const friday = hours.describe(slotAt("2026-10-23", "19:00"));
  assert.equal(friday.sentence, "Nous vous recontacterons lundi à partir de 8 h.");
  assert.equal(friday.action, "Rappeler ce client lundi dès 8 h.");
  assert.equal(friday.pill, "Rappel lundi dès 8 h");
  const monday = hours.describe(slotAt("2026-10-19", "12:00"));
  assert.equal(monday.sentence, "Nous vous rappelons sous 30 minutes.");
  assert.equal(monday.action, "Rappeler ce client sous 30 minutes.");
  const early = hours.describe(slotAt("2026-10-19", "06:30"));
  assert.equal(early.sentence, "Nous vous recontacterons aujourd'hui à partir de 8 h.");
  const tomorrow = hours.describe(slotAt("2026-10-19", "19:00"));
  assert.equal(tomorrow.sentence, "Nous vous recontacterons demain à partir de 8 h.");
  for (const day of ["2026-10-24", "2026-10-25", "2026-04-05"]) {
    const s = hours.callbackSlot(at(day, "12:00"));
    assert.equal(hours.isOpenDay(s.openingDate), true, `${day} : le jour annoncé est ouvert`);
  }
});

test("code de créneau pour la page de confirmation : affichage seulement, validé", () => {
  const now = at("2026-10-23", "19:00");
  const code = hours.slotCode(hours.callbackSlot(now));
  assert.equal(code, "20261026");
  assert.equal(hours.describe(hours.slotFromCode(code, now)).sentence, "Nous vous recontacterons lundi à partir de 8 h.");
  assert.equal(hours.describe(hours.slotFromCode("30", now)).sentence, "Nous vous rappelons sous 30 minutes.");
  // code falsifié ou périmé : repli neutre
  assert.equal(hours.describe(hours.slotFromCode("<script>", now)).sentence, "Nous vous recontacterons dès notre prochaine ouverture.");
  assert.equal(hours.describe(hours.slotFromCode("20200101", now)).sentence, "Nous vous recontacterons dès notre prochaine ouverture.");
});

test("actualisation : prochain changement de texte (ouverture, 17 h 30, fermeture, minuit)", () => {
  assert.equal(paris(hours.nextChange(at("2026-10-19", "07:00"))), "2026-10-19 08:00");
  assert.equal(paris(hours.nextChange(at("2026-10-19", "08:00"))), "2026-10-19 17:30");
  assert.equal(paris(hours.nextChange(at("2026-10-19", "17:30"))), "2026-10-19 18:00");
  assert.equal(paris(hours.nextChange(at("2026-10-19", "20:00"))), "2026-10-20 00:00");
});

test("ouverture : isOpen suit les horaires 8 h – 18 h les jours ouvrés", () => {
  assert.equal(hours.isOpen(at("2026-10-19", "07:59")), false);
  assert.equal(hours.isOpen(at("2026-10-19", "08:00")), true);
  assert.equal(hours.isOpen(at("2026-10-19", "17:59")), true);
  assert.equal(hours.isOpen(at("2026-10-19", "18:00")), false);
  assert.equal(hours.isOpen(at("2026-10-24", "10:00")), false);
});
