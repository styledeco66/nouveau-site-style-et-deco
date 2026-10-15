# Ajouter un chantier à la rubrique Réalisations

La rubrique se compose d'une galerie (`sitesite-template/realisations/index.html`) et d'une fiche par chantier
(`sitesite-template/realisations/<slug>/index.html`). La première fiche, `ravalement-facade-immeuble-perpignan`,
sert de modèle. Les styles (`.rx-*`) sont dans `assets/css/style.css`, la visionneuse dans `assets/js/gallery.js`.

## Avant de publier une fiche

1. **Contenu authentique uniquement** : lieu (commune), nature du chantier et étapes validés par l'entreprise.
   Pas de client nommé, pas d'adresse, pas de date ou de surface non confirmées.
2. **Photographies** : copies optimisées dans `assets/images/realisations/<slug>/` (WebP, 2 ou 3 largeurs,
   `width`/`height` renseignés). Pas de métadonnées : `node scripts/check-image-metadata.mjs` doit répondre
   « Aucune coordonnée GPS détectée ». Masquer (recadrer) plaques d'immatriculation, numéros de rue et coordonnées
   téléphoniques lisibles. Ne présenter une photo intermédiaire comme résultat final sous aucun prétexte ; pas de
   faux avant/après (comparateur seulement si le point de vue est identique).
3. **Textes alternatifs** : description visuelle factuelle (30 à 200 caractères), sans liste de mots-clés.
4. **Fiche** : copier la page modèle ; un seul H1 ; title et meta description uniques ; canonique ; JSON-LD
   `WebPage` + `ImageObject` + `BreadcrumbList` rattachés à `https://styleetdeco.fr/#business` (aucune note,
   certification ni prix) ; liens vers la galerie, le service concerné et le devis.
5. **Galerie** : ajouter une `<article class="rx-card">` dans `.rx-grid` (la classe `rx-card--feature` met en avant
   la carte la plus récente ; une seule à la fois).
6. **Sitemap** : ajouter l'URL de la fiche et ses images dans `sitemap.xml` (titres factuels).
7. `node scripts/asset-versions.mjs` (empreintes `?v=`), puis `node --test tests/*.test.mjs` et
   `python3 -m unittest discover -s tests -p "test_*.py"`.
