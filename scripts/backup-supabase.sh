#!/usr/bin/env bash
# Sauvegarde de Supabase (Déjà Vu) vers le NAS : base + fichiers Storage.
#
#   db/AAAA-MM-JJ.dump        pg_dump -Fc des schémas public + auth, vérifié par pg_restore --list
#   storage/<bucket>/<chemin> copie incrémentale de chaque bucket (API Storage)
#   storage/.manifestes/      état de chaque bucket au dernier passage + liste des buckets
#   backup.log                journal horodaté ; dernier-etat.txt : OK ou ECHEC
#
# Lecture seule côté Supabase : un SELECT (pg_dump) et des GET/LIST sur Storage.
# Variables d'environnement (jamais dans ce fichier) :
#   SUPABASE_DB_URL            postgresql://postgres:<mdp>@db.<ref>.supabase.co:5432/postgres
#   SUPABASE_SERVICE_ROLE_KEY  clé « service_role » (lecture des buckets privés)
#   BACKUP_DIR                 dossier de sortie (créé en 700)
# Optionnelles : SUPABASE_URL (déduite de l'URL de la base sinon), STORAGE_BUCKETS (liste
# séparée par des espaces, défaut : tous), GARDER_QUOTIDIENS=14, GARDER_HEBDO=8,
# GARDER_MENSUELS=12, MIN_DUMP_OCTETS=100000, MIN_DUMP_POURCENT=50, PG_IMAGE=postgres:17-alpine,
# BACKUP_ALERTE_CMD (commande lancée en cas d'échec, message sur l'entrée standard).
#
# Usage : backup-supabase.sh [--base-seulement | --fichiers-seulement | --simuler-rotation]
# Code de sortie : 0 si tout est bon, 1 sinon (le détail est dans backup.log).

set -Eeuo pipefail
umask 077
export LC_ALL=C.UTF-8 TZ="${TZ:-Europe/Paris}"

MODE=tout
case "${1:-}" in
  "") ;;
  --base-seulement) MODE=base ;;
  --fichiers-seulement) MODE=fichiers ;;
  --simuler-rotation) MODE=simuler ;;
  *) echo "usage: $0 [--base-seulement | --fichiers-seulement | --simuler-rotation]" >&2; exit 2 ;;
esac

: "${BACKUP_DIR:?BACKUP_DIR non défini}"
GARDER_QUOTIDIENS="${GARDER_QUOTIDIENS:-14}"
GARDER_HEBDO="${GARDER_HEBDO:-8}"
GARDER_MENSUELS="${GARDER_MENSUELS:-12}"
MIN_DUMP_OCTETS="${MIN_DUMP_OCTETS:-100000}"
MIN_DUMP_POURCENT="${MIN_DUMP_POURCENT:-50}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
PG_MAJEURE_MIN="${PG_MAJEURE_MIN:-17}"

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/storage/.manifestes"
chmod 700 "$BACKUP_DIR"
DB="$BACKUP_DIR/db"
LOG="$BACKUP_DIR/backup.log"
TMP="$(mktemp -d)"
ERREURS=0

log() {   # log NIVEAU message…
  local ligne
  ligne="$(date '+%Y-%m-%d %H:%M:%S %z') [$1] ${*:2}"
  printf '%s\n' "$ligne" >>"$LOG"
  printf '%s\n' "$ligne" >&2
}
echec() { log ERREUR "$*"; ERREURS=$((ERREURS + 1)); }

fin() {
  local code=$?
  rm -rf "$TMP"
  [[ -n "${PARTIEL:-}" && -e "$PARTIEL" ]] && rm -f "$PARTIEL"
  if (( code != 0 || ERREURS > 0 )); then
    code=1
    log ERREUR "ÉCHEC de la sauvegarde ($ERREURS erreur(s)) — voir les lignes ci-dessus"
    printf 'ECHEC %s\n' "$(date '+%Y-%m-%d %H:%M')" >"$BACKUP_DIR/dernier-etat.txt"
    if [[ -n "${BACKUP_ALERTE_CMD:-}" ]]; then
      printf 'Sauvegarde Supabase Déjà Vu en échec le %s (%s erreur(s)). Voir %s\n' \
        "$(date '+%d/%m/%Y %H:%M')" "$ERREURS" "$LOG" | bash -c "$BACKUP_ALERTE_CMD" >/dev/null 2>&1 \
        || log ERREUR "la commande d'alerte a échoué"
    fi
  elif [[ "$MODE" != simuler ]]; then
    printf 'OK %s\n' "$(date '+%Y-%m-%d %H:%M')" >"$BACKUP_DIR/dernier-etat.txt"
  fi
  exit "$code"
}
trap fin EXIT
trap 'echec "commande en échec ligne $LINENO (code $?)"' ERR

# Un seul passage à la fois (cron + lancement manuel).
exec 9>"$BACKUP_DIR/.verrou"
if ! flock -n 9; then log ERREUR "une sauvegarde tourne déjà"; exit 1; fi

# Journal borné (~2 Mo).
if [[ -f "$LOG" ]] && (( $(stat -c %s "$LOG") > 2000000 )); then
  tail -n 5000 "$LOG" >"$TMP/log" && cat "$TMP/log" >"$LOG"
fi

log INFO "début (mode $MODE) vers $BACKUP_DIR"

# ───────────────────────────── Base de données ─────────────────────────────

# Décompose SUPABASE_DB_URL en variables libpq : le mot de passe ne passe jamais sur une
# ligne de commande (visible dans ps) ni dans le journal.
charger_connexion() {
  local kv sortie
  sortie="$(python3 -I -c '
import os, sys
from urllib.parse import urlsplit, unquote, parse_qs
u = urlsplit(os.environ["SUPABASE_DB_URL"])
if u.scheme not in ("postgres", "postgresql") or not u.hostname or "\n" in os.environ["SUPABASE_DB_URL"]:
    sys.exit("SUPABASE_DB_URL : URL postgresql:// attendue")
q = parse_qs(u.query)
vals = {"PGHOST": u.hostname, "PGPORT": str(u.port or 5432), "PGUSER": unquote(u.username or "postgres"),
        "PGPASSWORD": unquote(u.password or ""), "PGDATABASE": unquote(u.path.lstrip("/")) or "postgres",
        "PGSSLMODE": q.get("sslmode", ["require"])[0]}
sys.stdout.write("".join(f"{k}={v}\n" for k, v in vals.items()))')" || return 1
  # shellcheck disable=SC2163  # kv vaut « NOM=valeur »
  while IFS= read -r kv; do export "$kv"; done <<<"$sortie"
}

# pg_dump/pg_restore locaux s'ils sont assez récents, sinon dans un conteneur jetable.
choisir_outils() {
  local maj=0
  if command -v pg_dump >/dev/null; then maj="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"; fi
  if (( maj >= PG_MAJEURE_MIN )); then PG_MODE=local; DBV="$DB"
  else
    command -v docker >/dev/null || { echec "pg_dump $maj trop ancien et docker absent"; return 1; }
    docker info >/dev/null 2>&1 || { echec "docker inaccessible (lancer en root)"; return 1; }
    PG_MODE=docker; DBV=/db
  fi
}

pg() {   # pg <programme> args… ; chemins de fichiers sous $DBV
  if [[ "$PG_MODE" == local ]]; then "$@"
  else
    docker run --rm --network host -u "$(id -u):$(id -g)" \
      -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE \
      -v "$DB:/db" "$PG_IMAGE" "$@"
  fi
}

dump_valides() {   # noms des dumps quotidiens, du plus récent au plus ancien
  find "$DB" -maxdepth 1 -type f -regextype posix-extended -regex '.*/[0-9]{4}-[0-9]{2}-[0-9]{2}\.dump' \
    -printf '%f\n' | sort -r
}

sauver_base() {
  [[ -n "${SUPABASE_DB_URL:-}" ]] || { echec "SUPABASE_DB_URL non défini"; return 1; }
  charger_connexion || { echec "SUPABASE_DB_URL illisible"; return 1; }
  choisir_outils || return 1

  local jour nom debut taille precedent liste n_public
  jour="$(date +%F)"; nom="$jour.dump"; debut=$SECONDS
  PARTIEL="$DB/.$nom.partiel"
  log INFO "pg_dump ($PG_MODE) de $PGHOST, schémas public + auth"
  if ! pg pg_dump --format=custom --compress=6 --schema=public --schema=auth \
        --lock-wait-timeout=120s --no-password --file="$DBV/.$nom.partiel" 2>"$TMP/pg_dump.err"; then
    echec "pg_dump a échoué : $(tail -n 3 "$TMP/pg_dump.err" | tr '\n' ' ')"
    return 1
  fi

  # Vérification : archive lisible, données présentes, taille plausible.
  taille="$(stat -c %s "$PARTIEL")"
  if ! liste="$(pg pg_restore --list "$DBV/.$nom.partiel" 2>"$TMP/pg_restore.err")"; then
    echec "dump illisible par pg_restore : $(tail -n 2 "$TMP/pg_restore.err" | tr '\n' ' ')"
    mv -f "$PARTIEL" "$DB/.dernier-rejet.dump"; return 1
  fi
  n_public="$(grep -c ' TABLE DATA public ' <<<"$liste" || true)"
  precedent="$(dump_valides | grep -vx "$nom" | head -1 || true)"
  local raison=""
  if (( n_public == 0 )); then raison="aucune donnée de table public"
  elif ! grep -q ' TABLE DATA auth users ' <<<"$liste"; then raison="table auth.users absente"
  elif (( taille < MIN_DUMP_OCTETS )); then raison="taille $taille o < $MIN_DUMP_OCTETS o"
  elif [[ -n "$precedent" ]] && (( taille * 100 < $(stat -c %s "$DB/$precedent") * MIN_DUMP_POURCENT )); then
    raison="taille $taille o < $MIN_DUMP_POURCENT % du précédent ($precedent, $(stat -c %s "$DB/$precedent") o)"
  fi
  if [[ -n "$raison" ]]; then
    echec "dump rejeté : $raison — gardé dans db/.dernier-rejet.dump, anciens dumps conservés"
    mv -f "$PARTIEL" "$DB/.dernier-rejet.dump"; return 1
  fi

  mv -f "$PARTIEL" "$DB/$nom"; PARTIEL=""; chmod 600 "$DB/$nom"
  log INFO "dump OK : db/$nom, $taille o, $n_public tables public, $(grep -c ' TABLE DATA ' <<<"$liste") tables au total, $((SECONDS - debut)) s"
}

# Garde : les GARDER_QUOTIDIENS plus récents ; parmi les plus anciens, le dernier de chaque semaine
# ISO (le dimanche s'il existe) sur GARDER_HEBDO semaines ; le premier de chaque mois (le 1er s'il
# existe) sur GARDER_MENSUELS mois. Supprime le reste.
rotation() {
  local simuler="${1:-}" f d s m n=0 nh=0 nm=0
  local -A garder=() semaines=() mois=()
  local -a dumps=()
  mapfile -t dumps < <(dump_valides)
  (( ${#dumps[@]} )) || return 0
  for f in "${dumps[@]}"; do
    (( n < GARDER_QUOTIDIENS )) && garder[$f]="quotidien"
    n=$((n + 1))
  done
  for f in "${dumps[@]:GARDER_QUOTIDIENS}"; do
    s="$(date -d "${f%.dump}" +%G-%V)"
    [[ -n "${semaines[$s]:-}" ]] && continue
    (( nh >= GARDER_HEBDO )) && break
    semaines[$s]=1; nh=$((nh + 1)); garder[$f]="${garder[$f]:-}hebdo"
  done
  for (( d = ${#dumps[@]} - 1; d >= 0; d-- )); do   # du plus ancien au plus récent : 1er dump du mois
    f="${dumps[d]}"; m="${f:0:7}"
    [[ -z "${mois[$m]:-}" ]] && mois[$m]="$f"
  done
  for m in $(printf '%s\n' "${!mois[@]}" | sort -r); do
    (( nm >= GARDER_MENSUELS )) && break
    f="${mois[$m]}"; garder[$f]="${garder[$f]:-} mensuel"; nm=$((nm + 1))
  done
  local supprimes=0
  for f in "${dumps[@]}"; do
    if [[ -n "${garder[$f]:-}" ]]; then
      [[ -n "$simuler" ]] && printf 'garde      %s  %s\n' "$f" "${garder[$f]}"
    else
      if [[ -n "$simuler" ]]; then printf 'SUPPRIME   %s\n' "$f"; else rm -f "$DB/$f"; fi
      supprimes=$((supprimes + 1))
    fi
  done
  [[ -n "$simuler" ]] || log INFO "rotation : ${#garder[@]} dump(s) gardé(s), $supprimes supprimé(s)"
}

# ───────────────────────────── Storage ─────────────────────────────

curl_storage() {   # curl_storage <méthode> <chemin API> [données JSON] ; en-têtes lus dans un fichier
  local args=(-fsS --retry 3 --retry-delay 2 --connect-timeout 20 --max-time 900 -H @"$TMP/entetes" -X "$1")
  [[ -n "${3:-}" ]] && args+=(-H "Content-Type: application/json" --data "$3")
  curl "${args[@]}" "$SUPABASE_URL/storage/v1/$2"
}

lister_bucket() {   # sortie TSV : chemin, taille, etag, maj, type MIME
  local bucket="$1" prefixe dossier offset page n
  local -a file=("")
  while (( ${#file[@]} )); do
    prefixe="${file[0]}"; file=("${file[@]:1}"); offset=0
    while :; do
      page="$(curl_storage POST "object/list/$bucket" "$(jq -nc --arg p "$prefixe" --argjson o "$offset" \
        '{prefix:$p, limit:1000, offset:$o, sortBy:{column:"name", order:"asc"}}')")" || return 1
      n="$(jq 'length' <<<"$page")" || return 1
      jq -r --arg p "$prefixe" '.[] | select(.id != null)
        | [(if $p == "" then .name else $p + "/" + .name end), (.metadata.size // 0), (.metadata.eTag // "-"), (.updated_at // "-"), (.metadata.mimetype // "application/octet-stream")]
        | @tsv' <<<"$page"
      while IFS= read -r dossier; do
        file+=("${prefixe:+$prefixe/}$dossier")
      done < <(jq -r '.[] | select(.id == null) | .name' <<<"$page")
      (( n < 1000 )) && break
      offset=$((offset + n))
    done
  done
}

sauver_bucket() {
  local bucket="$1" racine="$BACKUP_DIR/storage/$1" manifeste="$BACKUP_DIR/storage/.manifestes/$1.tsv"
  local chemin taille etag maj type cible enc nouveaux=0 modifies=0 identiques=0 absents=0 err=0
  local -A avant=() present=()
  mkdir -p "$racine"
  if [[ -f "$manifeste" ]]; then
    while IFS=$'\t' read -r chemin taille etag maj _; do avant["$chemin"]="$taille|$etag|$maj"; done <"$manifeste"
  fi
  if ! lister_bucket "$bucket" >"$TMP/liste.tsv"; then echec "bucket $bucket : liste impossible"; return 1; fi
  : >"$TMP/manifeste.tsv"
  while IFS=$'\t' read -r chemin taille etag maj type; do
    if [[ "$chemin" == /* || "$chemin" == *\\* || "/$chemin/" == */../* || "/$chemin/" == */./* ]]; then
      echec "bucket $bucket : nom d'objet refusé ($chemin)"; err=$((err + 1)); continue
    fi
    present["$chemin"]=1
    cible="$racine/$chemin"
    if [[ -f "$cible" && "${avant["$chemin"]:-}" == "$taille|$etag|$maj" && "$(stat -c %s "$cible")" == "$taille" ]]; then
      identiques=$((identiques + 1))
      printf '%s\t%s\t%s\t%s\t%s\n' "$chemin" "$taille" "$etag" "$maj" "$type" >>"$TMP/manifeste.tsv"; continue
    fi
    mkdir -p "$(dirname "$cible")"
    enc="$(jq -rn --arg p "$chemin" '$p | split("/") | map(@uri) | join("/")')"
    if curl_storage GET "object/authenticated/$bucket/$enc" >"$cible.partiel" 2>"$TMP/curl.err" \
       && [[ "$(stat -c %s "$cible.partiel")" == "$taille" ]]; then
      [[ -f "$cible" ]] && modifies=$((modifies + 1)) || nouveaux=$((nouveaux + 1))
      mv -f "$cible.partiel" "$cible"
      printf '%s\t%s\t%s\t%s\t%s\n' "$chemin" "$taille" "$etag" "$maj" "$type" >>"$TMP/manifeste.tsv"
    else
      rm -f "$cible.partiel"; err=$((err + 1))
      log ERREUR "bucket $bucket : échec de $chemin ($(tr '\n' ' ' <"$TMP/curl.err" | cut -c1-200))"
    fi
  done <"$TMP/liste.tsv"
  for chemin in "${!avant[@]}"; do [[ -z "${present["$chemin"]:-}" ]] && absents=$((absents + 1)); done
  mv -f "$TMP/manifeste.tsv" "$manifeste"
  log INFO "bucket $bucket : $nouveaux nouveau(x), $modifies modifié(s), $identiques inchangé(s), $absents disparu(s) du bucket (copie locale gardée), $err échec(s)"
  if (( err > 0 )); then ERREURS=$((ERREURS + err)); return 1; fi
}

sauver_fichiers() {
  [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] || { echec "SUPABASE_SERVICE_ROLE_KEY non défini"; return 1; }
  if [[ -z "${SUPABASE_URL:-}" ]]; then
    local ref
    ref="$(python3 -I -c 'import os,re; from urllib.parse import urlsplit
u = urlsplit(os.environ.get("SUPABASE_DB_URL", ""))
m = re.match(r"db\.([a-z0-9]+)\.supabase\.co$", u.hostname or "") or re.match(r"postgres\.([a-z0-9]+)$", u.username or "")
print(m.group(1) if m else "")')"
    [[ -n "$ref" ]] || { echec "SUPABASE_URL non défini et non déductible de SUPABASE_DB_URL"; return 1; }
    SUPABASE_URL="https://$ref.supabase.co"
  fi
  SUPABASE_URL="${SUPABASE_URL%/}"
  printf 'apikey: %s\nAuthorization: Bearer %s\n' "$SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY" >"$TMP/entetes"

  local buckets b
  if ! buckets="$(curl_storage GET bucket 2>"$TMP/curl.err")"; then
    echec "liste des buckets impossible ($(tr '\n' ' ' <"$TMP/curl.err" | cut -c1-200))"; return 1
  fi
  jq '[.[] | {id, name, public, file_size_limit, allowed_mime_types}]' <<<"$buckets" \
    >"$BACKUP_DIR/storage/.manifestes/buckets.json"
  local -a liste
  if [[ -n "${STORAGE_BUCKETS:-}" ]]; then read -ra liste <<<"$STORAGE_BUCKETS"
  else mapfile -t liste < <(jq -r '.[].id' <<<"$buckets"); fi
  for b in "${liste[@]}"; do
    [[ "$b" =~ ^[A-Za-z0-9._-]+$ && "$b" != .* ]] || { echec "nom de bucket refusé : $b"; continue; }
    sauver_bucket "$b" || true
  done
}

# ───────────────────────────── Enchaînement ─────────────────────────────

case "$MODE" in
  simuler) rotation simuler; exit 0 ;;
  base) if sauver_base; then rotation; fi ;;
  fichiers) sauver_fichiers || true ;;
  tout)
    if sauver_base; then rotation; else log ERREUR "rotation annulée : pas de dump valide aujourd'hui"; fi
    sauver_fichiers || true ;;
esac

du_total="$(du -sh "$BACKUP_DIR" | cut -f1)"
(( ERREURS == 0 )) && log INFO "terminé sans erreur ($du_total au total)"
