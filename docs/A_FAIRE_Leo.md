# À faire / à décider — côté Léo

> Récap de tout ce qui **ne peut pas être fait sans toi** (comptes externes, clés API,
> décisions, saisie de données). Classé par priorité. Les étapes détaillées sont données
> pour les setups complexes.
>
> Légende : ⏱️ rapide (< 5 min) · 🔧 setup technique · 🧭 décision · ⌨️ saisie de données

---

## 1. Sécurité — à activer maintenant

### 1.1 ⏱️ Renforcer les mots de passe (free tier)
> ⚠️ La protection « mots de passe compromis » (HaveIBeenPwned) est **réservée au plan Pro** de Supabase.
> On la **laisse tomber** pour rester à ~0 €/mois — non critique vu que les comptes sont créés par un admin
> (pas d'inscription publique) et qu'il n'y a que ~4 utilisateurs.

À la place, réglages **gratuits** disponibles dans **Authentication → Sign In / Providers → Auth Providers → Email** :
1. *Minimum password length* → mettre **12**.
2. *Password Requirements* → exiger lettres + chiffres + symboles.
3. **Save changes.**
4. Surtout : choisir des **mots de passe forts et uniques** pour chaque compte (§1.2).

*(Optionnel, sécurité renforcée sans coût : activer le **MFA/2FA** — onglet **Multi-Factor** — pour les co-présidents.)*

*C'est le seul avertissement de sécurité restant qui demande une action manuelle. Tout le reste a été corrigé côté base (RLS, fonctions, buckets, en-têtes HTTP).*

### 1.2 🔧 Créer les comptes individuels (fin du compte partagé)
Aujourd'hui tout le monde partage `vudeja.events@gmail.com`. Pour que la traçabilité et les
rôles fonctionnent, chaque personne a besoin de son compte.
1. Dashboard Supabase → **Authentication** → **Users** → **Add user**.
2. Saisir l'email + un mot de passe provisoire pour Théo, Dimitri, Corentin (et toi).
   → un profil « membre » est créé automatiquement.
3. Dans l'app : **Paramètres → Équipe**, pour chaque personne :
   - définir le **rôle** : **Co-président**, **Technique** ou **Membre** (voir §3.1) ;
   - renseigner nom/prénom, activer le compte.
4. Chaque personne se connecte et change son mot de passe.

---

## 2. Intégrations externes (clés API)

> ⚠️ **L'app n'est pas encore déployée en ligne** (pas de compte Vercel) : elle tourne
> uniquement en **local** (`npm run dev`). Donc pour l'instant, les variables se mettent
> **uniquement** dans le fichier `.env.local`. Le jour où on déploiera (voir §6), il faudra
> aussi les recopier chez l'hébergeur.

### 2.1 🔧 Gemini — résumés & extraction d'actions des réunions
Sert à résumer les transcripts de réunion et en extraire les tâches (gratuit).
1. Aller sur **https://aistudio.google.com/apikey** (compte Google Déjà Vu).
2. **Create API key** → copier la clé.
3. Ajouter la variable : `GEMINI_API_KEY=xxxxx`
   - (optionnel) `GEMINI_MODEL=gemini-2.0-flash` pour choisir le modèle.
4. Redéployer. → l'onglet **Réunions** pourra générer résumé + actions.

### 2.2 ✅ Google Drive — archivage automatique des documents
**DÉJÀ FAIT** — le Drive fonctionne (les sauvegardes factures/NDF sont créées), donc les
variables `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`
sont en place. Rien à refaire. *(Optionnel : `GOOGLE_DRIVE_ARCHIVE_NAME=Déjà Vu — Archives`.)*

> **Note console Google** : l'interface a changé (« Google Auth Platform »). Correspondance :
> External/Internal → onglet **Audience** · Publier (In production) → **Audience → Publishing status → Publish app** ·
> Scopes → onglet **Data Access** · Client OAuth → onglet **Clients**. L'activation des API
> (Drive/Calendar) reste dans **☰ → APIs & Services → Library**.

### 2.3 ✅ Google Agenda + Meet — réunions synchronisées
**DÉJÀ FAIT** — vérifié le 24/07/2026 : le refresh token existant contient **déjà** le scope
`calendar.events` (en plus de `drive.file`) et la **Google Calendar API est activée**. La sync
(création de réunion → événement + lien Meet dans l'Agenda Déjà Vu) fonctionne donc.
- **Rien à faire** : ça marche en local. *(Le script `scripts/google-oauth-token.mjs` demande
  désormais les deux scopes si jamais un jour il faut refaire le token.)*

### 2.4 ✅ Qonto — synchronisation bancaire
**DÉJÀ CONFIGURÉ** — les identifiants Qonto sont stockés en base et les relevés sont importés.
- Un formulaire pour **voir/modifier la clé depuis l'app** a été ajouté le 24/07/2026 :
  **Paramètres → Entreprise & documents → « 🏦 Connexion Qonto »** (identifiants pré-remplis).
- Pour lancer un import : **Finance → Sync Qonto**.
- *(À refaire uniquement si Qonto régénère la clé : la recoller dans ce formulaire.)*

---

## 3. Décisions à prendre

### 3.1 🧭 Attribuer les rôles (le système de rôles est en place)
3 rôles existent désormais. Décide qui est quoi (**Paramètres → Équipe**) :
| Rôle | Accès |
|---|---|
| **Co-président** | Tout (finance, devis, clients, paramètres, validation NDF). |
| **Technique** | Matériel, inventaire, préparation, plan technique, événements (sans devis), calendrier, réunions, ses notes de frais. **Pas** de finance/devis/clients. |
| **Membre** | Accueil, calendrier, réunions, avancement, équipe, ses notes de frais. Accès de base. |

### 3.2 ✅ Bucket « factures » entièrement privé — FAIT
Migration effectuée le 25/07/2026 : **tous** les fichiers (justificatifs NDF, factures
fournisseurs/Qonto, photos de retour, avatars, signatures) sont désormais dans le bucket
**privé** `docs-prives`, servis par **URLs signées** temporaires. Le bucket `factures` est
**vide et privé**. Le logo est stocké en base (base64), non concerné. Rien à faire.

### 3.3 🧭 Facturation électronique (échéance 2026-2027)
**Réponse à ta question « je peux pas juste télécharger le PDF et l'envoyer par mail ? »** :
- Pour tes clients **professionnels (B2B)**, quand l'obligation s'appliquera à toi : **non**.
  La facture devra transiter par une **plateforme agréée (PDP)** qui transmet des **données
  structurées** (format Factur-X) au client **et** déclare la facture à l'administration fiscale.
  Un simple PDF par mail ne sera **plus conforme** pour le B2B.
- Pour un client **particulier** : tu pourras continuer à envoyer un PDF, mais les données de
  la transaction devront être déclarées (e-reporting).
- **Calendrier** : réception par plateforme obligatoire pour tous en **sept. 2026** ; émission
  échelonnée — pour une petite structure comme Déjà Vu, l'obligation d'**émettre** via PDP
  arrive plutôt en **sept. 2027**.
- **En pratique** : **aujourd'hui, PDF par mail = OK**. D'ici ta date limite, il faudra choisir
  une PDP (souvent proposée par l'expert-comptable). Pas urgent, à préparer courant 2026-2027.

---

## 4. Saisie de données

### 4.1 ⌨️ Compléter les specs matériel (poids / consommation)
Ces valeurs alimentent les calculateurs élec & levage.
- Dans **Catalogue**, un bouton **« ⚠ Specs incomplètes (N) »** en haut liste les références à compléter,
  et un badge apparaît sur chaque fiche concernée.
- ~180 poids restent à renseigner (surtout le matériel son/structure). Les conso ont été
  pré-remplies quand elles étaient certaines.

### 4.2 ⌨️ Vérifier les specs auto-remplies (à confirmer)
J'ai renseigné certaines valeurs d'après les specs constructeur (**à revérifier**) :
vidéoprojecteurs EPSON, quelques projecteurs (CAMEO, Briteq…), CHAUVET Maverick Storm 1 Flex (650 W / 16,2 kg).
Un coup d'œil rapide pour valider ne fait pas de mal.

### 4.3 ⌨️ Logo de l'entreprise
Uploader le logo dans **Paramètres → Entreprise & documents** (apparaîtra sur les devis/factures PDF).

---

## 5. Déploiement en ligne (important, à faire un jour)

Aujourd'hui l'app tourne **uniquement sur ton ordinateur** (`npm run dev`). Pour que **toute
l'équipe** l'utilise (téléphones, à distance), il faut la **déployer en ligne**. Prévu sur
**Vercel (gratuit, ~0 €/mois)**. Étapes le moment venu (je peux t'accompagner) :
1. Créer un compte **vercel.com** (connexion avec GitHub conseillé) + pousser le code sur un repo Git.
2. **Import Project** → sélectionner le repo.
3. **Environment Variables** : y recopier **toutes** les variables de `.env.local`
   (Supabase, Google OAuth, ORS, Gemini quand tu l'auras…).
4. **Deploy** → l'app est en ligne avec une URL, installable en PWA sur mobile.
- Pas urgent tant que tu testes seul, mais nécessaire pour un usage en équipe.

---

## 6. Fonctionnalités futures (à décider si on les fait)

- **OCR des justificatifs de NDF** : lecture auto du montant/date depuis la photo d'un ticket.
  → nécessite de choisir un service (ex. Google Vision, ou Gemini qui est déjà là) et un petit
  développement. **Non commencé** — me dire si tu le veux, je te fais les étapes de setup.
- **Notification email** des notes de frais (en plus de l'in-app).
- **Portail client** (le client consulte/valide ses devis en ligne).
- **Audit mobile** complet (ergonomie terrain, PWA iOS/Android).

---

## Rappels techniques (pour info, rien à faire)
- Sécurité base de données : RLS activé partout, fonctions durcies, buckets non listables,
  en-têtes HTTP de sécurité, index de performance ajoutés. ✅
- Les avertissements Supabase restants (« RLS policy always true » sur 42 tables,
  `btree_gist` dans public) sont **volontaires / sans risque** à votre échelle.
