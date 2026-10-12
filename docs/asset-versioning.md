# Versionnement des ressources CSS/JS

`sitesite-template/_headers` sert `/assets/*` avec `Cache-Control: public, max-age=31536000, immutable`. Un
navigateur qui possède déjà un fichier ne le redemande donc plus pendant un an : modifier `style.css` ou
`app.js` ne suffit pas, seul un **changement d'adresse** force le téléchargement.

Chaque référence à un fichier de `assets/css` ou `assets/js` porte donc `?v=<empreinte>` :

```html
<link rel="stylesheet" href="./assets/css/style.css?v=911b2caf76" />
<script src="./assets/js/app.js?v=211d33feaa"></script>
```

- L'empreinte est le début (10 caractères) du SHA-256 du **contenu** du fichier : elle change si et seulement si
  le fichier change (la date de modification n'a aucune influence).
- Les pages HTML sont servies avec `max-age=0, must-revalidate` : elles sont revalidées à chaque visite et
  référencent donc toujours les adresses à jour, y compris pour un visiteur qui a l'ancien CSS/JS en cache.
- Les images ne sont pas concernées (adresses inchangées). Règle : ne jamais remplacer une image sous le même
  nom (nouvelle photo = nouveau nom), sinon les visiteurs gardent l'ancienne pendant un an.

## Commandes (aucune dépendance)

```
node scripts/asset-versions.mjs           # met à jour les références dans les pages HTML
node scripts/asset-versions.mjs --check   # ne modifie rien ; code de sortie 1 si une référence est périmée
```

**Après toute modification d'un fichier de `assets/css` ou `assets/js` : lancer la première commande, puis
commiter les pages modifiées avec le fichier.** Le contrôle est exécuté :

- par Netlify à chaque déploiement (`[build] command` dans `netlify.toml`) : un déploiement avec une
  référence périmée échoue au lieu de publier des pages qui pointent vers une ancienne version ;
- par les tests (`node --test tests/*.test.mjs` et `python3 -m unittest discover -s tests`).

Le script refuse aussi : une référence vers un fichier absent, un paramètre autre que `?v=`, un fichier CSS/JS qui
en charge un autre (`@import`, `import … from`, `importScripts`, `import()`, `new Worker`), car cette chaîne
échapperait au versionnement. Un nouveau fichier CSS/JS ajouté à une page est pris en compte automatiquement.

## Retour arrière : limites

Le paramètre `?v=` **ne conserve pas** les anciennes versions côté serveur : Netlify ne publie que les fichiers du
déploiement actif. Il sert uniquement à ce que le navigateur considère une adresse différente comme un fichier
différent.

- **Cohérence HTML/CSS/JS** : une page et ses ressources doivent toujours provenir du même déploiement. Pour revenir
  en arrière, il faut revenir **ensemble** aux pages et aux fichiers (`git revert` du commit du lot, ou, dans
  Netlify, « Publish deploy » sur le déploiement précédent, qui restaure pages et ressources du même coup).
  Restaurer seulement un CSS ou un JS, ou seulement des pages, produirait des pages qui demandent une empreinte
  que le serveur ne sert plus : les navigateurs recevraient alors le fichier actuel sous une ancienne adresse
  (même contenu que le serveur, pas celui de l'empreinte demandée).
- **Cache du navigateur** : un visiteur qui a déjà téléchargé `style.css?v=A` le garde jusqu'à un an
  (`immutable`) et ne l'interroge plus. Après un retour arrière, la page (toujours revalidée) redemande les adresses
  du déploiement restauré : si une adresse est déjà en cache chez ce visiteur, il réutilise la copie qu'il a
  (qui correspond bien à cette empreinte) ; sinon il reçoit le fichier du déploiement restauré. Le cas fragile est
  un retour vers des pages **sans** `?v=` (avant ce lot) : un visiteur qui avait déjà `style.css` sans paramètre
  peut en garder une ancienne copie, comme avant ce lot. Rien ne force un navigateur à abandonner une copie
  `immutable` : le retour n'est donc pas garanti instantané pour tous, notamment dans un onglet déjà ouvert.
- **Pages archivées** (copies de moteurs, Internet Archive) : elles peuvent référencer d'anciennes adresses ; elles
  recevront le fichier actuel.
- **Images** : non versionnées ; un retour arrière ne les restaure pas dans le cache des visiteurs (voir plus haut).
- Aucun essai de retour arrière n'a été réalisé en production.
