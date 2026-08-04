# CLAUDE.md — Projet de gestion intégrée « Déjà Vu »

> Ce fichier est le cahier des charges et le guide de travail pour Claude Code.
> Lis-le en entier au démarrage. Les specs détaillées sont dans `docs/`.

## Contexte

Déjà Vu est une association événementielle qui loue et installe du matériel scénique
(lumière, son, structure). ~10 à 20 prestations/an, quelques centaines d'unités de
matériel (hors câbles), < 10 utilisateurs (2-3 simultanés max).

Outils actuels : Tiime (devis/factures), Qonto (banque), Google Drive/Sheets
(stockage + un fichier Excel « business plan » pour la trésorerie prévisionnelle).

## Objectif

Construire **une seule application web** (multi-utilisateur, utilisable sur ordinateur
ET téléphone) bâtie autour d'une base de données centrale. Le matériel est saisi une
seule fois et alimente tous les modules : devis, préparation, technique, inventaire,
maintenance, trésorerie.

## Stack technique (décidée)

- **Base de données + Auth + API** : Supabase (PostgreSQL).
- **Application** : Next.js (React), responsive, installable en PWA (mobile + desktop).
- **Intégration bancaire** : API Qonto (phase finance).
- **Hébergement** : Vercel (free tier). Objectif coût : ~0 €/mois.

Contraintes : free tier Supabase + Vercel suffisants à cette échelle. Pas de dépendance
payante sans validation de Léo.

## Base de données

Le schéma complet et validé est dans **`docs/schema_deja_vu.sql`** (à exécuter dans
l'éditeur SQL de Supabase). Diagramme ER dans `docs/schema_deja_vu_diagramme.mermaid`.

Points clés à NE PAS casser :
- **Inventaire sérialisé** : chaque unité physique est suivie individuellement
  (table `unite`), avec compteurs d'heures et de sorties.
- **Disponibilité** : la table `reservation_unite` utilise une contrainte d'exclusion
  GiST (`exclude using gist (unite_id with =, daterange(...) with &&)`) qui empêche
  physiquement toute double-réservation d'une unité sur des dates qui se chevauchent.
  Nécessite l'extension `btree_gist`.
- **Règles de kit** (`kit_regle`) : ajouter une Lyre ajoute auto ses accessoires
  (alim, DMX, élingue) au devis / à la check-list.
- **Tarifs** : dégressif multi-jours (`tarif_degressif`) + tarif préférentiel client.

## Feuille de route (construire dans cet ordre)

1. **Fondations** — projet Supabase + exécution du SQL ; interface catalogue matériel
   (références + unités sérialisées + specs techniques + règles de kit), clients, véhicules.
2. **Devis** — prestations + génération de devis avec calcul auto des prix
   (dégressif multi-jours, tarif client, transport) ; sélection auto de l'unité la
   moins utilisée ; vérification de disponibilité sur les dates.
3. **Préparation** — check-list de chargement auto (avec accessoires/kits) ;
   enregistrement des sorties/retours (scan QR) qui incrémente les compteurs.
4. **Inventaire & maintenance** — sessions mobiles à cocher, scan QR, fiches techniques
   par unité (specs + historique d'usage + inventaire + remarques), tout interconnecté.
5. **Calculateurs élec & levage** — répartition de charge sur circuits (16A/tri) et
   ponts (poids vs capacité). AIDE À LA DÉCISION uniquement — afficher clairement que
   la validation finale revient à une personne compétente (levage réglementé).
6. **Finance / trésorerie** — sync API Qonto, factures fournisseurs + échéancier +
   rappels, prévisionnel de trésorerie (remplace le business plan Excel : historique
   réel + entrées/sorties prévues + calendrier des mois « dans le rouge »).
7. **Facturation** — émission du devis/facture en PDF + préparation d'un email au client
   (adresse dans `client.email`). À terme, conformité facturation électronique via
   plateforme agréée (obligation 2026-2027).

## Conventions

- Code et commentaires : français pour le métier, anglais possible pour la technique.
- L'app doit rester simple d'usage : utilisateurs peu techniques, mobile important.
- Penser mobile-first pour les écrans inventaire/préparation (scan QR, cases à cocher).
- Prévoir une sauvegarde/export régulier de la base (données critiques).

## État actuel

- [x] Conception : plan fonctionnel (`docs/Plan_Outil_Deja_Vu.md`)
- [x] Schéma de base de données validé (`docs/schema_deja_vu.sql`)
- [x] Projet Supabase créé (`vowcktyfbihyddgicoqp`) + schéma + RLS appliqués (via MCP).
- [x] App Next.js 16 (App Router, TS, Tailwind 4) scaffoldée + PWA + Auth (login).
- [x] Phase 1 — Fondations : Catalogue (références, unités sérialisées, specs,
      connecteurs multiples + surcharge unité, QR codes, accessoires oblig./option.),
      Clients, Véhicules, tableau de bord.
- [x] Phase 2 — Devis : prestations, constructeur de devis (lignes catalogue/libres,
      prix manuel, remises ligne + globale, catégories, transport, totaux conformes
      aux documents réels) ; sélection auto des unités + disponibilité (réservations
      GiST) ; accessoires optionnels. Tarif dégressif global déplacé dans Paramètres.
- [x] Phase 3 — Préparation : check-list de chargement (mobile), sorties/retours qui
      incrémentent les compteurs, scan QR via la fiche unité.
- [x] Phase 4 — Inventaire & maintenance : sessions d'inventaire mobiles (présence,
      état constaté, remarques), fiche unité enrichie (historique d'usage + historique
      d'inventaire + édition état/maintenance/remarques + pointage inventaire via scan QR).
- [x] Phase 5 — Calculateurs élec & levage : plan technique par prestation. Levage =
      ponts (poids vs capacité). Élec = **arborescence** source→armoire→prise avec conso
      qui remonte à chaque niveau et code couleur (orange < 10% de marge, rouge dépassé).
      Affectation des lignes, alertes. Aide à la décision (disclaimer affiché).
- [x] Phase 7 — Émission devis/facture : page document imprimable (PDF via navigateur) à la
      mise en page des documents réels, infos société dans Paramètres, numérotation auto
      (devis n° simple, facture `AAAA-NNNNNN`), préparation d'email client. Reste : logo,
      conformité facturation électronique (plateforme agréée).
- [x] Phase 6A — Finance / trésorerie : journal financier unifié (entrées/sorties, réel/
      prévisionnel) calqué sur l'Excel de Léo (nomenclature types/spécifications), tableau de
      bord (solde réel, solde projeté, synthèse mensuelle, alerte solvabilité/découvert) —
      calcul vérifié identique à l'Excel. Réglages : solde initial, seuil d'alerte.
- [x] **Modèle multi-devis** : un **événement** (`prestation`) peut contenir plusieurs
      **devis/factures** (table `devis`), chacun avec ses propres lignes/transport/remises
      (`ligne_prestation.devis_id`, `transport.devis_id`, `devis_facture.devis_id`).
      La **préparation, la disponibilité (réservations) et le plan technique restent au niveau
      de l'événement** (agrégés par `prestation_id`) → **check-list de chargement unique**.
      Constructeur = `/prestations/[id]?devis=<id>` (sélecteur de devis). Émission PDF par
      devis (`/document?devis=<id>&type=`). Boutons « Créer un devis / Créer une facture »
      (vierge ou copie d'un devis existant), modales à fond flou (`src/components/modal.tsx`).
- [x] **Onglets d'événement** unifiés (Infos / Devis & Factures / Technique [Charge utile + Électricité]
      / Planification / Préparation) via `src/components/event-tab-bar.tsx`. Encadré Infos = client, lieu,
      dates, **personnes attachées** (`prestation_membre`), créateur, total des devis. Suivi créateur +
      dernier modificateur des devis (`devis.updated_by`/`updated_at` + trigger). Dates en JJ/MM/AAAA par
      défaut (bug fuseau corrigé) + réglage `format_date` (Paramètres → Entreprise, appliqué aux PDF).
- [x] **Finance** : journal avec recherche à gauche + **export CSV/PDF** (popup date+format, `finance/export`
      + `finance/export/pdf` via `@react-pdf`). **Plusieurs justificatifs par écriture** (table `justificatif`,
      UI sur `finance/[id]`). Formulaires en **modales** (dépense, ROI, note de frais). Écritures rattachables
      à un événement depuis la liste Factures (`attacherEcritureAPrestation`).
- [x] **Calendrier** : légende + **cases de filtrage** par catégorie dans le volet droit, catégorie
      **Réunion** (tables `reunion`/`reunion_participant`), création de réunion (modale, sélection de membres),
      **sync Google Agenda + Meet + invitations e-mail** (`src/lib/google-calendar.ts`, réutilise l'OAuth Drive —
      nécessite le scope `calendar.events` dans le refresh token ; sinon fallback lien template + mailto).
- [x] **Tableau de bord** refondu : brief comptable (solde réel/projeté, mois « dans le rouge », échéances),
      planning des 7 prochains jours, panneau de notifications (NDF à valider, réunions, refus).
- [x] **Outil d'avancement** (`/avancement`) : suivi des projets par semaine (tables `projet_suivi`,
      `projet_note`, `semaine_info`), calendrier de contenu (`contenu_comm`), dashboard de stats. Reproduit
      `Coordination_2026.xlsx` (numérotation de semaines `src/lib/semaines.ts`) et **données importées**.
- [x] **Navigation** réorganisée : groupe **Planification** (Événements = `/planification`, Devis & Factures
      = `/prestations`) + nouveau groupe **Organisation** (Calendrier, Avancement). Header : **cloche de
      notifications** (`src/components/notification-bell.tsx` + `src/lib/notifications.ts`, point rouge « non lu »
      via localStorage, menu déroulant au survol).
- [x] **Statut de facture** : badge Brouillon / En attente / Payée / En retard / Annulée
      (`devis_facture.statut_paiement`, helper `src/lib/facture-statut.ts`), sélecteur sur la page document +
      badges sur les pastilles de l'événement.
- [x] **Volet de filtres à droite** (`src/components/filter-drawer.tsx`) : bouton « Filtrer » ouvrant un
      panneau latéral droit. Appliqué au journal finance, aux factures, au catalogue et aux **NDF**
      (tri par mois + recherche/auteur/statut/plage de dates/plage de montant).
- [x] **Avancement — Frise hebdomadaire** : tableau projets × semaines, colonne « semaine en cours » **figée à
      droite** (éditable, report auto de la note précédente), 1re colonne projet figée, groupé par type, historique défilant.
- [x] **Ordre personnalisable des catégories** (`categorie.ordre`) : édition dans Paramètres → Catégories ; tri
      appliqué au constructeur de devis et au document PDF.
- [x] **Export comptable annuel** : compte de résultat (produits/charges réels par poste + résultat net + solde
      début/fin) en PDF (`finance/bilan/pdf`, bouton sur la synthèse).
- [x] **Planning d'équipe** : **compétences** par membre (`membre.competences[]`, cases dans Paramètres → Équipe :
      Laser/Son/Lumière/Structure/Levage/Élec/Vidéo/Régie/Chauffeur), **rôle** par personne affectée
      (`prestation_membre.role`), page **`/equipe`** (agenda par personne, compétences).
- [x] **Maintenance préventive** : intervalle par unité (`unite.maintenance_intervalle_jours` / `_heures`),
      indicateur « prochaine maintenance / en retard » sur la fiche unité + **rappel** dans les notifications.
- [x] **Détection de conflits matériel** : la section Disponibilité nomme les **événements en concurrence** sur les
      mêmes dates quand la dispo est insuffisante (en plus de la contrainte GiST anti-double-réservation).
- [x] **Contrôle de retour / état des lieux** (`controle_retour`) : page `/prestations/[id]/retour`, état par unité
      (OK / à vérifier / cassé / manquant / HS) + remarque + **photo** ; casse/HS répercute l'état de l'unité.
- [x] **Réunions & transcripts** (`/reunions`, sous Organisation) : dépôt de transcript (glisser-déposer/collage,
      tables `reunion.transcript`/`resume`), **résumé structuré + extraction d'actions via Gemini** (free tier,
      `src/lib/gemini.ts`, clé `GEMINI_API_KEY`), actions attribuées → **tâches personnelles** (`tache_perso`).
- [x] **Accueil allégé** : tuiles de modules retirées (redondantes avec la nav), encadré **« Mes tâches »**
      (`src/app/(app)/mes-taches.tsx`) alimenté par les réunions + ajout manuel.
- [x] **Technique refondue** : charge utile & élec en **2 colonnes** (arbre/ponts à gauche, matériel à affecter dans
      un **encadré à droite** + légende), dédoublonnage élec, et **drag-and-drop des nœuds** (`deplacerNoeud`,
      poignée ⠿ + Pointer Events tactiles, anti-cycle) pour reparenter/déplacer les sources.
- [x] **Constructeur de devis** : **récap collant à droite** (nom, totaux, PDF, dupliquer, supprimer) + **catégories
      pré-placées** avec un **« + » en pointillé** par catégorie (formulaire pré-rempli). Événement en `max-w-5xl`,
      onglet **Infos par défaut**, back button unifié, catalogue nettoyé, statut **« Payée »** sur les NDF.
- [ ] **Améliorations en attente** : voir `docs/ameliorations_futures.md`.
- [x] **Phase 6B (partielle)** : **auto-alimentation trésorerie** — une facture client émise crée/maj une
      **entrée** liée (`ecriture_financiere.devis_facture_id` ; prévisionnelle → réelle si payée → supprimée si
      annulée) ; une **facture fournisseur** (`facture_fournisseur`, onglet Finance → Fournisseurs, échéancier +
      rappels cloche/dashboard) crée/maj une **sortie** liée (`facture_fournisseur_id`). **Validation des écritures**
      (`ecriture_financiere.valide`) : badge « à valider », bouton Valider/Dévalider, filtre — les écritures auto
      naissent non validées. Sync dans `prestations/[id]/document/actions.ts` + `finance/fournisseurs/actions.ts`.
- [ ] Phase 6B (reste) : **sync Qonto** (accès API requis), **import Excel** complémentaire (journaux/inventaire),
      rapprochement bancaire.

## Notes techniques importantes

- **Next.js 16** : le « middleware » s'appelle désormais **`proxy`** et le fichier doit
  être dans `src/proxy.ts` (avec un dossier `src/`). `params`/`searchParams` sont des
  Promises (à `await`). Mutations via Server Actions (`"use server"`).
- **Supabase** : clients dans `src/lib/supabase/` (browser/server + helper de session).
  RLS = accès complet aux utilisateurs authentifiés (`docs/rls_policies.sql`).
- Connecté via le **MCP Supabase** (`.mcp.json`) : je peux exécuter du SQL directement.

## Prochaine action

À décider avec Léo : Phase 4 (inventaire & maintenance), Phase 7 (émission PDF des
devis/factures), ou traiter des points de `docs/ameliorations_futures.md`.
