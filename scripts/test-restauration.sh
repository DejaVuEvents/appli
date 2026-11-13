#!/usr/bin/env bash
# Test de restauration d'un dump de backup-supabase.sh dans un Postgres 17 JETABLE (conteneur
# Docker supprimé à la fin). Ne touche ni Supabase ni le dump. À lancer en root sur le NAS :
#   sudo scripts/test-restauration.sh /volume1/backups/supabase-dejavu/db/AAAA-MM-JJ.dump
# Affiche les erreurs de pg_restore et le nombre de lignes par table ; écrit dans
# <BACKUP_DIR>/tests-restauration/ le journal de pg_restore et <jour>.comptes.tsv
# (schéma.table, lignes) pour comparaison avec la production.

set -Eeuo pipefail
umask 077
DUMP="${1:?usage: $0 <fichier.dump>}"
[[ -f "$DUMP" ]] || { echo "introuvable : $DUMP" >&2; exit 1; }
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
NOM="test-restauration-$$"
DOSSIER="$(cd "$(dirname "$DUMP")" && pwd)"
FICHIER="$(basename "$DUMP")"
SORTIE="$DOSSIER/../tests-restauration"; mkdir -p "$SORTIE"; SORTIE="$(cd "$SORTIE" && pwd)"
RAPPORT="$SORTIE/${FICHIER%.dump}"

nettoyer() { docker rm -f "$NOM" >/dev/null 2>&1 || true; }
trap nettoyer EXIT

MDP="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
docker run -d --name "$NOM" --network none -e POSTGRES_PASSWORD="$MDP" \
  -v "$DOSSIER:/dumps:ro" "$PG_IMAGE" >/dev/null
for _ in $(seq 60); do docker exec "$NOM" pg_isready -U postgres -q 2>/dev/null && break; sleep 1; done
sleep 2   # l'image redémarre une fois après l'initialisation

psql() { docker exec -i "$NOM" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

# Ce qu'une base Supabase possède déjà : rôles et extensions (non inclus dans un dump par schéma).
psql <<'SQL'
do $$ declare r text; begin
  foreach r in array array['anon','authenticated','service_role','authenticator','supabase_admin',
    'supabase_auth_admin','supabase_storage_admin','dashboard_user','pgbouncer','supabase_realtime_admin',
    'supabase_replication_admin','supabase_read_only_user','postgres_fdw_user'] loop
    if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I', r); end if;
  end loop; end $$;
create schema if not exists extensions;
create extension if not exists "uuid-ossp" schema extensions;
create extension if not exists pgcrypto schema extensions;
create extension if not exists btree_gist schema public;
SQL

debut=$SECONDS
set +e
docker exec "$NOM" pg_restore -U postgres -d postgres --no-owner "/dumps/$FICHIER" 2>"/tmp/$NOM.err"
code=$?
set -e
echo "pg_restore : code $code en $((SECONDS - debut)) s"
# Bruit attendu : schéma public déjà présent, objets propres à Supabase absents d'un Postgres nu.
grep -E '^pg_restore: (error|erreur)' "/tmp/$NOM.err" | sort | uniq -c | sort -rn | head -40 || true
grep -E 'errors ignored on restore' "/tmp/$NOM.err" || echo "aucune erreur ignorée"
cp "/tmp/$NOM.err" "$RAPPORT.restauration.log"; rm -f "/tmp/$NOM.err"

# Comptes exacts par table.
psql -F $'\t' <<'SQL' >"$RAPPORT.comptes.tsv"
create temp table c(t text, n bigint);
do $$ declare r record; n bigint; begin
  for r in select schemaname s, tablename t from pg_tables where schemaname in ('public','auth') loop
    execute format('select count(*) from %I.%I', r.s, r.t) into n;
    insert into c values (r.s || '.' || r.t, n);
  end loop; end $$;
select t, n from c order by t;
SQL
echo "tables restaurées : $(wc -l <"$RAPPORT.comptes.tsv"), lignes : $(awk -F'\t' '{s+=$2} END {print s}' "$RAPPORT.comptes.tsv")"
echo "détail : $RAPPORT.comptes.tsv ; journal pg_restore : $RAPPORT.restauration.log"
