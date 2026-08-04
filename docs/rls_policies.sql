-- =====================================================================
-- Déjà Vu — Politiques de sécurité (RLS)
-- À exécuter dans l'éditeur SQL de Supabase APRÈS schema_deja_vu.sql.
-- =====================================================================
--
-- Principe (Phase 1) : l'application est un outil interne pour une petite
-- équipe (< 10 personnes). Toute personne CONNECTÉE (authentifiée via
-- Supabase Auth) a un accès complet en lecture/écriture. Les visiteurs
-- non connectés (rôle "anon") n'ont aucun accès.
--
-- On pourra affiner plus tard (rôles, permissions par module) si besoin.
-- =====================================================================

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    -- 1) Activer la RLS sur la table
    execute format('alter table public.%I enable row level security;', t);

    -- 2) (Ré)créer une politique : accès complet pour les utilisateurs connectés
    execute format('drop policy if exists "authenticated_all" on public.%I;', t);
    execute format(
      'create policy "authenticated_all" on public.%I
         for all
         to authenticated
         using (true)
         with check (true);', t);
  end loop;
end $$;
