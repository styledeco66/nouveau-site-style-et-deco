# Roadmap SEO — Récupération trafic post-publication Perpignan

Diagnostic basé sur les données Google Search Console (janvier → mai 2026) et l'audit du code source.

---

## 🔐 Plan d'action sécurité — Audit du 2026-06-03

Audit complet effectué le 2026-06-03 (skill `/security-audit`). Score initial **88/100**. Aucune faille critique. Bon socle : pas de secrets exposés, pas de scripts tiers, pas de patterns XSS dans `app.js`, formulaires Netlify avec honeypot.

Objectif des actions ci-dessous : atteindre **97-100/100** et un grade A+ sur Mozilla Observatory / SecurityHeaders.com.

### Action S1 — ✅ FAIT (2026-06-03) — CSP en mode bloquant
(Fusionne avec l'action 7b existante — même tâche, formulation consolidée.)

**Livré :** commits `3cb0f04` (activation CSP + CORP same-origin) puis `86c1411` (retrait wildcards Netlify suite au flag MEDIUM de la security review automatisée). Un rollback temporaire de diagnostic (`26c86cb`) a été effectué pour vérifier si la CSP causait le problème mail Netlify — confirmé sans rapport, CSP réactivée immédiatement avec `60a3e9f`.

**Validation prod :** console Safari propre sur `/`, `/perpignan.html`, `/facade-saint-cyprien/`, soumission de formulaire test OK → redirection vers `/merci.html`, zéro erreur CSP.

**État final _headers :**
```
Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests
Cross-Origin-Resource-Policy: same-origin
```

---

### 📧 Incident notifications email Netlify Forms — résolu 2026-06-03

**Symptôme :** plus aucune notification email reçue depuis le **9 avril 2026** (dernier mail Netlify), alors que le compteur de soumissions montait normalement côté dashboard Netlify Forms. Confirmé que les soumissions arrivaient bien (test : `lead_hero` est passé de 19 à 20 submissions).

**Diagnostic effectué dans l'ordre :**
1. ❌ Hypothèse CSP : rollback test `26c86cb` → mail toujours pas reçu → CSP innocente.
2. ❌ Hypothèse Gmail filtre : test sur seconde adresse mail → idem au début, donc pas un filtre Gmail.
3. ✅ Cause identifiée : **les notifications Form étaient dans un état cassé côté Netlify** (héritage possible du sous-domaine `iridescent-twilight.netlify.app` antérieur au domaine `styleetdeco.fr`).

**Fix appliqué :** suppression des 2 notifications existantes (`lead_hero`, `lead_contact`) + recréation des 3 (ajout aussi de `lead_perpignan` qui n'avait jamais été configurée) dans le dashboard Netlify → **Form notifications**. Configuration retenue :
- Event : `New form submission`
- Email to notify : `style.deco66@gmail.com`
- Custom subject : `📩 Nouveau lead - {{form_name}}`
- Form : un par notif (`lead_hero`, `lead_contact`, `lead_perpignan`)

**Validation :** test de soumission → mail reçu sur les deux adresses configurées en ~1 minute.

**⚠️ À surveiller dans les semaines à venir :**
- Si le problème réapparaît → ouvrir un ticket Netlify Support en mentionnant la dépendance possible au sous-domaine `iridescent-twilight.netlify.app` originel.
- Vérifier de temps en temps que le compteur Netlify Forms et les mails reçus restent synchronisés (1 soumission = 1 mail).
- **`lead_perpignan` n'avait aucune notif depuis sa création** → tous les leads Perpignan d'avant aujourd'hui sont récupérables manuellement dans le dashboard Netlify Forms (1 soumission listée actuellement).

---

### Action S1 — (référence historique)

**Pourquoi :** la CSP actuelle est en `Report-Only` — elle journalise les violations mais ne bloque rien. L'audit du code confirme qu'aucune ressource externe n'est chargée, donc l'activation en mode bloquant est sans régression attendue.

**Quand :** 3 à 7 jours après le déploiement du commit `66c582f` (2026-06-03), une fois qu'aucun avertissement `[Report Only]` n'apparaît en DevTools Console.

**Comment tester avant activation :**
1. Ouvrir https://styleetdeco.fr/ en navigation privée
2. F12 → onglet **Console**
3. Naviguer sur les 4 pages principales (`/`, `/perpignan.html`, `/peintre-saint-cyprien/`, `/facade-saint-cyprien/`) + soumettre un formulaire de test
4. Repérer d'éventuels messages `[Report Only]` listant une ressource bloquée non prévue

**Modif à appliquer dans [sitesite-template/_headers](../sitesite-template/_headers) :**
- Renommer `Content-Security-Policy-Report-Only:` → `Content-Security-Policy:`
- Ajouter `upgrade-insecure-requests` à la fin
- Garder `form-action 'self'` strict (les formulaires soumettent vers `/merci.html` same-origin ; Netlify Forms intercepte côté serveur, le navigateur ne voit qu'un POST same-origin — pas besoin de whitelister `*.netlify.app` qui ouvrirait une voie d'exfiltration sur un domaine partagé)

```
Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests
```

**Si la console signale des ressources légitimes bloquées :** ajuster les directives concernées, puis re-tester avant de retirer `-Report-Only`.

**Effort :** 15 minutes (5 min de test + 5 min de modif + 5 min de vérif post-déploiement).
**Mesure d'efficacité :** scan https://securityheaders.com/?q=styleetdeco.fr → doit passer de B à A.

---

### Action S2 — ❌ ABANDONNÉ (2026-06-04) — reCAPTCHA Netlify (choix UX client)

**Décision finale :** reCAPTCHA **non retenu**. On garde uniquement le honeypot `bot-field` sur les 3 formulaires. Petit gain net conservé : `lead_perpignan` a désormais le honeypot qui lui manquait (commits de la session du 2026-06-04, état final `79ebd93`).

**Pourquoi abandonné :**
1. **UX** — reCAPTCHA v2 (case « Je ne suis pas un robot ») escalade automatiquement vers le **défi images** (« sélectionnez les feux / bus… ») dès que Google a un doute. Ce comportement **n'est pas désactivable**. Friction jugée trop pénalisante pour des prospects sur un site vitrine artisan.
2. **Sécurité du widget manuel** — pour couvrir le `lead_hero` (que l'auto-injection Netlify ignorait, car Netlify ne traite qu'**un seul formulaire reCAPTCHA par page**), on avait testé un widget `g-recaptcha` manuel avec la sitekey Netlify. **Échec confirmé par test** : une soumission POST **sans `g-recaptcha-response`** était acceptée dans « Verified submissions » → le widget manuel **n'est PAS vérifié côté serveur** par Netlify (seul `data-netlify-recaptcha="true"` déclenche la vérif serveur). Un captcha non vérifié = fausse sécurité (flag MEDIUM de la security review automatisée). 

**⚠️ Apprentissages à ne pas refaire :**
- Le widget `g-recaptcha` manuel sur Netlify Forms est **décoratif** (pas de vérif serveur). Ne pas le réutiliser.
- L'auto-injection `data-netlify-recaptcha` ne couvre qu'**un formulaire par page** → le `lead_hero` de la home restait à découvert de toute façon.

**Si on veut une vraie protection anti-bot plus tard (sans reCAPTCHA Google) :**
- Option A : Netlify Function qui vérifie un token côté serveur avant d'accepter (plus de code).
- Option B : question anti-bot maison simple (ex. « 2 + 3 = ? ») validée côté Netlify — zéro images, faible friction.
- Pour l'instant : **honeypot seul suffit** au volume actuel (quota Netlify Forms gratuit = 100 soumissions/mois, marge OK).

**Fichiers (état final, honeypot seul) :**
- [sitesite-template/index.html](../sitesite-template/index.html) — `lead_hero` + `lead_contact`
- [sitesite-template/perpignan.html](../sitesite-template/perpignan.html) — `lead_perpignan`

---

### Action S3 — 🟠 [MOYEN] Sortir les styles inline du HTML pour durcir `style-src`

**Pourquoi :** la CSP autorise `style-src 'unsafe-inline'` à cause des `style="..."` dispersés dans le HTML (honeypots, [merci.html:17](../sitesite-template/merci.html#L17), etc.). Tant que ces styles inline existent, on ne peut pas atteindre une CSP stricte.

**Fichiers à nettoyer :**
- [sitesite-template/index.html:244](../sitesite-template/index.html#L244) (`style="display:none;"` honeypot — utiliser `.is-hidden` déjà défini en CSS)
- [sitesite-template/index.html:637](../sitesite-template/index.html#L637) (idem honeypot lead_contact)
- [sitesite-template/perpignan.html](../sitesite-template/perpignan.html) (honeypot perpignan)
- [sitesite-template/merci.html:17, 21](../sitesite-template/merci.html) (styles inline `max-width`, `text-align`, `display: grid`)
- Tout autre `style="..."` détectable via `grep -rn 'style="' sitesite-template/*.html`

**Méthode :**
1. Lister tous les styles inline : `grep -rn 'style="' sitesite-template/ --include='*.html'`
2. Pour chaque cas, créer une classe utilitaire dans `assets/css/style.css` (ex: `.u-hidden`, `.u-textCenter`, `.merci__actions`)
3. Remplacer `style="..."` par `class="..."`
4. Une fois zéro style inline restant : retirer `'unsafe-inline'` de `style-src` dans `_headers`

**Effort :** 1-2h (dépend du nombre de styles inline à migrer).
**Mesure d'efficacité :** Mozilla Observatory passe de A à A+ (CSP stricte vaut +20 points sur leur grille).

---

### Action S4 — ✅ FAIT (2026-06-03) — Durcir `Cross-Origin-Resource-Policy`

**Livré :** commit `3cb0f04` (groupé avec S1). `CORP: same-site` → `CORP: same-origin`.

---

### Action S4 — (référence historique)

**Pourquoi :** le site ne sert aucune ressource cross-origin légitime. `same-site` est plus laxiste que nécessaire.

**Fichier :** [sitesite-template/_headers:9](../sitesite-template/_headers#L9)

**Modif :**
```
Cross-Origin-Resource-Policy: same-origin
```

**Effort :** 2 minutes. **Risque :** nul (aucun embed externe légitime).
**À faire après S1** (regrouper en un seul commit headers).

---

### Action S5 — 🟢 [FAIBLE] Adopter la convention `rel="noopener noreferrer"` pour les liens externes

**Pourquoi :** préventif. Tout futur lien `target="_blank"` vers Google Reviews, Instagram, Maps, etc. doit avoir `rel="noopener noreferrer"` pour éviter le tabnabbing.

**Convention à graver dans CLAUDE.md (ou un commentaire en tête de `index.html`) :**
```html
<a href="https://google.com/maps/..." target="_blank" rel="noopener noreferrer">Voir sur Google Maps</a>
```

**Effort :** instantané (note de convention). Aucun lien externe `target="_blank"` actuellement.

---

### Action S6 — 🟢 [FAIBLE] Mettre en place un reporting CSP léger

**Pourquoi :** une fois la CSP active (S1), capter les violations en prod pour détecter des régressions silencieuses (ex: ajout futur d'un script tiers qui casse).

**Option recommandée :** compte gratuit https://report-uri.com/ (500 000 reports/mois gratuits).

**Modif _headers (après création du compte) :**
```
Content-Security-Policy: ... ; report-uri https://<TON-SUBDOMAIN>.report-uri.com/r/d/csp/enforce
```

**Effort :** 20 minutes (création compte + ajout directive + 1 semaine de surveillance).
**Quand :** 1 mois après S1, une fois la CSP stabilisée.

---

### Action S7 — 🟢 [FAIBLE] Audit récurrent trimestriel

**Pourquoi :** maintenir le grade dans le temps. Sites statiques = surface d'attaque faible, mais une régression (ex: ajout de Google Analytics sans mise à jour CSP) peut casser le socle.

**Procédure trimestrielle (15 min) :**
1. Re-scan https://securityheaders.com/?q=styleetdeco.fr → grade attendu : A ou A+
2. Re-scan https://observatory.mozilla.org/analyze/styleetdeco.fr → grade attendu : A+
3. Vérifier les rapports CSP sur report-uri.com (action S6) → zéro nouvelle violation non-expliquée
4. Re-relancer le skill `/security-audit` si changement majeur du code

**Prochaine échéance prévue :** 2026-09-03.

---

### Ordre d'exécution recommandé

| # | Action | Priorité | Effort | Statut |
|---|--------|----------|--------|--------|
| S1 | CSP en mode bloquant | 🟡 Élevé | 15 min | ✅ FAIT 2026-06-03 |
| S4 | Durcir CORP | 🟢 Faible | 2 min | ✅ FAIT 2026-06-03 |
| S2 | reCAPTCHA Netlify | 🟠 Moyen | — | ❌ ABANDONNÉ 2026-06-04 (choix UX) — honeypot conservé |
| S3 | Sortir styles inline | 🟠 Moyen | 1-2h | 🟡 À faire — idéalement avant S2 |
| S5 | Convention `rel="noopener"` | 🟢 Faible | 0 | 🟡 Note à graver dans CLAUDE.md |
| S6 | Reporting CSP | 🟢 Faible | 20 min | 🟢 1 mois après S1 (≥ 2026-07-03) |
| S7 | Audit trimestriel | 🟢 Faible | 15 min | 🟢 Prochain : 2026-09-03 |

### Ce qu'on NE fait PAS

- **Pas de WAF / Cloudflare** devant Netlify — surcoût injustifié pour un site statique sans backend.
- **Pas de SRI (`integrity=`) sur les ressources locales** — `style.css` et `app.js` sont servis depuis le même origin, SRI n'apporte rien ici. Pertinent uniquement pour des CDN externes (ce qu'on n'a pas).
- **Pas de mise en place d'un Bug Bounty** — disproportionné à l'échelle du site.

---

## 🟡 À FAIRE (SEO)

### 7b. Passer la CSP en mode bloquant (suite de #7)

> ⚠️ Cette section est désormais consolidée dans **Action S1** ci-dessus. Conservée temporairement pour référence — supprimer une fois S1 terminée.
**Quand :** 3 à 7 jours après le déploiement du commit `66c582f` (2026-06-03), si aucun avertissement CSP imprévu n'apparaît en DevTools Console sur le site déployé.

**Comment tester :**
1. Ouvrir https://styleetdeco.fr/ en navigation privée
2. F12 → onglet **Console**
3. Naviguer sur les 4 pages principales (/, /perpignan.html, /peintre-saint-cyprien/, /facade-saint-cyprien/) + soumettre un formulaire de test
4. Repérer d'éventuels messages `[Report Only]` listant une ressource bloquée non prévue

**Si la console est propre → durcir :**
Dans `sitesite-template/_headers`, remplacer `Content-Security-Policy-Report-Only:` par `Content-Security-Policy:` (retirer le suffixe `-Report-Only`). La CSP devient alors bloquante : toute violation refuse réellement le chargement de la ressource au lieu de simplement journaliser.

**Si la console signale des ressources légitimes bloquées :**
Ajuster les directives concernées dans `_headers` (par exemple ajouter un domaine autorisé), puis re-tester avant de retirer `-Report-Only`.

---

## 🎯 Plan d'action stratégique — Expansion mots-clés (post-#7)

### Contexte

Analyse GSC du 2026-06-03 sur la période 2026-03-01 → 2026-06-03 : le site génère **0 clic sur 90+ requêtes affichées**, sauf 5. Google connaît le site, le montre dans les SERP, mais positions trop basses ou titles peu accrocheurs. **4 clusters de mots-clés exploitables** identifiés, ciblant des prestations réellement réalisées par Style et Deco (confirmé 2026-06-03 : pose parquet, pose plafond, stuc inclus).

### Action 9 — Enrichir `/facade-saint-cyprien/` (cluster 2)

**Cible :** sous-cluster façade Saint-Cyprien — la page existe mais sous-performe (page-mère ranke devant elle).

**Données GSC à l'origine :**
- `peinture de façades saint-cyprien` : 27 impressions cumulées, page façade en position 22,0 (la home ranke devant en 15,1 → mauvaise hiérarchie interne)
- `ravalement façades saint-cyprien` : 13 impressions, position 13,2 ✓ déjà bien
- `application peinture imperméable saint-cyprien` : 16 impressions, position 24
- `réparation de fissures saint-cyprien` : 18 impressions, position 32,9

**Ce qu'on fait concrètement :**
1. Audit du `<title>` et H1 → forcer « peinture façade Saint-Cyprien » en mots exacts
2. Ajouter section « Application de peinture imperméable » (avec mention « littoral méditerranéen »)
3. Ajouter section « Réparation de fissures et reprises d'enduit »
4. Sur la home et autres pages : changer les ancres internes pointant vers `/facade-saint-cyprien/` de « Façades » à « Peinture façade » (signal de pertinence pour Google)
5. Vérifier JSON-LD `LocalBusiness` de la page : `serviceType` doit lister « peinture façade », « ravalement », « peinture imperméable »

**Effort :** ~1-2h. **Risque :** faible (modif additive sur page existante).

**Mesure d'efficacité :** position de `/facade-saint-cyprien/` sur « peinture de façades saint-cyprien ». Objectif : passer de 22 à < 10. Bonus : devenir la page-cible devant la home.

---

### Action 10 — Créer `/peinture-sol-saint-cyprien.html` (cluster 1) 🔥

**Cible :** cluster 1 « peinture de sol Saint-Cyprien » — **la plus grosse opportunité du diagnostic**.

**Données GSC à l'origine (97 impressions cumulées sur 7 requêtes) :**
- `peinture de sol extérieurs saint-cyprien` : 17 impressions, **position 5,4** 🟢
- `peinture de sol saint-cyprien` : 13 impressions, **position 5,6** 🟢
- `peinture de sol maison saint-cyprien` : 25 impressions, position 17,4 (la home ranke en 4,0 → besoin d'une page dédiée plus pertinente)
- `peinture de revêtements de sol saint-cyprien` : 14 impressions, position 10
- `peinture de sol garage saint-cyprien` : 9 impressions, position 22,1
- `application peinture imperméable saint-cyprien` : 16 impressions, position 24
- `peinture de sol extérieur` (déclinaison) : couverte aussi

**Pourquoi c'est l'or :** Google te montre **déjà** sur ces requêtes (position 5-6 sur deux d'entre elles) mais sans page dédiée pour transformer l'impression en clic. La home ranke par défaut faute de mieux.

**Ce qu'on fait concrètement :**
1. Nouvelle page `sitesite-template/peinture-sol-saint-cyprien.html`
2. Structure : H1 « Peinture de sol à Saint-Cyprien », H2 par type (sol intérieur / sol extérieur / sol garage / revêtements / peinture imperméable)
3. Photos avant/après (à fournir par toi, ou utiliser placeholders en attendant)
4. JSON-LD LocalBusiness ciblé + BreadcrumbList + FAQPage
5. Ajout dans le sitemap avec priorité 0.8
6. Maillage : lien dans la nav (sous Saint-Cyprien ?) + footer + cross-links depuis `/peintre-saint-cyprien/`
7. Title accrocheur : ~55 char incluant « Saint-Cyprien »

**Effort :** ~3-4h (contenu original à rédiger). **Risque :** faible.

**Mesure d'efficacité :** clics totaux du cluster + position sur « peinture sol saint-cyprien ». Objectif : 3-8 clics/mois sur ce cluster en 4-6 semaines.

---

### Action 11 — Créer `/parquet-plafond-stuc-saint-cyprien.html` (cluster 3)

**Cible :** cluster 3 « services complémentaires Saint-Cyprien » — prestations confirmées par le client (pose parquet, pose plafond, stuc).

**Données GSC à l'origine :**
- `rénovation de parquet saint-cyprien` : 14 impressions, position 13,2
- `pose de parquet saint-cyprien` : 5 impressions, position 13,4
- `pose de plafonds saint-cyprien` : 8 impressions, position 40,3
- `pose de plafonds entreprise saint-cyprien` : 5 impressions, position 35,8
- `réalisation de murs en stuc saint-cyprien` : 12 impressions, position 14,7
- `traitement de joints saint-cyprien` : 6 impressions, position 25,0

**Ce qu'on fait concrètement :**
1. Page consolidée (volumes individuels trop faibles pour 3 pages séparées)
2. H1 « Pose de parquet, plafond et stuc à Saint-Cyprien »
3. 3 sections H2 distinctes (parquet / plafond / stuc) + section « traitement joints »
4. JSON-LD + BreadcrumbList + maillage interne (depuis `/peintre-saint-cyprien/`)
5. Sitemap + nav (sous-section Saint-Cyprien)

**Effort :** ~2-3h. **Risque :** faible.

**Mesure d'efficacité :** apparition de clics sur les 6 requêtes du cluster.

---

### Ordre d'exécution recommandé

1. **Action 8** — quick win, ce soir si validé (30 min)
2. **Pause de 2-3 semaines** pour laisser Google digérer les modifs #1-#7 + #8 et mesurer l'effet
3. **Actions 9, 10, 11** — selon résultats GSC fin juin
4. **Recomparaison GSC fin juin / début juillet** — déjà prévue par la roadmap initiale

### Ce qu'on NE fait PAS

- **Pas de page « Saint-Génis » ou « Sorède » dédiée** pour l'instant (Action 8 = light suffit, on évalue avant d'investir plus)
- **Pas de travail sur les requêtes de marques concurrentes** (`decostyl`, `déco style`, `decostyle`) — 197 impressions cumulées avec 0 clic, ces gens ne cherchent pas Style et Deco
- **Pas de nouvelles modifs sur `/perpignan.html`** au-delà de l'Action 8 — laisser Google re-crawler la version enrichie d'hier avant d'y toucher

---

## ✅ FAIT

### 12. Refonte de la page `/merci.html` — 2026-06-04

Commit `1ffeee6` (push origin/main).

**Avant :** page de confirmation quasi vide (titre + une ligne + 2 boutons), avec styles inline.

**Après :** page rassurante au ton chaleureux (artisan à la 1re personne), dans la charte couleur du site (uniquement tokens existants `--accent` or, `--panel`, `--shadow`… — aucune couleur inventée) :
- Badge ✓ doré + « Merci pour votre confiance »
- Bloc « Et maintenant ? » en 3 étapes (demande reçue → rappel sous 24h ouvrées → devis gratuit sans engagement)
- Contact direct : téléphone cliquable + horaires Lun-Sam 8h-19h
- Styles dédiés `.merci__*` ajoutés en fin de `assets/css/style.css`
- **Zéro style inline** (les 2 styles inline d'origine de la page sont éliminés → petit pas vers l'action S3)

Page toujours en `noindex,follow` (correct pour une page de confirmation).

---

### 8. Extension villages Albères sur `/perpignan.html` — 2026-06-03

Commit `c19b038` (push origin/main).

**Modifs livrées :**
- JSON-LD `LocalBusiness` : ajout de `Saint-Génis-des-Fontaines` et `Sorède` dans `areaServed`.
- Section « Quartiers et communes desservis » restructurée de 3 → 4 cards :
  - Nouvelle card **« Villages des Albères & Côte Vermeille »** mettant Saint-Génis-des-Fontaines et Sorède en mots-clés exacts (gras), élargie à Argelès-sur-Mer, Laroque-des-Albères, Villelongue-dels-Monts, Saint-André, Palau-del-Vidre.
  - Card existante « Plaine du Roussillon » nettoyée (anciens villages des Albères déplacés vers la nouvelle card).
- Paragraphe d'intro de la section enrichi : mention explicite « peintre en bâtiment » + les 2 villages cibles en gras.
- `sitemap.xml` : `lastmod` de `/perpignan.html` mis à jour au 2026-06-03 (déclencheur recrawl).

**Cible mesure :** position GSC sur `peintre en bâtiment à saint-génis-des-fontaines` (avant : 60,3 / 36 impressions) et `peintre en bâtiment à sorède` (avant : 72,2 / 18 impressions). Objectif : < 30 sous 3-4 semaines.

**À surveiller** : recomparaison GSC fin juin sur ces 2 requêtes spécifiques.

---

### 7. Audit sécurité headers HTTP & nettoyage warnings Semgrep — 2026-06-03

Commit `66c582f` (push origin/main).

#### A. Headers HTTP ajoutés dans `sitesite-template/_headers`

**`Content-Security-Policy-Report-Only`** (mode observation, ne bloque rien — voir #7b pour le durcissement) :
```
default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'
```
- **À quoi ça sert** : protection principale contre les attaques XSS. Le navigateur refuse de charger toute ressource (JS, CSS, image, iframe) qui ne respecte pas ces règles.
- **Pourquoi ces directives** : le site n'a aucune dépendance externe (audit fait avant l'ajout — aucun CDN, aucune font Google, aucun analytics). Tout vient de `'self'`. `'unsafe-inline'` est requis dans `style-src` à cause des 15 attributs `style="..."` inline présents dans les pages. Pas requis dans `script-src` (aucun JS inline, juste des `<script type="application/ld+json">` qui sont des données structurées, pas du code exécuté).
- **Pourquoi `-Report-Only`** : on observe d'abord pour s'assurer qu'aucune ressource légitime n'est faussement bloquée. Le durcissement (action #7b) se fera quand on aura validé que la console est propre.

**`Cross-Origin-Opener-Policy: same-origin`** (COOP) :
- **À quoi ça sert** : empêche une page externe (ouverte via `target="_blank"` ou popup) d'accéder à `window.opener` sur ton site. Bloque les attaques de type tabnabbing (un site externe qui redirige silencieusement ton onglet vers du phishing).

**`Cross-Origin-Resource-Policy: same-site`** (CORP) :
- **À quoi ça sert** : empêche des sites tiers d'embarquer tes images/CSS/JS dans leurs pages. Défense en profondeur contre certaines attaques side-channel type Spectre.

#### B. Suppressions Semgrep — 8 commentaires `<!-- nosemgrep: ... -->` ajoutés

**Faux positif 1 — Règle `html.security.audit.missing-integrity.missing-integrity`**

Semgrep alerte sur l'absence d'attribut `integrity` (SRI) sur les balises `<link rel="canonical">`. **C'est un faux positif :** la spec W3C limite SRI aux ressources exécutables (`<script src>` et `<link rel="stylesheet">`). Un canonical n'est pas chargé par le navigateur, c'est une métadonnée pour les moteurs de recherche.

Suppressions ajoutées dans 7 fichiers (une par fichier, juste au-dessus de la balise canonical) :
- `sitesite-template/index.html` (ligne 11)
- `sitesite-template/perpignan.html` (ligne 11)
- `sitesite-template/peintre-saint-cyprien/index.html` (ligne 9)
- `sitesite-template/facade-saint-cyprien/index.html` (ligne 11)
- `sitesite-template/merci.html` (ligne 8)
- `sitesite-template/legal/mentions-legales.html` (ligne 8)
- `sitesite-template/legal/politique-confidentialite.html` (ligne 8)

Format du commentaire : `<!-- nosemgrep: html.security.audit.missing-integrity.missing-integrity -->`

**Faux positif 2 — Règle `python.django.security.django-no-csrf-token.django-no-csrf-token`**

Semgrep alerte sur l'absence de jeton CSRF dans le formulaire `lead_perpignan`. **C'est un faux positif :** la règle cible les templates Django (framework Python attendant `{% csrf_token %}`). Le site est un site statique HTML servi par Netlify. Les formulaires Netlify ont leur propre protection anti-spam (honeypot `bot-field`, validation Netlify). De plus, le CSRF classique n'est pas applicable à un site statique sans backend authentifié.

Suppression ajoutée dans 1 fichier :
- `sitesite-template/perpignan.html` (ligne 200, juste au-dessus du `<form name="lead_perpignan">`)

Format : `<!-- nosemgrep: python.django.security.django-no-csrf-token.django-no-csrf-token -->`

**Note :** seule la règle CSRF se déclenche sur `perpignan.html`. Les forms `lead_hero` et `lead_contact` de `index.html` ne déclenchent pas Semgrep (le contexte du fichier diffère). Donc pas de suppression ajoutée là — si la règle se déclenchait un jour, on ajouterait au cas par cas.

#### C. Vérification

Scan Semgrep complet post-modifications : **0 finding** ✓

#### D. Ce qui change visuellement / fonctionnellement

**Rien.** Le site se comporte exactement comme avant pour les visiteurs et pour Googlebot. Les en-têtes HTTP sont transparents pour l'expérience utilisateur, et la CSP en `-Report-Only` n'empêche aucun chargement.

#### E. Impact SEO

- **Direct** : aucun. Action #7 = audit sécurité, pas optimisation SEO. Les gains visibilité Perpignan viennent des actions #1 à #6.
- **Indirect** : très marginal. Google a confirmé HTTPS comme facteur de ranking, pas les autres headers. Score `securityheaders.com` qui passe potentiellement à A/A+ (signal de qualité, pas facteur de classement).

#### F. À surveiller

Voir action **#7b** ci-dessus (passage en CSP bloquante après vérification DevTools dans 3-7 jours).

---

### 5. Harmoniser le sitemap.xml — 2026-06-03
Dans `sitesite-template/sitemap.xml` :
- `<lastmod>`, `<changefreq>`, `<priority>` ajoutés sur les 6 URL
- Hiérarchie de priorités : home 1.0, `/perpignan.html` 0.9, pages locales 0.8, legals 0.3
- `lastmod` 2026-05-25 sur les 4 pages SEO modifiées, 2026-02-16 sur les legals (date réelle dernier commit)

Commit `21cf4bd` (push origin/main) regroupant actions #1 à #5.

### 6. Indexation manuelle GSC demandée — 2026-06-03
- Sitemap re-soumis dans Search Console → relu le 2026-06-03, 6 URL découvertes, statut "Opération effectuée"
- Inspection URL + "Demander une indexation" pour `https://styleetdeco.fr/perpignan.html` → file prioritaire
- Inspection URL + "Demander une indexation" pour `https://styleetdeco.fr/` → file prioritaire
- Statut des 2 URL : "La page est indexée" (déjà connues de Google, recrawl prioritaire demandé)

**À recomparer** : performances GSC fin juin / début juillet 2026 (4 semaines après livraison, cf. note finale).

### 1. Maillage interne corrigé — 2026-05-25
Ajout du lien "Perpignan" (et harmonisation Saint-Cyprien/Façades) dans nav desktop, nav mobile et footer des 3 pages :
- `sitesite-template/perpignan.html`
- `sitesite-template/peintre-saint-cyprien/index.html`
- `sitesite-template/facade-saint-cyprien/index.html`

Ajout de `aria-current="page"` sur le lien actif de chaque page (bonne pratique a11y).

### 2. JSON-LD ajouté sur `/perpignan.html` — 2026-05-25
Deux blocs `application/ld+json` insérés dans le `<head>` :
- **LocalBusiness** ciblé Perpignan : `areaServed` listant Perpignan, Cabestany, Canet-en-Roussillon, Saint-Estève, Bompas, Le Soler, Rivesaltes + `Pyrénées-Orientales` ; ajout `addressRegion` et `openingHoursSpecification` (Lun-Ven 8h-18h)
- **BreadcrumbList** : Accueil → Peintre à Perpignan

Validation syntaxique JSON effectuée (les 2 blocs sont des JSON valides).

### 4. "Perpignan" restauré dans les metas de la home — 2026-05-25
Modifications sur `sitesite-template/index.html` :
- `<title>` : `Peintre Saint-Cyprien & Perpignan (66) | Style et Deco` (55 caractères, sous la limite Google ~60)
- `<meta description>` : 165 caractères, contient les 2 villes + "Pyrénées-Orientales"
- `og:title`, `og:description`, `twitter:title`, `twitter:description` : alignés sur les mêmes valeurs

Régression du commit `2debc12` (29/03/2026) corrigée — la home redevient éligible aux requêtes Perpignan dans les SERP.

### 3. Contenu de `/perpignan.html` enrichi à 767 mots — 2026-05-25
Passage de **≈150 → 767 mots** dans `<main>` (vérifié). 6 nouvelles sections ajoutées :
- "Votre artisan peintre en bâtiment à Perpignan" (présentation locale)
- "Nos prestations de peinture à Perpignan" (3 cards : intérieure, extérieure/façade, décoration)
- "Quartiers et communes desservis" (3 cards : Perpignan quartiers, limitrophes, plaine du Roussillon — ~25 toponymes)
- "Pourquoi le climat méditerranéen impose des peintures adaptées"
- "Délais d'intervention et déroulé d'un chantier" (méthode en 3 étapes)
- **FAQ locale** (5 questions Perpignan) + **JSON-LD FAQPage** correspondant

Total JSON-LD sur la page : 3 blocs (LocalBusiness, FAQPage, BreadcrumbList) — tous validés syntaxiquement.

---

## 📊 Données de référence (avant intervention)

Source : GSC, comparaison **28/02 → 28/03** vs **26/04 → 25/05** (propriété `https://styleetdeco.fr/`).

| Métrique | Période avant | Période après |
|---|---|---|
| Clics home | 26 | 5 (-80,8 %) |
| Clics `peintre saint cyprien` | 8 | 2 (-75 %) |
| Position `peintre saint cyprien` | 1-2 | 1-2 (inchangée) |
| Clics `/perpignan.html` | — | 0 |
| Impressions `/perpignan.html` | — | 0 |

**Statut indexation** `/perpignan.html` : indexée, dernier crawl 2026-03-29.

À recomparer 4 semaines après livraison complète de la roadmap.
