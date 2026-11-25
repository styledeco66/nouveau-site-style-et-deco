# Refonte du design (novembre 2026)

Nouveau design du site (clarté, conversion des campagnes Google Ads, appel en un geste sur mobile). **Le référencement
(SEO/GEO) est inchangé** : mêmes adresses, mêmes `title`, métadonnées, canoniques, données structurées (JSON-LD), H1 et
textes de contenu que le site précédent.

## Ce qui a changé / ce qui n'a pas changé

| Inchangé | Nouveau |
|---|---|
| Adresses des pages, `sitemap.xml`, `robots.txt`, `_redirects`, `_headers` (CSP stricte `'self'`) | `assets/css/style.css` (feuille unique), `assets/js/app.js` |
| `<head>` complet de chaque page (title, descriptions, Open Graph, JSON-LD, FAQPage) | Polices **hébergées** (`assets/fonts/`, Plus Jakarta Sans, licence OFL) : la CSP interdit les polices externes |
| Photos : mêmes fichiers et mêmes adresses (`assets/images/…`) | Corps des pages (carte de rappel, écusson d'assurance, carte des trajets, mur d'avis) |
| `lead-form.js`, `business-hours.js`, fonction Netlify `lead`, e-mails, anti-spam | Formulaires `lead_saint_cyprien`, `lead_facades`, `lead_realisations`, `lead_autres_pages` (en plus de `lead_hero`, `lead_contact`, `lead_perpignan`) |
| Note et nombre d'avis pilotés par `scripts/google-reviews.json` | `gallery.js` (visionneuse) et le carrousel d'avis supprimés |

## Formulaires

Chaque page a trois formulaires, tous envoyés par `lead-form.js` à `/.netlify/functions/lead` :

- **carte « Rappel gratuit »** du premier écran et **fenêtre d'appel** (ordinateur) : rappel seul (nom + téléphone,
  `data-fixed-mode="callback"`, `lead_priority=RAPPEL_30_MIN`) ;
- **formulaire de contact** (onglets rappel / devis) : mêmes règles que le formulaire d'origine (e-mail facultatif en
  rappel, ville / détails / e-mail obligatoires en devis ; Perpignan : ville préremplie).

Le nom du formulaire (`form-name`) identifie la page d'origine dans l'e-mail reçu : il doit exister dans `ORIGIN_LABELS` de
`netlify/functions/lead.mjs`. `app.js` ne fait que préparer le formulaire (mode, validation lisible) : il n'envoie rien.

## Horaires et promesse de rappel

Le bandeau du haut, les boutons et les formulaires utilisent `window.StyleDecoHours` (`business-hours.js`) : heure de
Paris, jours fériés, fermetures exceptionnelles. Aucune règle d'horaire n'est dupliquée dans `app.js`.

## Contrôles

```
node --test tests/*.test.mjs         # dont refonte_site (SEO, textes, sécurité, formulaires) et e2e_navigateur (Chrome)
python3 -m unittest discover -s tests
node scripts/asset-versions.mjs      # après toute modification de CSS/JS
```

- `tests/fixtures/seo-origine.json` : instantané du `<head>` des pages d'origine ; toute différence de title, métadonnée,
  canonique, JSON-LD ou H1 fait échouer le test.
- `tests/fixtures/textes-origine.json` et `textes-remplaces.json` : chaque paragraphe d'origine doit rester présent, sauf la
  liste explicite des micro-textes d'interface remplacés.
- `tests/fixtures/avis-complets.json` : les avis affichés sont les textes complets, mot pour mot.
- `tests/e2e_navigateur.test.mjs` : lance Chrome sans fenêtre (variable `CHROME_BIN` pour l'indiquer ; ignoré s'il est
  absent), sert le site avec la vraie CSP, simule la fonction `lead` et vérifie les envois, le menu mobile et l'absence
  d'erreur JavaScript.
