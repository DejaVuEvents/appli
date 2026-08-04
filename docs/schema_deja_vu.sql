-- =====================================================================
-- Déjà Vu — Schéma de base de données (PostgreSQL / Supabase)
-- v1 — juin 2026
-- À exécuter dans l'éditeur SQL de Supabase.
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists btree_gist;   -- requis pour la contrainte anti-chevauchement

-- =========================================================
-- 1. CATALOGUE MATÉRIEL
-- =========================================================

create table categorie (
  id        uuid primary key default uuid_generate_v4(),
  nom       text not null,
  parent_id uuid references categorie(id)
);

create table materiel_reference (
  id                 uuid primary key default uuid_generate_v4(),
  nom                text not null,
  categorie_id       uuid references categorie(id),
  description        text,
  prix_location_jour numeric(10,2) not null default 0,
  -- caractéristiques techniques (alimentent les calculateurs élec/levage)
  puissance_w        numeric(10,2),
  intensite_a        numeric(10,2),
  phase              text check (phase in ('mono','tri')),
  connecteurs_puissance text[] not null default '{}', -- liste : PowerCON, IEC, P17…
  connecteurs_data      text[] not null default '{}', -- liste : XLR 3pts, 5pts, RJ45, ILDA…
  poids_kg           numeric(10,2),
  dimensions         text,
  est_consommable    boolean default false,   -- ex. câbles non sérialisés
  created_at         timestamptz default now()
);

-- Tarif dégressif multi-jours : règle GLOBALE (paramètres devis/facturation),
-- appliquée à tous les devis. Ex: jour_min=2, coefficient=0.5 => -50% à partir du 2e jour.
create table tarif_degressif_global (
  id           uuid primary key default uuid_generate_v4(),
  jour_min     int not null,
  coefficient  numeric(5,3) not null
);

-- Règles de kit / accessoires liés à une référence.
-- Ex: 1 Lyre => 1 câble alim + 1 câble DMX + 1 élingue.
-- obligatoire = true  : ajouté automatiquement au devis / à la check-list.
-- obligatoire = false : accessoire optionnel, proposé (à cocher) au moment du devis.
create table kit_regle (
  id                      uuid primary key default uuid_generate_v4(),
  reference_parent_id     uuid not null references materiel_reference(id) on delete cascade,
  reference_accessoire_id uuid not null references materiel_reference(id),
  quantite_par_unite      numeric(6,2) not null default 1,
  obligatoire             boolean not null default true
);

-- Unités sérialisées : chaque exemplaire physique est suivi individuellement.
create table unite (
  id                       uuid primary key default uuid_generate_v4(),
  reference_id             uuid not null references materiel_reference(id) on delete restrict,
  numero_serie             text,
  qr_code                  text unique,        -- étiquette scannée
  etat                     text default 'ok' check (etat in ('ok','maintenance','hs','reforme')),
  compteur_heures          numeric(10,1) default 0,
  compteur_sorties         int default 0,
  date_derniere_maintenance date,
  date_achat               date,                -- propre à chaque unité
  prix_achat               numeric(10,2),       -- propre à chaque unité
  connecteurs_puissance    text[],              -- surcharge unité (NULL = hérite de la référence)
  connecteurs_data         text[],              -- surcharge unité (NULL = hérite de la référence)
  remarques                text,
  created_at               timestamptz default now()
);

-- =========================================================
-- 2. CLIENTS & VÉHICULES
-- =========================================================

create table client (
  id                     uuid primary key default uuid_generate_v4(),
  nom                    text not null,
  email                  text,                 -- sert à préparer le mail d'envoi du devis/facture
  telephone              text,
  adresse                text,
  tarif_preferentiel_pct numeric(5,2) default 0,
  notes                  text
);

create table vehicule (
  id                 uuid primary key default uuid_generate_v4(),
  nom                text not null,
  type               text,                     -- ex "Fourgon 20 m3"
  cout_location_jour numeric(10,2) default 0,
  cout_km            numeric(10,3) default 0,
  capacite_m3        numeric(8,2)
);

-- =========================================================
-- 3. PRESTATIONS, DEVIS & DISPONIBILITÉ
-- =========================================================

create table prestation (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid references client(id),
  nom             text not null,
  lieu            text,
  date_prepa      date,
  date_event_debut date,
  date_event_fin  date,
  date_retour     date,
  statut          text default 'devis' check (statut in ('devis','confirme','realise','annule')),
  -- Remise globale appliquée au total du devis (% ou montant)
  remise_globale_type    text default 'pct' check (remise_globale_type in ('pct','montant')),
  remise_globale_valeur  numeric(12,2) default 0,
  remise_globale_libelle text,
  created_at      timestamptz default now()
);

create table ligne_prestation (
  id                 uuid primary key default uuid_generate_v4(),
  prestation_id      uuid not null references prestation(id) on delete cascade,
  reference_id       uuid references materiel_reference(id),   -- null = ligne libre / service
  designation        text,                     -- libellé affiché (modifiable)
  unite              text,                     -- ex "mètres" (optionnel)
  categorie_id       uuid references categorie(id),            -- regroupement sur le devis
  quantite           int not null default 1,
  nb_jours           int not null default 1,
  prix_unitaire      numeric(10,2),            -- prix manuel (catalogue par défaut)
  remise_type        text not null default 'pct' check (remise_type in ('pct','montant')),
  remise_valeur      numeric(12,2) not null default 0,
  prix_total         numeric(10,2),            -- montant net de la ligne (après remise ligne)
  est_accessoire_auto boolean default false,   -- ligne ajoutée par une règle de kit
  ligne_parent_id    uuid references ligne_prestation(id) on delete cascade, -- accessoire auto -> ligne parente
  charge             boolean not null default false, -- coché sur la check-list de chargement
  created_at         timestamptz default now()
);

-- Cœur de la DISPONIBILITÉ : une réservation lie une unité précise à une
-- prestation sur une plage de dates (prépa -> retour).
-- La contrainte d'exclusion empêche physiquement toute double-réservation
-- d'une même unité sur des dates qui se chevauchent.
create table reservation_unite (
  id                  uuid primary key default uuid_generate_v4(),
  unite_id            uuid not null references unite(id) on delete cascade,
  prestation_id       uuid not null references prestation(id) on delete cascade,
  ligne_prestation_id uuid references ligne_prestation(id) on delete cascade,
  date_debut          date not null,           -- = date_prepa
  date_fin            date not null,            -- = date_retour
  constraint pas_de_chevauchement
    exclude using gist (
      unite_id with =,
      daterange(date_debut, date_fin, '[]') with &&
    )
);

create table transport (
  id            uuid primary key default uuid_generate_v4(),
  prestation_id uuid not null references prestation(id) on delete cascade,
  vehicule_id   uuid references vehicule(id),
  nb_vehicules  int default 1,
  km            numeric(10,1) default 0,
  cout_calcule  numeric(10,2)
);

create table devis_facture (
  id              uuid primary key default uuid_generate_v4(),
  prestation_id   uuid not null references prestation(id) on delete cascade,
  type            text not null check (type in ('devis','facture')),
  numero          text,
  montant_ht      numeric(12,2),
  taux_tva        numeric(5,2) default 0,
  montant_ttc     numeric(12,2),
  date_emission   date,
  date_echeance   date,
  statut_paiement text default 'en_attente' check (statut_paiement in ('en_attente','paye','retard','annule'))
);

-- =========================================================
-- 4. SORTIES / MOUVEMENTS & INVENTAIRE
-- =========================================================

-- Chaque sortie/retour incrémente les compteurs d'usage de l'unité.
create table mouvement (
  id              uuid primary key default uuid_generate_v4(),
  unite_id        uuid not null references unite(id),
  prestation_id   uuid references prestation(id),
  type            text not null check (type in ('sortie','retour')),
  date            timestamptz default now(),
  heures_ajoutees numeric(8,1) default 0,
  utilisateur_id  uuid
);

create table session_inventaire (
  id             uuid primary key default uuid_generate_v4(),
  date           date default current_date,
  utilisateur_id uuid,
  notes          text
);

create table ligne_inventaire (
  id                   uuid primary key default uuid_generate_v4(),
  session_id           uuid not null references session_inventaire(id) on delete cascade,
  unite_id             uuid not null references unite(id),
  present              boolean default false,
  etat_constate        text,
  remarque_maintenance text
);

-- =========================================================
-- 5. PRÉPARATION TECHNIQUE (élec / levage)
-- =========================================================

create table plan_technique (
  id            uuid primary key default uuid_generate_v4(),
  prestation_id uuid not null references prestation(id) on delete cascade,
  nom           text
);

create table pont (
  id           uuid primary key default uuid_generate_v4(),
  plan_id      uuid not null references plan_technique(id) on delete cascade,
  nom          text not null,
  capacite_kg  numeric(10,2)
);

create table circuit_elec (
  id              uuid primary key default uuid_generate_v4(),
  plan_id         uuid not null references plan_technique(id) on delete cascade,
  nom             text not null,
  intensite_max_a numeric(8,2),
  phase           text check (phase in ('mono','tri'))
);

-- Affecte une ligne/unité à un pont (poids) et/ou un circuit (élec).
create table affectation (
  id                  uuid primary key default uuid_generate_v4(),
  ligne_prestation_id uuid references ligne_prestation(id) on delete cascade,
  unite_id            uuid references unite(id),
  pont_id             uuid references pont(id),
  circuit_id          uuid references circuit_elec(id)
);

-- =========================================================
-- 6. FINANCE / TRÉSORERIE
-- =========================================================

create table facture_fournisseur (
  id              uuid primary key default uuid_generate_v4(),
  fournisseur     text not null,
  numero          text,
  montant_ttc     numeric(12,2),
  date_facture    date,
  date_echeance   date,
  statut_paiement text default 'a_payer' check (statut_paiement in ('a_payer','planifie','paye','retard')),
  fichier_url     text
);

-- Transactions importées de Qonto, rapprochées avec un devis/facture ou une facture fournisseur.
create table transaction_bancaire (
  id                     uuid primary key default uuid_generate_v4(),
  source                 text default 'qonto',
  date                   date,
  libelle                text,
  montant                numeric(12,2),
  sens                   text check (sens in ('credit','debit')),
  devis_facture_id       uuid references devis_facture(id),
  facture_fournisseur_id uuid references facture_fournisseur(id)
);

-- Prévisionnel de trésorerie (remplace le business plan Excel).
-- Alimenté automatiquement par les devis/prestations et les échéances fournisseurs.
create table previsionnel (
  id            uuid primary key default uuid_generate_v4(),
  date_prevue   date not null,
  libelle       text,
  montant       numeric(12,2),
  sens          text check (sens in ('entree','sortie')),
  certitude     text default 'prevu' check (certitude in ('prevu','confirme')),
  prestation_id uuid references prestation(id)
);

-- Paramètres de l'entreprise (en-tête des devis/factures + numérotation).
-- Une seule ligne. Ajouté en Phase 7.
create table parametres_entreprise (
  id                 uuid primary key default uuid_generate_v4(),
  raison_sociale     text,
  adresse            text,
  code_postal        text,
  ville              text,
  pays               text default 'France',
  iban               text,
  siren              text,
  mention_tva        text,
  conditions_devis   text,
  conditions_facture text,
  prochain_num_devis   int not null default 1,
  prochain_num_facture int not null default 1
);

-- =========================================================
-- 7. INDEX UTILES
-- =========================================================
create index idx_unite_reference        on unite(reference_id);
create index idx_ligne_prestation        on ligne_prestation(prestation_id);
create index idx_reservation_unite       on reservation_unite(unite_id);
create index idx_reservation_prestation  on reservation_unite(prestation_id);
create index idx_mouvement_unite         on mouvement(unite_id);
create index idx_previsionnel_date       on previsionnel(date_prevue);
