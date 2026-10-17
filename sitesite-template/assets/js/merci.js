// Page de confirmation d'une demande de rappel : affiche le créneau validé par le serveur.
// Le code `?s=` (« 30 » ou une date d'ouverture AAAAMMJJ) sert UNIQUEMENT à l'affichage : il ne programme rien. Il est contrôlé
// (format, date non passée) ; en cas de doute, le texte de repli reste affiché. Sans JavaScript, le texte de repli est celui du HTML.
(() => {
  const hours = window.StyleDecoHours;
  if (!hours) return;
  const code = new URLSearchParams(window.location.search).get("s") || "";
  if (!/^(30|\d{8})$/.test(code)) return;
  const slot = hours.slotFromCode(code, new Date());
  if (!slot.within30 && !slot.openingDate) return;
  const sentence = hours.describe(slot).sentence;
  document.querySelectorAll('[data-slot="sentence"]').forEach((el) => {
    el.textContent = sentence;
  });
})();
