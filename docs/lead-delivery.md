# Envoi des demandes (formulaires → Netlify Function → Resend)

Les trois formulaires du site (`lead_hero` et `lead_contact` dans `index.html`, `lead_perpignan` dans
`perpignan.html`, **identiques** : le formulaire de l'accueil est la référence) n'utilisent plus Netlify Forms. Ils envoient leurs données à la function
`netlify/functions/lead.mjs` (`/.netlify/functions/lead`), qui les valide puis les relaie par e-mail via l'API Resend
(`POST https://api.resend.com/emails`). Aucun CAPTCHA, aucun autre service tiers.

## Variables d'environnement

À définir dans Netlify (Site configuration → Environment variables, portée « Functions »). **Aucune valeur ne doit être
commitée** ; les fichiers `.env` / `.env.*` sont ignorés par git.

| Variable               | Obligatoire | Rôle |
|------------------------|-------------|------|
| `RESEND_API_KEY`       | oui | Clé API Resend (droit d'envoi uniquement). |
| `LEAD_TO_EMAIL`        | oui | Destinataire(s) des demandes ; plusieurs adresses séparées par des virgules. |
| `LEAD_FROM_EMAIL`      | oui | Expéditeur, sur un domaine vérifié chez Resend (ex. `Nom <adresse@domaine>`). |
| `LEAD_QUARANTINE_EMAIL` | non | Destinataire des demandes marquées « à vérifier » (voir *Protection antispam*). Défaut : `LEAD_TO_EMAIL`. |
| `LEAD_ALLOWED_ORIGINS` | non | Liste explicite et stricte des origines autorisées **en production et en branch deploy**, séparées par des virgules. Défaut : `https://styleetdeco.fr`. Ne jamais y ajouter une URL de preview : voir ci-dessous. |

Si une variable obligatoire manque, la function répond 500 et le visiteur voit le message d'erreur : jamais de faux succès.

### Origine sur les Deploy Previews Netlify

`LEAD_ALLOWED_ORIGINS` reste la seule source de vérité en production et en branch deploy : aucun domaine en dehors de
cette liste explicite n'est jamais accepté, quel que soit le contexte. Sur un **Deploy Preview** Netlify uniquement
(quand la variable système `CONTEXT` fournie par Netlify vaut exactement `deploy-preview`), la function autorise en
plus, et uniquement, l'origine correspondant à `DEPLOY_PRIME_URL` — la variable système Netlify contenant l'URL
canonique de ce preview précis (ex. `https://deploy-preview-42--styleetdeco.netlify.app`). Ces deux variables sont
fournies automatiquement par Netlify à chaque déploiement de preview : **il n'est plus nécessaire de modifier
`LEAD_ALLOWED_ORIGINS` à la main à chaque pull request**. Hors du contexte `deploy-preview` (production, branch
deploy, ou `CONTEXT` absent), `DEPLOY_PRIME_URL` est ignorée même si elle est présente, et aucune origine n'est ajoutée
à la liste explicite. Aucun autre domaine Netlify (`*.netlify.app` générique) n'est jamais accepté par wildcard.

## Comportement

- **Parcours nominal** : soumission → `fetch` JSON → succès confirmé par la function (`{"ok":true}` après réponse 2xx de
  Resend avec identifiant d'e-mail) → redirection vers `/merci.html` (page de succès inchangée).
- **Échec** (réseau, refus serveur, Resend en erreur, config manquante, réponse inattendue) : le formulaire reste affiché,
  le bouton est réactivé et le message suivant apparaît sous le bouton :
  « Votre demande n’a pas pu être envoyée. Réessayez dans quelques minutes ou appelez le 06 50 75 62 42. »
- **Sans JavaScript** : le formulaire fait un POST classique vers la function ; succès → redirection 303 vers
  `/merci.html`, échec traité par la function → page HTML minimale avec le même message. Si la limitation native Netlify est atteinte, Netlify réécrit la requête vers `/lead-rate-limited.html`, qui affiche le même message sans exécuter la function.
- **Honeypot** : champ `bot-field` invisible (hors écran, `aria-hidden`, `tabindex=-1`, `autocomplete=off`), vérifié **côté serveur** : s'il est rempli, la
  demande est refusée (400, réponse générique identique à une erreur de validation) et rien n'est envoyé. Choix délibéré : pas de « faux succès », afin qu'un vrai client
  éventuellement écarté voie le message d'erreur et le numéro de téléphone.
- **Contrôle d'origine** : l'en-tête `Origin` (à défaut `Referer`) doit correspondre exactement à une origine autorisée ;
  sinon 403.
- **Validation serveur** : formulaire connu, téléphone (9 à 15 chiffres), longueurs max (nom 100, ville 100, détails 3000,
  e-mail 254), champs obligatoires selon le mode (devis : nom, téléphone, e-mail, ville, détails ; rappel 30 min : nom et téléphone
  uniquement — mêmes règles pour les trois formulaires), corps ≤ 20 000 caractères, `application/json` ou
  `application/x-www-form-urlencoded` uniquement. Le sujet de l'e-mail est toujours fixé côté serveur (« DEMANDE DE DEVIS »,
  « … - Perpignan » pour la page Perpignan, « RAPPEL 30 MIN »).
- **Adresse e-mail** : demandée, validée (navigateur : `type="email"` ; serveur : une seule adresse, format usuel,
  254 caractères max) et obligatoire uniquement pour les demandes de devis (`lead_hero` / `lead_contact` en mode devis,
  `lead_perpignan` en mode devis). Elle est affichée dans la notification interne et transmise à Resend comme `reply_to`, pour
  répondre directement au prospect. Aucun e-mail automatique n'est envoyé au prospect (le seul destinataire reste
  `LEAD_TO_EMAIL`). En mode rappel 30 min, le champ est masqué et désactivé côté navigateur, et la function ignore toute
  valeur reçue : rien n'est validé, transmis à Resend, affiché ni utilisé en `reply_to`.
- **Idempotence** : le navigateur génère un `submission_id` par formulaire, conservé entre les tentatives ; la function
  le transmet à Resend dans l'en-tête `Idempotency-Key` (`lead-<submission_id>`). Une nouvelle tentative après une
  réponse perdue ne produit pas un second e-mail. Sans `submission_id` valide (ex. envoi sans JavaScript), la clé est
  une empreinte SHA-256 du contenu + une fenêtre de 10 minutes.
- **Minimisation** : seuls les champs de la liste blanche sont transmis ; ni adresse IP, ni User-Agent, ni Referer ne
  sont mis dans l'e-mail ; la function ne journalise ni données personnelles ni secret (uniquement des codes d'erreur) ;
  rien n'est stocké côté site.

## Protection antispam (sans CAPTCHA)

Couches, de la plus certaine à la plus souple. Rien n'est visible pour le client.

1. **Origine** : `Origin`/`Referer` doit être le site (ou le preview Netlify en contexte `deploy-preview`).
2. **Honeypot** serveur (`bot-field`), valable aussi pour les appels directs à `/.netlify/functions/lead`.
3. **Limitation de débit native Netlify** (10 demandes / minute / IP) : persistante, gérée par la plateforme.
4. **Validation** stricte des champs, formats et tailles.
5. **Score de contenu** (`netlify/lib/lead-spam.mjs`, fonction pure, aucun stockage) : plusieurs indices concordants
   (vocabulaire de démarchage SEO / agence web / publicité, liens multiples ou raccourcis, texte en anglais sans français,
   alphabets non latins, absence de tout rapport avec des travaux, formulaire rempli en moins de 2,5 s ou envoyé sans le script
   du site). Un vocabulaire de travaux (peinture, façade, sol, devis, syndic…) réduit le score.
   - score < 3 : demande normale ;
   - 3 à 6, ou score élevé sans au moins deux familles d'indices : **à vérifier** — la demande est transmise (sujet préfixé
     `[À vérifier]`, ligne « Contrôle antispam » dans l'e-mail, envoi vers `LEAD_QUARANTINE_EMAIL` si définie) ; **rien n'est supprimé** ;
   - score ≥ 7 avec au moins deux familles : refus (400 générique), aucun e-mail Resend.
6. **Idempotence** Resend : doublons rapprochés → un seul e-mail.

Les journaux ne contiennent que des codes (`honeypot`, score, indices), jamais de nom, téléphone, e-mail ni texte du message.
Les réponses envoyées au client ne divulguent aucun critère.

**Limites** : aucun système n'élimine 100 % des messages. Un robot qui imite une vraie saisie, un démarchage rédigé comme une
demande de travaux ou un envoi manuel passeront. Un appel direct peut imiter l'en-tête `Origin` : la défense repose alors sur le
honeypot, le score et la limite de débit. Les adresses e-mail et téléphone affichées publiquement restent contactables sans
passer par le formulaire. Si le volume de sollicitations persiste, la suite logique (gratuite) serait Cloudflare Turnstile,
**non installé sans accord**.

## Limites connues

- **Limitation de débit native Netlify** : au-delà de 10 demandes par IP et domaine sur 60 secondes, Netlify réécrit la requête vers `/lead-rate-limited.html`. Cette page statique affiche le message d’échec validé, y compris sans JavaScript ; elle évite tout appel à Resend. Netlify peut mettre jusqu’à 10 secondes à appliquer cette protection après le dépassement ; quelques requêtes supplémentaires peuvent donc atteindre Resend. La règle est déclarée dans `netlify/functions/lead.mjs` et s’applique à toutes les offres Netlify.
- **Idempotence** : dépend de la fenêtre de conservation des clés par Resend (24 h à la date de rédaction, à vérifier
  dans la documentation Resend). Une même clé avec un contenu différent est refusée par Resend (l'utilisateur voit
  l'erreur) ; en pratique le `submission_id` ne change pas tant que la page n'est pas rechargée, mais le contenu du
  formulaire peut être modifié entre deux tentatives : dans ce cas la seconde tentative peut échouer et un
  rechargement de la page règle le problème.
- **Pas de copie de sauvegarde** : si Resend est indisponible, la demande est perdue côté site (le visiteur est invité à
  appeler). Netlify Forms conservait les soumissions ; ce n'est plus le cas.
- **Livrabilité e-mail** : dépend du domaine expéditeur vérifié chez Resend (SPF/DKIM) — à configurer hors de ce dépôt.
- **Rétention** : les e-mails restent dans la boîte de réception et dans les journaux Resend ; la durée de conservation
  (politique : 36 mois pour les prospects) doit être appliquée manuellement.
- **Netlify Forms** : à désactiver côté tableau de bord Netlify une fois la bascule faite (hors périmètre local).

## Tests

```sh
node --test tests/*.test.mjs        # function + client (node:test, aucune dépendance)
python3 -m unittest discover -s tests   # configuration, HTML, redirections
```

Les tests utilisent des mocks (`fetch` factice, variables factices) : aucun appel réseau, aucune clé réelle.
