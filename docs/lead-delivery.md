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
| `LEAD_CLIENT_CONFIRMATIONS` | non | `on` pour activer l'e-mail de confirmation envoyé au client (devis, et rappel si une adresse est renseignée). **Absente = désactivé.** Voir *Activation progressive*. |
| `LEAD_SCHEDULED_REMINDERS` | non | `on` pour activer le rappel interne programmé avant l'ouverture. **Absente = désactivé.** |
| `LEAD_ALLOWED_ORIGINS` | non | Liste explicite et stricte des origines autorisées **en production et en branch deploy**, séparées par des virgules. Défaut : `https://styleetdeco.fr`. Ne jamais y ajouter une URL de preview : voir ci-dessous. |

Si une variable obligatoire manque, la function répond 500 et le visiteur voit le message d'erreur : jamais de faux succès.

### Origine sur les Deploy Previews Netlify

`LEAD_ALLOWED_ORIGINS` reste la seule source de vérité en production et en branch deploy : aucun domaine en dehors de
cette liste explicite n'est jamais accepté, quel que soit le contexte. Sur un **Deploy Preview** Netlify uniquement, la function
autorise en plus, et uniquement, l'adresse de CE preview (ex. `https://deploy-preview-42--styleetdeco.netlify.app`) :
le contexte « deploy-preview » est lu dans le contexte d'exécution que Netlify fournit à la function (`context.deploy.context`),
à défaut dans la variable `CONTEXT` ; l'adresse est `DEPLOY_PRIME_URL` si elle est présente, sinon l'origine de la requête elle-même,
acceptée seulement si elle a la forme exacte `https://deploy-preview-<n>--<site>.netlify.app`. **Il n'est pas nécessaire de modifier
`LEAD_ALLOWED_ORIGINS` à chaque pull request** (une ancienne valeur propre à un preview, ex. `deploy-preview-4`, est inutile et peut être supprimée
du contexte « Deploy Previews »). Hors du contexte `deploy-preview` (production, branch deploy, contexte inconnu), aucune origine n'est ajoutée.
Aucun autre domaine Netlify (`*.netlify.app` générique) n'est jamais accepté par wildcard.
*Incident du 16/10/2026 : les variables `CONTEXT` / `DEPLOY_PRIME_URL` n'étaient pas disponibles à l'exécution de la function ; le preview n°9 était
refusé (403) et le formulaire affichait l'erreur générique. Corrigé par la lecture de `context.deploy.context`.*

## Comportement

- **Parcours nominal** : soumission → `fetch` JSON → succès confirmé par la function (`{"ok":true}` après réponse 2xx de
  Resend avec identifiant d'e-mail) → redirection vers la page de confirmation **indiquée par la function** : `/merci.html`
  (devis) ou `/merci-rappel.html?s=<code>` (rappel). Le code `s` (`30` ou la date d'ouverture `AAAAMMJJ`) ne sert qu'à l'affichage du créneau.
- **Échec** (réseau, refus serveur, Resend en erreur, config manquante, réponse inattendue) : le formulaire reste affiché,
  le bouton est réactivé et le message suivant apparaît sous le bouton :
  « Votre demande n’a pas pu être envoyée. Réessayez dans quelques minutes ou appelez le 06 50 75 62 42. »
- **Sans JavaScript** : le formulaire fait un POST classique vers la function ; succès → redirection 303 vers
  la même page de confirmation (devis ou rappel), échec traité par la function → page HTML minimale avec le même message. Si la limitation native Netlify est atteinte, Netlify réécrit la requête vers `/lead-rate-limited.html`, qui affiche le même message sans exécuter la function.
- **Honeypot** : champ `bot-field` invisible (hors écran, `aria-hidden`, `tabindex=-1`, `autocomplete=off`), vérifié **côté serveur** : s'il est rempli, la
  demande est refusée (400, réponse générique identique à une erreur de validation) et rien n'est envoyé. Choix délibéré : pas de « faux succès », afin qu'un vrai client
  éventuellement écarté voie le message d'erreur et le numéro de téléphone.
- **Contrôle d'origine** : l'en-tête `Origin` (à défaut `Referer`) doit correspondre exactement à une origine autorisée ;
  sinon 403.
- **Validation serveur** : formulaire connu, téléphone (9 à 15 chiffres), longueurs max (nom 100, ville 100, détails 3000,
  e-mail 254), champs obligatoires selon le mode (devis : nom, téléphone, e-mail, ville, détails ; rappel : nom et téléphone ;
  l'e-mail est facultatif mais doit être valide s'il est renseigné — mêmes règles pour les trois formulaires), corps ≤ 20 000 caractères, `application/json` ou
  `application/x-www-form-urlencoded` uniquement. Le sujet de l'e-mail est toujours fixé côté serveur (« DEMANDE DE DEVIS »,
  « … - Perpignan » pour la page Perpignan, « [RAPPEL CLIENT] Nouveau rappel à effectuer »).
- **Adresse e-mail** : obligatoire pour une demande de devis, **facultative pour une demande de rappel** (décision du dirigeant) ;
  validée côté navigateur (`type="email"`) et côté serveur (une seule adresse, format usuel, 254 caractères max). Si elle est
  renseignée, elle est affichée dans la notification interne, transmise à Resend comme `reply_to`, et sert à la confirmation client
  (voir *E-mails*). Une adresse absente ne bloque jamais une demande ; une adresse renseignée mais invalide est refusée (400).
- **Idempotence** : voir *Clés d'idempotence et doublons* ci-dessous.
- **Minimisation** : seuls les champs de la liste blanche sont transmis ; ni adresse IP, ni User-Agent, ni Referer ne
  sont mis dans l'e-mail ; la function ne journalise ni données personnelles ni secret (uniquement des codes d'erreur) ;
  rien n'est stocké côté site.

## Protection antispam (sans CAPTCHA) et quarantaine

**Principe : seuls des blocages TECHNIQUES refusent une demande ; l'analyse de contenu ne supprime jamais rien.**

Refus (aucun e-mail, réponse d'erreur générique avec le numéro de téléphone) :
1. **Origine** : `Origin`/`Referer` doit être le site (ou le preview Netlify en contexte `deploy-preview`).
2. **Honeypot** serveur (`bot-field`, invisible, hors écran, `aria-hidden`), valable aussi pour les appels directs à la function.
3. **Validation** stricte des champs, formats et tailles.
4. **Limitation de débit native Netlify** (10 demandes / minute / IP), persistante, gérée par la plateforme.

Quarantaine (la demande est **transmise**, jamais perdue) :
5. **Analyse de contenu** (`netlify/lib/lead-spam.mjs`, fonction pure, aucun stockage) : plusieurs indices concordants de démarchage
   (vocabulaire SEO / agence web / création de site / publicité, liens multiples ou raccourcis, champs incohérents). Un vocabulaire
   de travaux (peinture, façade, sol, devis, syndic…) réduit le score. Si le score atteint le seuil (3), la demande part en
   quarantaine : sujet préfixé `[À VÉRIFIER]`, ligne « Contrôle antispam : QUARANTAINE — … » dans l'e-mail (indices techniques, pas le texte),
   et envoi à `LEAD_QUARANTINE_EMAIL` si elle est définie, sinon à `LEAD_TO_EMAIL` (le préfixe suffit alors à les repérer).
   Le visiteur voit un succès normal : aucun critère n'est divulgué.
   **Ne comptent pas** : la langue (anglais, espagnol…), l'alphabet (cyrillique, arabe…), la vitesse de remplissage, le remplissage
   automatique, l'absence de JavaScript.
6. **Idempotence** Resend : doublons rapprochés → un seul e-mail.

Les journaux ne contiennent que des codes (`honeypot`, score, indices), jamais de nom, téléphone, e-mail ni texte du message.

### Mise en place de la quarantaine (sans abonnement)

1. **Netlify** (projet `iridescent-twilight-cce7df`) → Site configuration → Environment variables → *Add a variable* :
   `LEAD_QUARANTINE_EMAIL` = `votre-adresse+verif@gmail.com` (même boîte Gmail que `LEAD_TO_EMAIL`, avec le suffixe `+verif` ; portée **Functions**,
   tous les contextes). Les variables ne s'appliquent qu'aux déploiements suivants : relancer un déploiement après l'ajout.
2. **Gmail** → Paramètres → Filtres et adresses bloquées → *Créer un filtre* → champ « À » : `votre-adresse+verif@gmail.com`
   → *Créer un filtre* → cocher *Ignorer la boîte de réception (archiver)*, *Appliquer le libellé* « Demandes à vérifier » (à créer),
   *Ne jamais envoyer dans les spams*. Facultatif : *Marquer comme important* (sinon laisser tel quel).
   Les messages `+verif` arrivent dans la même boîte, sans abonnement, mais n'apparaissent que sous le libellé.
3. Habitude : ouvrir le libellé « Demandes à vérifier » chaque jour (un vrai client y sera repérable à son téléphone, à sa demande de travaux
   et au champ Reply-To = son adresse). Pour reclasser un vrai client : répondre normalement ; l'adresse de réponse est la sienne.
4. Test d'activation (réel, à faire une fois par vous) : envoyer depuis le site une demande dont le texte est manifestement publicitaire
   (ex. « Agence web : création de site et SEO, référencement première page Google, audit gratuit »), vérifier qu'elle arrive sous le libellé,
   puis une demande normale qui doit arriver en boîte de réception.

**Limites** : aucun système n'élimine 100 % des messages. Un démarchage rédigé comme une demande de travaux passera en boîte principale,
et un vrai client au message atypique peut arriver en quarantaine (d'où le libellé à consulter). Un appel direct peut imiter l'en-tête
`Origin` : la défense repose alors sur le honeypot, le score et la limite de débit. Les adresses e-mail et téléphone affichées
publiquement restent contactables sans passer par le formulaire. Si le volume persiste, la suite logique (gratuite) serait Cloudflare Turnstile,
**non installé sans accord**.

## Horaires, jours fériés et fermetures

Source unique : **`sitesite-template/assets/js/business-hours.js`** (bloc `CONFIG` en tête de fichier). Le même fichier est utilisé par le
navigateur (textes des boutons) et par la function (décision réelle, e-mails, rappel programmé).

- **Horaires** : lundi–vendredi, 8 h – 18 h, heure de Paris (`Europe/Paris`, changements d'heure gérés). Le fuseau du visiteur n'est **jamais** utilisé.
- **Jours fériés** : calculés automatiquement (1ᵉʳ janvier, lundi de Pâques, 1ᵉʳ mai, 8 mai, Ascension, lundi de Pentecôte, 14 juillet, 15 août,
  1ᵉʳ novembre, 11 novembre, Noël). **Par défaut l'entreprise est fermée ces jours-là** (`closedOnPublicHolidays: true`).
  ⚠ À valider : si un jour férié est travaillé (ex. lundi de Pentecôte), l'ajouter à `workedPublicHolidays: ["2027-05-17"]`.
- **Fermetures exceptionnelles** (congés, pont, indisponibilité) : ajouter une ligne dans `closures`, bornes incluses :
  ```js
  closures: [
    { from: "2026-08-10", to: "2026-08-21", label: "Congés d'été" },
  ],
  ```
  puis lancer `node scripts/asset-versions.mjs` (met à jour l'empreinte du fichier), `node --test tests/*.test.mjs`, et publier. Aucune autre modification.
  Les rappels annoncés et les e-mails tiennent compte de la fermeture dès la publication ; supprimer la ligne ensuite (ou la laisser : elle est sans effet une fois la date passée).
- Un rappel n'est **jamais** annoncé un jour fermé : la prochaine ouverture réelle est cherchée jour après jour.

## Rappel intelligent

La demande de rappel reste possible 24 h/24 et 7 j/7 (le bouton n'est jamais désactivé). Le créneau annoncé dépend de l'instant de la demande :

| Instant (heure de Paris) | Bouton | Rappel interne programmé |
|---|---|---|
| Jour ouvré, 8 h 00 → 17 h 29 | « Être rappelé sous 30 min » | non (alerte immédiate seule) |
| Jour ouvré avant 8 h | « Être rappelé dès 8 h » | à 7 h 30 le jour même, si ce n'est pas déjà passé |
| Lundi–jeudi à partir de 17 h 30 | « Être rappelé demain dès 8 h » | demain 7 h 30 |
| Vendredi à partir de 17 h 30, week-end | « Être rappelé lundi dès 8 h » | lundi 7 h 30 |
| Veille d'un jour férié / fermeture | prochain jour d'ouverture réel (ex. « mardi dès 8 h ») | ce jour-là, 7 h 30 |

« Dès 8 h » signifie que les rappels reprennent à l'ouverture, **sans garantie d'un appel à 8 h 00 précises**. Les textes (boutons, pastilles,
titres, phrase du formulaire, confirmation) viennent tous de `describe()` : aucun texte « 30 min » n'est écrit en dur. Sans JavaScript, le bouton
affiche « Demander un rappel » (aucune promesse horaire). La page est actualisée au prochain changement de créneau, au retour sur l'onglet et à la reprise du navigateur (jamais à la seconde).
**Le navigateur n'affiche qu'une estimation : le serveur recalcule le créneau à l'instant de la demande** et c'est ce résultat qui détermine l'e-mail et la page de confirmation.

## E-mails

Modèle unique : `netlify/lib/emails.mjs` (`renderEmail` : logo, couleurs, police, coordonnées, signature ; version HTML + texte brut). Contenus : confirmation devis,
confirmation rappel, alerte interne de rappel, rappel interne programmé. L'engagement « réponse sous 24 heures » est maintenu 7 jours sur 7.

| E-mail | Destinataire | Quand |
|---|---|---|
| Notification principale (devis : design B « Signature artisan premium », objets `📩 DEMANDE DE DEVIS - …` inchangés / `[RAPPEL CLIENT] Nouveau rappel à effectuer`) | `LEAD_TO_EMAIL` (ou `LEAD_QUARANTINE_EMAIL` si suspect) | toujours, immédiat |
| Confirmation client (« Votre demande de devis a bien été reçue — Style & Déco » / « Votre demande de rappel — Style & Déco ») | l'adresse du client, `Reply-To` : style.deco66@gmail.com | si activée **et** demande valide **et** non suspecte **et** adresse valide **et** notification principale acceptée |
| `[RAPPEL À EFFECTUER] Client à contacter dès 8 h` (programmé) | `LEAD_TO_EMAIL` | si activé, rappel hors créneau « 30 min », non suspect ; envoyé à ouverture − 30 min (`scheduled_at`, UTC calculé par le serveur) |

- **Design « Black Luxury », direction A « Luxe éditorial »** : page entièrement noire `#0b0d10` (aucune carte, aucun encadré), colonne de 600 px, logo centré, filets fins (`#2a2f37`, doré discret `#8a7447`), doré `#d7b56d` pour les liens et la promesse, titres blancs, texte blanc doux `#f5f5f4`, libellés gris clair `#bfc3ca`. Une seule famille sans empattement (pile du site : police système, Helvetica Neue, Segoe UI, Roboto, Arial ; aucun téléchargement), graisses 400 et 600, titre 25 px (23 px sur petit écran), texte 16 px, suivi 14–15 px, sans capitales ni espacement artificiel. Tableaux de présentation, styles en ligne, contrastes ≥ 4,5:1 (testés), aucun JavaScript, flexbox ou grille. `color-scheme: dark light` : un e-mail déjà sombre n'est pas inversé ; la lisibilité prime sur la fidélité exacte des couleurs.
- **Coordonnées** : source unique `BRAND` dans `netlify/lib/emails.mjs` (nom, activité, « Adresse administrative » 18 rue Madame de la Fayette 66750 Saint-Cyprien France — formulation qui ne laisse pas entendre un établissement ouvert au public —, téléphone `tel:+33650756242`, e-mail `mailto:style.deco66@gmail.com`, site `https://styleetdeco.fr`). Signature des confirmations clients : nom, activité, téléphone, e-mail, site ; pied de tous les e-mails : activité, adresse administrative, téléphone, e-mail, site. Toutes les coordonnées sont cliquables et reprises dans la version texte brut.
- **Logo** : le PNG officiel `sitesite-template/assets/images/email/logo-style-deco-email.png` (dérivé de `logo-fin-640.webp`, recadré sur ses marges transparentes : 512 × 312 px, transparence conservée, sans métadonnées, palette indexée de 256 couleurs, 44 Ko) est **hébergé sur notre domaine** et chargé directement par le HTML des quatre e-mails :
  `https://styleetdeco.fr/assets/images/email/logo-style-deco-email.png` (240 px dans les confirmations clients, 150 px dans les notifications internes ; texte alternatif « Style & Déco — Le Reflet de vos Envies », lisible sur fond noir si les images sont désactivées).
  **Aucune pièce jointe, aucun CID, aucun base64, aucune data URI, aucun SVG** : une image jointe peut apparaître comme pièce jointe « noname ». Plus aucune variable ne permet de réactiver l'ancienne méthode (un test vérifie que ni `attachments`, ni `cid:`, ni `base64` n'existent dans le code d'envoi).
  Le logo n'est disponible en production qu'**après la publication** de la PR (le fichier est livré avec elle) : ne pas activer les confirmations avant. Le fichier est servi avec un cache d'un an (`/assets/*`, `immutable`) : si le logo change un jour, utiliser un nouveau nom de fichier.
- **Contenu transactionnel** : aucune publicité, aucun suivi, aucune inscription à une liste. La confirmation ne recopie aucune donnée saisie (pas de nom ni de texte du visiteur) et ne
  promet ni devis établi, ni date de chantier. Tout contenu saisi est échappé dans les e-mails HTML internes.
- **Gmail sur téléphone** : l'e-mail d'alerte contient un bouton et un numéro cliquables (`tel:`). Une notification push dépend des réglages de l'application Gmail (notifications activées,
  catégorie « Boîte de réception principale » ou libellé important) : un e-mail programmé **n'est pas** une notification push garantie. Pour être alerté de façon fiable, créer un filtre Gmail sur
  l'objet `[RAPPEL CLIENT]` / `[RAPPEL À EFFECTUER]` → « Marquer comme important » + notifications « Prioritaires » sur le smartphone.

### Notification interne d'une demande de devis

Une seule notification par demande (elle remplace l'ancien tableau HTML), au même destinataire (`LEAD_TO_EMAIL`, ou `LEAD_QUARANTINE_EMAIL` si suspecte), avec le même objet et le même `Reply-To` (le client). Design B : logo officiel HTTPS en en-tête, titre « Nouvelle demande de devis », nom du client en grand et commune, téléphone (28 px, cliquable) et e-mail cliquable, boutons dorés « Appeler le client » et « Répondre par e-mail », section « Description des travaux » avec le **message intégral** (retours à la ligne conservés, jamais tronqué), puis « Informations de suivi » (origine lisible, date et heure Europe/Paris, référence). Seules les données réellement transmises par le formulaire sont affichées. Pour une demande suspecte, un bandeau « Demande suspecte placée en quarantaine : à vérifier avant de répondre (indices : …) » s'affiche en tête, le préfixe `[À VÉRIFIER]` et l'adresse de quarantaine sont conservés et aucune confirmation n'est envoyée au prospect. Le texte brut garde les libellés historiques (Formulaire, Priorité, Nom, Téléphone, E-mail, Ville / Zone, Détails, Reçu le, Référence, Contrôle antispam). Toutes les valeurs saisies sont échappées dans le HTML.

## Clés d'idempotence, conflits Resend et doublons

Chaque demande a un identifiant stable (`submission_id` du navigateur, ou empreinte du contenu + fenêtre de 10 min sans JavaScript). Une **clé distincte par opération, toujours liée à cet identifiant** :

| Opération | Clé `Idempotency-Key` |
|---|---|
| Notification principale | `lead-<id>` |
| Confirmation client | `confirm-devis-<id>` ou `confirm-rappel-<id>` (une confirmation par **demande**, jamais par adresse : deux demandes distinctes le même jour, même adresse, reçoivent chacune la leur ; une même demande répétée n'en produit qu'une) |
| Rappel interne programmé | `remind-<id>` ; secours : `remind-fallback-<id>` |

Le navigateur renouvelle l'identifiant si la saisie a changé depuis l'échec précédent. Chaque notification porte une **référence** (8 caractères, dérivée de la clé) pour le diagnostic.

**Réponses Resend et stratégie de nouvelle tentative** (conforme à la documentation : une clé est conservée 24 h ; même clé + même contenu → même réponse sans nouvel envoi) :

| Réponse | Traitement |
|---|---|
| 2xx avec identifiant | succès |
| Erreur réseau / timeout, 5xx, 429 | nouvelle tentative, **même clé et même contenu** (au plus 3 reprises, attentes 0,3 s / 0,9 s / 1,8 s, dans une échéance de 12 s pour la notification principale — le navigateur abandonne à 15 s — et 9 s pour les envois secondaires) |
| 409 `concurrent_idempotent_requests` (envoi encore en cours) | **jamais compté comme un succès** : mêmes nouvelles tentatives ; si l'envoi n'est pas terminé à l'échéance → échec (502 pour la notification principale ; consigné pour un envoi secondaire) |
| 409 `invalid_idempotent_request` (clé déjà utilisée avec un autre contenu) | **jamais rejoué** : la demande a déjà été traitée sous cette clé (réponse perdue, rechargement, double clic) → notification : « déjà reçue » (succès, aucun renvoi, aucun envoi secondaire) ; confirmation ou rappel : « déjà traité » (aucun e-mail de secours) |
| Autre 4xx (ex. 422) | refus définitif, aucune nouvelle tentative |

## Temps de réponse et `context.waitUntil()`

Le visiteur n'attend que la **notification principale**. Dès que Resend l'a acceptée, la fonction répond (`{ok:true, next:…}` ou redirection 303) ; la confirmation client et le rappel programmé
sont exécutés **après la réponse** grâce à `context.waitUntil()` de Netlify (« prolonge l'exécution de la fonction jusqu'à la fin de la promesse, sans bloquer la réponse », disponible pour les fonctions
déployées depuis le 20 mars 2025 ; la durée de l'exécution reste soumise à la limite de la fonction). La promesse n'est jamais abandonnée : si `waitUntil` n'existe pas (ancien déploiement, tests), la fonction l'attend. Les envois secondaires ne peuvent
donc pas provoquer un faux échec ni dépasser les 15 s du navigateur ; leurs erreurs sont journalisées (codes seulement). Risque résiduel : si la plateforme coupe l'exécution avant la fin (limite de durée de la fonction), un envoi secondaire peut ne pas partir ; la notification principale, elle, est déjà acceptée.

## Activation progressive

1. Fusionner : aucun changement visible côté e-mails client tant que les variables ne sont pas définies. Les **textes de rappel dynamiques** et le **champ e-mail facultatif** sont actifs dès la publication.
2. Vérifier que le logo répond (HTTP 200, `image/png`) sur l'URL de production ci-dessus. Puis, dans Netlify (projet `iridescent-twilight-cce7df`, portée Functions, contexte **Production uniquement**) : `LEAD_CLIENT_CONFIRMATIONS=on`, `LEAD_SCHEDULED_REMINDERS=on`. Relancer un déploiement.
3. Tests réels (à demander séparément, un par un, avec une adresse du dirigeant) : un devis, un rappel en journée avec e-mail, un rappel hors horaires (vérifier le rappel programmé dans Resend → Emails → *Scheduled*), contrôle du rendu et du logo dans Gmail et Apple Mail.
4. **Production explicite uniquement** : les confirmations et rappels programmés ne partent que si le contexte vaut exactement `production` (`context.deploy.context`, ou variable `CONTEXT`).
   Contexte absent, vide, inconnu, ambigu (les deux sources en désaccord), `deploy-preview` ou `branch-deploy` → désactivés, même si les variables sont définies globalement.

## Vérifications

```sh
node --test tests/*.test.mjs        # horaires, function (faux Resend), e-mails, formulaires
python3 -m unittest discover -s tests
```

Aucun test n'envoie d'e-mail : Resend est simulé (y compris l'idempotence et les pannes).

## Coûts et limites

Aucun nouveau service ni abonnement : Netlify Functions + Resend. Une demande consomme jusqu'à 3 e-mails Resend (notification, confirmation, rappel programmé). Vérifier les quotas du plan Resend
actuel (nombre d'e-mails par jour/mois) dans le tableau de bord avant activation : la documentation Resend limite la programmation à 30 jours.

## Limites connues

- **Limitation de débit native Netlify** : au-delà de 10 demandes par IP et domaine sur 60 secondes, Netlify réécrit la requête vers `/lead-rate-limited.html`. Cette page statique affiche le message d’échec validé, y compris sans JavaScript ; elle évite tout appel à Resend. Netlify peut mettre jusqu’à 10 secondes à appliquer cette protection après le dépassement ; quelques requêtes supplémentaires peuvent donc atteindre Resend. La règle est déclarée dans `netlify/functions/lead.mjs` et s’applique à toutes les offres Netlify.
- **Idempotence** : dépend de la fenêtre de conservation des clés par Resend (24 h). Une même clé avec un contenu différent est considérée comme « déjà traitée » (aucun renvoi) : un appel direct à la fonction qui réutiliserait un identifiant avec un autre contenu serait ignoré ; le navigateur, lui, change d'identifiant quand la saisie change.
- **Protections contre les abus** : limitation de débit native Netlify (10 demandes/min/IP), honeypot, contrôle d'origine, quarantaine et confirmations jamais envoyées pour une demande suspecte. Il n'existe pas de plafond par adresse (cela exigerait un stockage persistant, non ajouté).
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
