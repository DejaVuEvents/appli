-- =====================================================================
-- Déjà Vu — Journal des écritures faites par Claude (MCP)
-- PROPOSITION, non appliquée. À exécuter dans l'éditeur SQL de Supabase.
-- =====================================================================
--
-- Une ligne par écriture passée par /api/mcp ou /api/mcp/upload : qui, quoi,
-- quand, sur quoi. Le code y écrit déjà (lib/mcp-ecriture.ts → journaliserMcp)
-- et ignore l'échec tant que la table n'existe pas : la trace part alors
-- seulement dans les journaux Vercel (« [mcp-ecriture] … »).
--
-- Seule la clé de service écrit (elle contourne RLS). Les co-présidents
-- connectés peuvent lire ; personne ne peut modifier ni effacer depuis l'appli.
-- Jamais de jeton ni de contenu de fichier ici : nom, taille, empreinte SHA-256.

create table if not exists public.mcp_journal (
  id          uuid primary key default gen_random_uuid(),
  le          timestamptz not null default now(),
  membre_id   uuid references public.membre(id) on delete set null,
  action      text not null,
  cible_type  text not null,
  cible_id    uuid,
  details     jsonb not null default '{}'::jsonb
);

create index if not exists mcp_journal_le_idx on public.mcp_journal (le desc);
create index if not exists mcp_journal_cible_idx on public.mcp_journal (cible_type, cible_id);

alter table public.mcp_journal enable row level security;

drop policy if exists "co_presidents_lisent" on public.mcp_journal;
create policy "co_presidents_lisent" on public.mcp_journal
  for select to authenticated
  using (exists (
    select 1 from public.membre m
    where m.id = auth.uid() and m.role = 'co_president' and m.actif
  ));
-- Pas de politique insert/update/delete : seul le serveur (clé de service) écrit.
-- Attention : rls_policies.sql pose « authenticated_all » sur TOUTES les tables. Le
-- relancer ouvrirait ce journal en écriture : retirer ensuite cette politique ici.
