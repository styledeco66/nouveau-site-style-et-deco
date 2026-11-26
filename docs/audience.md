# Mesure d'audience (Umami Cloud)

Sans cookie, offre gratuite « Hobby » (100 000 événements par mois, 1 site, 6 mois d'historique ; vérifié le
26/11/2026). Code : `sitesite-template/assets/js/audience.js`.

## Mise en service

1. Renseigner `WEBSITE_ID` dans `audience.js` (identifiant public du site dans Umami). Vide : rien n'est chargé.
2. `node scripts/asset-versions.mjs`, puis les tests.

Rien n'est compté en local ni sur les aperçus Netlify, ni après un refus (bouton de la politique de
confidentialité, rubrique 9), ni si le navigateur demande à ne pas être suivi.

## Actions enregistrées

| Nom dans Umami | Signification |
|---|---|
| `clic-appel-mobile` | Numéro touché sur un écran tactile (ne prouve pas que l'appel a abouti) |
| `clic-numero-ordinateur` | Bouton ou numéro cliqué sur ordinateur |
| `clic-email` | Adresse e-mail cliquée |
| `ouverture-rappel` | Bouton « Être rappelé » |
| `formulaire-vu` | Un formulaire affiché au moins à moitié (premier de la page) |
| `rappel-commence`, `devis-commence` | Début de saisie |
| `formulaire-champ-a-corriger` | Envoi refusé ; détail : nom du champ |
| `formulaire-echec-envoi` | Demande non partie (panne ou limite d'envoi) |
| `page-descendue-moitie`, `page-descendue-bas` | Profondeur de lecture |

Une demande envoyée se voit à la page vue `/merci-rappel.html` (rappel) ou `/merci.html` (devis).

## Entonnoirs à créer dans Umami

- Rappel : page `/` → `formulaire-vu` → `rappel-commence` → page `/merci-rappel.html`
- Devis : page `/` → `devis-commence` → page `/merci.html`

## Règles

Aucune saisie de visiteur ne doit être transmise. Les identifiants de clic (`gclid`, `gbraid`, `wbraid`) et les
paramètres libres sont retirés des adresses. Pas d'enregistrement de visites ni de carte de chaleur : la CNIL
exige alors un accord préalable.
