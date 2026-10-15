// Visionneuse des fiches de chantier : agrandit les photos (liens a[data-rx-photo]) dans un <dialog> natif.
// Sans JavaScript (ou sans <dialog>), chaque lien ouvre simplement l'image en grand.
(() => {
  const links = Array.from(document.querySelectorAll("a[data-rx-photo]"));
  const dialog = document.querySelector(".rx-lightbox");
  if (!links.length || !dialog || typeof dialog.showModal !== "function") return;

  const img = dialog.querySelector(".rx-lightbox__img");
  const caption = dialog.querySelector(".rx-lightbox__caption");
  const prev = dialog.querySelector("[data-rx-prev]");
  const next = dialog.querySelector("[data-rx-next]");
  const close = dialog.querySelector("[data-rx-close]");
  let index = 0;

  const show = (i) => {
    index = (i + links.length) % links.length;
    const link = links[index];
    const thumb = link.querySelector("img");
    img.src = link.getAttribute("href");
    img.alt = thumb ? thumb.alt : "";
    const figcaption = link.closest("figure")?.querySelector("figcaption");
    caption.textContent = figcaption ? figcaption.textContent.trim() : "";
    const neighbour = new Image();
    neighbour.src = links[(index + 1) % links.length].getAttribute("href");
  };

  links.forEach((link, i) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      show(i);
      dialog.showModal();
    });
  });

  prev.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") show(index - 1);
    if (event.key === "ArrowRight") show(index + 1);
  });

  let startX = null;
  dialog.addEventListener("touchstart", (event) => { startX = event.touches[0].clientX; }, { passive: true });
  dialog.addEventListener("touchend", (event) => {
    if (startX === null) return;
    const dx = event.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  }, { passive: true });
})();
