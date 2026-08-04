# Déjà Vu — Améliorations à prévoir (backlog)

## Finance — gros chantiers en attente de specs (juin 2026)
- [ ] **Calculateur ROI** (cf. `Fichiers exemples/ROI.xlsx`) : rentabilité prévisionnelle des achats + **réel vs attendu**.
- [x] **Import historique 2024/2025** (Compta.xlsx) : 97 écritures réelles importées, report de solde automatique entre années (net 2024 = 312,84 € ; fin 2025 = 1 673,84 €, conforme).
- [ ] **Export bilan comptable annuel** (cf. `Fichiers exemples/...Bilan...2025.pdf`) : compte de résultat (auto) + bilan Actif/Passif.
- [ ] **Note de Frais (NDF)** (cf. `Fichiers exemples/Template NDF.pdf`) : demande de remboursement → prévisionnel sortie + signature des co-présidents (Théo, Léo, Dimitri, Corentin).
- [ ] **Validation des écritures auto** (champ `valide`) — à faire avec l'auto-alimentation (Phase 6B) / Qonto.
- [x] Logo sur le site + documents ; onglet Flux journalier ; export CSV entre 2 dates.


Liste des points d'amélioration identifiés en cours de route, à traiter dans une
phase ultérieure. Mise à jour au fil de l'eau.

## Multi-utilisateur, Notes de frais & Archivage Drive (demandé 28/06/2026)

Ces trois chantiers sont liés et conditionnent la suite. Ordre conseillé : **1 → 2 → 3**.

### 1. Multi-utilisateur (prérequis des autres) — PHASE 1 FAITE ✅ (28/06/2026)
- [x] Table `membre` liée à `auth.users` (nom, rôle `co_president`/`membre`, actif) + trigger d'auto-création + backfill.
- [x] **Logs / traçabilité** : colonnes `created_by` sur `prestation`, `devis_facture`, `ecriture_financiere` (stampées à la création).
- [x] Pré-remplissage auto du champ « effectué par » (écriture) à partir de l'utilisateur connecté + affichage « Créé par X » sur la prestation.
- [x] Écran **Paramètres → Équipe** : nommer chaque membre, définir le rôle, activer/désactiver.
- [ ] **Créer les comptes individuels** (Supabase Auth) pour Théo, Léo, Dimitri, Corentin — aujourd'hui un seul compte partagé (`vudeja.events@gmail.com`).
- [ ] Reste : affichage « créé par / modifié par » sur les autres écrans (document, journal), `modifie_par`, et restreindre certaines actions selon le rôle si souhaité.

### 2. Notes de frais (NDF) — PHASE 2 FAITE ✅ (28/06/2026) — cf. `Fichiers exemples/Template NDF.pdf`
- [x] **Onglet « Notes de frais »** (nav + tuile accueil) + tables `note_frais` / `ligne_note_frais`.
- [x] **Téléversement de justificatifs** (photo/PDF) par ligne (stockage Supabase, bucket `factures`).
- [x] **Génération** : demandeur = utilisateur connecté ; lignes (libellé, date, montant, justificatif) ; total auto.
- [x] **Workflow** `brouillon → soumise → validée / refusée`, validation horodatée. Règle : **un seul co-président**, **différent du demandeur**, suffit.
- [x] **Notification in-app** : section « À valider » sur l'onglet + **bannière sur l'accueil** pour les co-présidents.
- [x] **Impact trésorerie** : à la validation, **ligne prévisionnelle auto** (sortie « Remboursement frais »). Repasser en brouillon supprime cette ligne.
- [x] **Export PDF** de la NDF (bouton ⬇ PDF) + archivage Drive de la NDF validée.
- [ ] Reste : **notification email** (en plus de l'in-app), **OCR** d'extraction auto montant/date, lien optionnel NDF ↔ prestation.

### 3. Archivage Google Drive — EN PLACE (mécanique), à brancher (28/06/2026)
⚠️ **Compte de service abandonné** : testé avec les vraies infos → `Service Accounts do not have storage quota`.
Un compte de service ne peut écrire que dans un **Drive partagé** (Google Workspace, payant). Sur Gmail gratuit
(`vudeja.events`), impossible. → **Bascule sur OAuth** avec le périmètre **`drive.file`** (non sensible : pas de
validation Google, jeton durable ; l'app agit au nom du compte qui a ses 15 Go).
- [x] Mécanique d'envoi (`src/lib/drive.ts`) **OAuth** : crée le dossier « Déjà Vu — Archives » + sous-dossiers, upload — **no-op tant que non configuré**.
- [x] Archivage **best-effort** branché : **justificatifs de NDF** (à la validation → `Notes de frais/{année}`) et **factures reçues** (fichier joint à une sortie → `Factures reçues/{année}`).
- [x] Script `scripts/google-oauth-token.mjs` pour obtenir le refresh token une fois.
- [ ] **À FAIRE (Léo, Google Cloud)** : activer Drive API + OAuth consent screen (External, In production) + créer un OAuth client « Desktop » → lancer le script → 3 variables d'env : `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` (dans `.env.local` + Vercel).
- [x] **Génération PDF côté serveur** (`@react-pdf/renderer`) : devis/factures + NDF. Boutons « ⬇ PDF » ; archivage Drive auto à l'émission (devis/facture) et à la validation (NDF). _(Reste branché derrière `driveConfigured()` → s'active dès que l'OAuth est en place.)_
- Note : les justificatifs/factures sont **déjà stockés durablement dans Supabase Storage** (le Drive est une copie de confort).

## Confort NDF (demandé 28/06/2026) — FAIT ✅
- [x] **Glisser-déposer (drag & drop)** des justificatifs (composant `FileDropzone`).
- [x] **Aperçu du justificatif dans l'app** (lightbox image/PDF, miniature pour les images) sans téléchargement → validation rapide.
- [ ] Reste possible : déposer plusieurs fichiers d'un coup créant plusieurs lignes.

## Onglet « Planification » (demandé 28/06/2026) — V1 FAITE ✅
Vue centrale de **toutes les prestations** (passées + futures). En cliquant sur une prestation, accès à :
- [x] Onglet **Planification** (liste à venir / passées) + hub par prestation (liens devis/factures, charges, préparation, fiche).
- [x] **Dates clés** (prépa, événement, retour).
- [x] **Tournée logistique (jour J)** : étapes ordonnées (chargement/route/déchargement/montage/démontage), lieu/adresse/heure/matériel/notes, cases « fait », réordonnancement ▲▼, **feuille de tournée imprimable**. Gère le cas multi-entrepôts (Fête de la musique).
- [x] **V2 — Itinéraire intelligent FAIT (01/07/2026)** : adresse par arrêt + bouton « Calculer l'itinéraire » → distances/durées auto entre arrêts (OpenRouteService) + total km/durée, affiché par arrêt. Gère le multi-entrepôts. Détail de l'objectif initial ci-dessous :
  - matériel réparti sur **plusieurs entrepôts/zones** (ex. Fête de la musique : 1 camion, matériel dans 4 entrepôts) ;
  - **planifier les allers-retours** du/des camion(s), l'ordre de passage, zones de **chargement / déchargement** ;
  - objectif : une planification **claire et simple** de l'organisation le jour de l'événement.
  - Pistes techniques : vue carte (entrepôts → lieu), liste ordonnée d'étapes/tournées, capacité camion vs volume/poids matériel
    (on a déjà poids/dimensions par référence), génération d'une **feuille de tournée** imprimable.
- [ ] V3 éventuelle : vrai **canvas type Miro** (blocs déplaçables + flèches), capacité camion vs poids/volume du matériel chargé, vue carte.

## Lot UX & fonctionnalités (01/07/2026) — FAIT ✅
- [x] **Navigation regroupée** : 5 onglets (Accueil · Prestations · Matériel · Finance · Annuaire) + sous-menus au survol (desktop) / tap (mobile).
- [x] **Flèche retour** dans le header sur toutes les pages.
- [x] **Thème sombre/clair** (toggle header, mémorisé, sans flash).
- [x] **Paramètres réorganisés** en sous-onglets (Mon compte · Entreprise & documents · Trésorerie & tarifs · Équipe).
- [x] **Profil utilisateur** : photo (avatar header) + **signature** + infos perso (nom, prénom, adresse, tél, IBAN, fonction) dans *Mon compte*.
- [x] **Notes de frais — template complet** calqué sur `Template NDF.pdf` (logo, en-tête société, encadrés DEMANDEUR/RESPONSABLE, dépenses, remarques légales, 2 encadrés « lu et approuvé »).
- [x] **Signatures NDF** : le demandeur signe (bouton + confirmation), le responsable signe à la validation ; signatures + dates apposées sur le PDF, archivé Drive.
- [x] **Œil d'aperçu** + composant **Tooltip** réutilisable.
- [x] **Frais de déplacement véhicule perso** : distance auto via **OpenRouteService** (clé configurée) → barème kilométrique → ligne de NDF.
- [ ] Restes mineurs : aperçu NDF déposer plusieurs fichiers d'un coup ; notification **email** NDF ; **OCR** justificatifs ; « relevé » de trajet imprimable détaillé.

## Version mobile (phase finale, demandée 28/06/2026)
L'app est déjà **responsive + installable en PWA** (utilisable sur téléphone aujourd'hui). La phase finale = la rendre vraiment confortable et fiable sur mobile :
- [ ] **Audit mobile écran par écran** : tailles de cibles tactiles (≥ 44 px), tableaux qui débordent (finance), formulaires longs, claviers numériques sur les champs montants.
- [ ] **Optimiser les écrans terrain** (préparation, inventaire, scan QR) pour usage à une main / gants.
- [ ] **PWA** : vérifier installation iOS + Android, icône, écran de démarrage, mode hors-ligne minimal (au moins lecture).
- [ ] **Tests sur appareils réels** (iPhone + Android) : caméra/scan, photos, impression PDF depuis mobile.
- [ ] Décider : rester **PWA** (recommandé, ~0 €, pas de store) ou wrapper natif (Capacitor) si besoin de fonctions natives.

## Inspiration — fonctionnalités des logiciels du marché (veille 28/06/2026)

Repéré chez Rentman, Current RMS, HireHop, Booqable, Point of Rental, EZRentOut, MCS, Quipli.
Pistes pertinentes pour Déjà Vu (à arbitrer, ne pas tout faire) :
- [ ] **Suivi de la sous-location (sub-hire / cross-hire)** : tracer le matériel loué chez des partenaires (Audiotec) **à côté du parc propre**, avec coût fournisseur, dispo partenaire, marge — on a déjà la base (catalogue externe + coût + marge), à pousser vers un vrai suivi par prestation.
- [ ] **Planning / gestion d'équipe (crew scheduling)** : affecter les techniciens/bénévoles à une prestation (qui fait quoi, quand), vue agenda par personne.
- [ ] **Portail client** : le client consulte ses devis/factures, valide un devis en ligne, voit le calendrier de sa prestation.
- [ ] **Détection de conflits / double-réservation** visuelle dans le calendrier (on a déjà la contrainte GiST côté base — l'exposer dans l'UI planning).
- [ ] **Maintenance préventive** : entretien programmé par unité (rappels « révision tous les X mois / Y heures »), historique de réparation (on a déjà date_derniere_maintenance + remarques).
- [ ] **Check-list de retour / état des lieux** avec photos (constat de casse au retour).
- [ ] **Codes-barres / QR au scan** check-out / check-in (cf. scanner QR intégré ci-dessous).
- [ ] **Réservation en ligne / disponibilité publique** (moins prioritaire pour une asso).
- [ ] **Paiements en ligne** (acompte devis) — à étudier plus tard.

## Préparation / sorties (Phase 3)
- [ ] **Scanner QR intégré dans l'app** : caméra live qui coche directement la
  check-list de chargement (sans passer par l'ouverture de la fiche unité via
  l'appareil photo). Confort « bip-bip » au chargement du camion.
  → nécessite une bibliothèque de scan (ex. zxing / html5-qrcode) + test sur mobile réel.
- [ ] **Heures d'usage automatiques au retour** : aujourd'hui saisies à la main
  (optionnel). Proposer un calcul auto (ex. durée de l'événement) ou un défaut.

## Devis (Phase 2)
- [ ] **Bouton « appliquer le tarif dégressif »** sur une ligne / un devis :
  le dégressif global (Paramètres) n'est plus appliqué automatiquement depuis le
  passage au prix manuel — proposer un calcul assisté à la demande.
- [ ] **Ordre des catégories** sur le devis : actuellement alphabétique. Les
  documents réels suivent un ordre métier (Son, Laser, Lumière, Effet, Structure,
  Électricité…). Prévoir un ordre personnalisable des catégories.

## Émission devis / facture (Phase 7) — fait ✅
- [x] Page document imprimable (PDF via le navigateur) mise en page comme les
  documents actuels (société, adresse, IBAN, SIREN, n°, validité/règlement,
  mention TVA, bloc signature pour le devis).
- [x] Infos société dans Paramètres + numérotation auto (devis simple, facture `AAAA-NNNNNN`).
- [x] Préparation de l'email au client (lien mailto pré-rempli).
- [ ] Reste : **logo** de l'entreprise sur le document (upload fichier),
  mention « facture issue du devis n°X », et **conformité facturation électronique**
  via plateforme agréée (obligation 2026-2027).

## Inventaire & maintenance (Phase 4) — fait ✅
- [x] Sessions d'inventaire mobiles (liste à cocher, présence, état constaté, remarques).
- [x] Fiche unité : historique d'usage + historique d'inventaire + édition état/maintenance.
- [ ] Reste : scan QR intégré pour cocher l'inventaire (cf. section Préparation),
  édition manuelle des compteurs heures/sorties (correction), filtre/recherche dans
  la session (utile si beaucoup d'unités).
