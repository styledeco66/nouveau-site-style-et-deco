# Note et nombre d'avis Google

La note (« 4,9/5 ») et le nombre d'avis (« 16 avis ») sont affichés à plusieurs endroits (accueil, pages
Perpignan, Saint-Cyprien et Façades). Les valeurs vérifiées sur la fiche Google Business sont **centralisées** dans
`scripts/google-reviews.json` ; aucune note n'est balisée en données structurées (pas d'`aggregateRating`), pour
respecter les consignes de Google.

## Quand le nombre d'avis change

1. Vérifier la note et le nombre d'avis sur la fiche Google Business.
2. Modifier `scripts/google-reviews.json` (`rating` au format « 4,9 », `ratingValue` « 4.9 », `count`,
   `verifiedOn`).
3. Lancer `node scripts/google-reviews.mjs` : les pages HTML sont mises à jour (repères `data-google-rating`,
   `data-google-count`, `data-google-rating-kpi` et lien vers la fiche).
4. Lancer les tests (`node --test tests/*.test.mjs`) : ils échouent si une page affiche une autre valeur que le
   fichier de configuration. `node scripts/google-reviews.mjs --check` fait la même vérification seule.

Les avis cités dans le carrousel de l'accueil sont des avis réels publiés sur Google : ils ne sont ni modifiés ni
ajoutés par ce script.
