# Déjà Vu — Plan de l'outil de gestion intégré

*Document de cadrage — v1 — juin 2026*

Outil unique pour gérer, autour d'une **base de données centrale** : le catalogue matériel, les devis/factures, la préparation des prestations (technique + logistique), l'inventaire et la maintenance, et la trésorerie.

---

## 1. Le principe directeur

Une seule base de données partagée, **multi-utilisateur et multi-support** (ordinateur + téléphone). Le matériel est saisi **une seule fois** et alimente tous les modules. Un devis accepté déclenche en cascade : la liste de matériel, la check-list de préparation, la sortie de stock (compteurs d'usage), et une rentrée prévisionnelle en trésorerie.

Deux « mondes » connectés mais distincts dans l'interface :

- **Opérations** : catalogue, prestations, préparation technique/logistique, inventaire, maintenance.
- **Finance** : devis/factures, factures fournisseurs, paiements, trésorerie prévisionnelle.

Le pont entre les deux est le **devis**, construit à partir du catalogue.

---

## 2. Périmètre fonctionnel (tous les modules)

### A. Catalogue matériel (le hub)
- Inventaire **sérialisé** : chaque unité suivie individuellement (Lyre #1 … #n), pas seulement en quantité.
- Par unité : n° de série, état, **compteur d'heures d'usage et de sorties**, dernière maintenance, remarques.
- Caractéristiques techniques par référence : **puissance (W), intensité (A), mono/triphasé, connecteur, poids (kg)**, dimensions.
- **Règles de kit / accessoires** : ajouter « 1 Lyre » ajoute automatiquement ses dépendances (ex. 1 câble d'alim + 1 câble DMX + 1 élingue par Lyre) au devis et/ou à la check-list.
- Étiquetage **QR code** par unité pour scanner aux sorties et inventaires.

### B. Clients
- Fiches clients avec coordonnées et **tarif préférentiel** (ex. −15 %).

### C. Véhicules & transport
- Véhicules enregistrés avec types préréglés et coûts de location.
- Saisie du nombre de véhicules + kilométrage → **proposition automatique de tarif transport** ajoutée au devis.

### D. Prestations & devis
- Une prestation = client + dates (événement / préparation / retour) + lieu + statut (devis → confirmé → réalisé).
- **Calcul automatique des prix** : tarif dégressif multi-jours + tarif préférentiel client + transport.
- **Sélection automatique de l'unité** : à l'ajout d'« 1 Lyre », l'outil propose l'unité la moins utilisée pour équilibrer l'usure des ampoules.
- Génération du devis ; suivi du statut.

### E. Préparation (jour J)
- **Check-list de chargement camion** générée automatiquement à partir du devis + des règles de kit.
- To-do list cochable, utilisable sur mobile.

### F. Sorties & mouvements de matériel
- Enregistrement des sorties/retours (scan QR), qui **incrémente les compteurs** d'usage de chaque unité.

### G. Inventaire & maintenance
- **Sessions d'inventaire mobiles** : liste à cocher, scan QR, saisie des remarques et descriptions de maintenance.
- Historique d'inventaire et de maintenance par unité.

### H. Fiches techniques interconnectées
- Chaque unité a une **fiche** : specs, historique d'utilisation, historique d'inventaire, remarques.
- Tout est cliquable : depuis une ligne de devis → fiche de l'unité réellement assignée.

### I. Calculateur électrique *(phase avancée)*
- Sources définies (prises 16 A, armoires triphasées, etc.).
- Affectation du matériel à des circuits → **calcul de charge vs limite**, alerte de dépassement, équilibrage des 3 phases, proposition du nombre de lignes nécessaires.

### J. Calculateur levage / structures *(phase avancée)*
- Création de « ponts » (pont 1, pont 2…) avec capacité du tronçon (ASD).
- Somme des poids accrochés → alerte si dépassement.
- ⚠️ **Aide à la décision uniquement** : la validation reste celle d'une personne compétente (le levage au-dessus du public est réglementé).

### K. Finance & trésorerie
- **Synchronisation Qonto** (API) : transactions, rapprochement.
- **Factures fournisseurs** : import, échéances, liste de paiements + rappels.
- **Devis/factures clients** : calculés dans l'outil.
- **Prévisionnel de trésorerie** : remplace le « business plan » Excel — historique réel + dépenses/rentrées prévues + calendrier des mois « dans le rouge ».
- **Conformité facturation électronique** : émission de la facture officielle via une **plateforme agréée (PA)** (obligation progressive 2026-2027).

---

## 3. Modèle de données (entités principales)

- **Référence matériel** → caractéristiques techniques, prix, règles de kit.
- **Unité** (n exemplaires d'une référence) → n° série, compteurs, état.
- **Client** → tarif préférentiel.
- **Véhicule** → type, coût.
- **Prestation** → client, dates, lieu, statut.
- **Ligne de prestation** → référence/unité, quantité, jours, prix.
- **Devis / Facture** → prestation, montants, statut paiement.
- **Mouvement** (sortie/retour) → unité, prestation, dates → alimente compteurs.
- **Session d'inventaire** → unités cochées, remarques, maintenance.
- **Plan technique** → ponts, circuits, affectations (élec/levage).
- **Transaction / Facture fournisseur** → finance, échéances, prévisionnel.

Toutes les entités sont reliées : c'est ce qui rend l'interconnexion (fiches cliquables, sélection auto, prévisionnel auto) possible.

---

## 4. Stack technique recommandée

**Application web sur-mesure** (Option A), car les calculs (élec/levage), la sélection auto et l'interconnexion fine sont infaisables proprement en no-code.

- **Base de données + auth + API** : Supabase (PostgreSQL). Gère le multi-utilisateur et fournit une API automatique.
- **Application** : web responsive (React/Next.js), **installable sur téléphone (PWA)** → couvre ordi + mobile sans app native.
- **Intégration bancaire** : API Qonto (+ Zapier/Make si besoin).
- **Facturation électronique** : connexion à une plateforme agréée pour l'émission légale.

### Coût à votre échelle (≈ centaines d'unités, < 10 utilisateurs, 2-3 simultanés)
- Supabase : **gratuit** (free tier largement suffisant).
- Hébergement de l'app (ex. Vercel) : **gratuit**.
- Qonto : déjà inclus dans votre abonnement (API disponible tous forfaits).
- **Total : 0 €/mois** dans le scénario de base. Quelques euros seulement si on dépasse un free tier ou pour un service de PA.

---

## 5. Feuille de route par phases

On **conçoit la base de données complète dès le départ** (unités sérialisées + champs techniques), puis on livre par couches pour avoir de la valeur vite :

1. **Fondations** : base de données + catalogue matériel (sérialisé, specs, règles de kit) + clients + véhicules.
2. **Devis** : prestations, calcul auto des prix (multi-jours, tarif client, transport), sélection auto des unités. *← gros gain immédiat.*
3. **Préparation** : check-list auto (avec accessoires/kits) + sorties de stock (scan, compteurs).
4. **Inventaire & maintenance** : sessions mobiles, QR codes, fiches techniques par unité.
5. **Calculateurs élec & levage** : modules de répartition de charge.
6. **Finance** : sync Qonto, factures fournisseurs, échéancier, prévisionnel de trésorerie.
7. **Conformité** : émission des factures via plateforme agréée.

---

## 6. Décisions / options à trancher

1. **Stack** : Option A (sur-mesure, recommandée) confirmée ? — vs Option B no-code (écartée car limites sur les calculs).
2. **QR codes** : on étiquette les unités pour scanner (recommandé avec le suivi sérialisé) ?
3. **Émission des factures** : on garde Tiime comme plateforme agréée pour l'émission légale (l'outil prépare tout), ou on vise une autre PA / remplacement complet ?
4. **Calculateurs élec/levage** : phase avancée (5) ou priorité plus haute ?
5. **Premier livrable** : valider le **schéma de base de données complet** avant d'écrire l'app ?

---

## 7. Points de vigilance

- **Sécurité/responsabilité (levage)** : l'outil propose, une personne compétente valide.
- **Facturation électronique** : obligation de passer par une plateforme agréée (réception dès le 1er sept. 2026 ; émission au 1er sept. 2027 pour les petites structures selon assujettissement TVA).
- **Sauvegardes** : prévoir l'export régulier de la base (la donnée matériel/finance est critique).
