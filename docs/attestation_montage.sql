-- Attestation de bon montage : le document que l'organisateur réclame pour couvrir
-- l'installation. Deux signatures — celle du monteur et celle d'un autre
-- co-président qui valide — selon le même circuit qu'une note de frais.
--
-- À exécuter dans l'éditeur SQL de Supabase.
create table if not exists public.attestation_montage (
  id uuid primary key default gen_random_uuid(),
  prestation_id uuid not null references prestation(id) on delete cascade,

  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'soumise', 'validee', 'refusee')),

  -- Champs du formulaire officiel, pré-remplis mais tous modifiables : le
  -- descriptif des moyens mis en place ne se déduit d'aucune donnée.
  manifestation text,
  lieu_montage text,
  dates_exploitation text,
  organisateur text,
  organisateur_adresse text,
  installateur text,
  responsable_montage text,
  installateur_adresse text,
  documents_plans text,
  moyens_par text,
  descriptif text,
  soussigne text,
  fait_a text,
  fait_le date,

  -- Circuit de signature
  redacteur_id uuid references membre(id) on delete set null,
  redacteur_signe_le timestamptz,
  valide_par uuid references membre(id) on delete set null,
  valide_le timestamptz,
  motif_refus text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Une attestation par événement : c'est un document unique, pas une série.
create unique index if not exists attestation_montage_prestation_uniq
  on public.attestation_montage (prestation_id);

alter table public.attestation_montage enable row level security;
drop policy if exists "attestation_montage_all" on public.attestation_montage;
create policy "attestation_montage_all" on public.attestation_montage
  for all to authenticated using (true) with check (true);
