#!/usr/bin/env bash
# Ré-upload des fichiers sauvegardés par backup-supabase.sh vers un projet Supabase
# (nouveau projet après sinistre, ou le même pour récupérer des fichiers effacés).
# Ne remplace JAMAIS un fichier déjà présent (x-upsert: false) ; crée les buckets manquants
# avec leurs réglages d'origine (public, taille max, types autorisés).
#
# Variables : BACKUP_DIR, CIBLE_SUPABASE_URL (https://<ref>.supabase.co), CIBLE_SERVICE_ROLE_KEY
# Usage : restaurer-storage.sh [--simuler] [bucket…]     (défaut : tous les buckets sauvegardés)
# Seuls les fichiers présents dans le bucket lors de la dernière sauvegarde sont renvoyés
# (storage/.manifestes/<bucket>.tsv), pas ceux effacés depuis et gardés en local.

set -Eeuo pipefail
umask 077
SIMULER=""
if [[ "${1:-}" == --simuler ]]; then SIMULER=1; shift; fi
: "${BACKUP_DIR:?BACKUP_DIR non défini}"
: "${CIBLE_SUPABASE_URL:?CIBLE_SUPABASE_URL non défini}"
: "${CIBLE_SERVICE_ROLE_KEY:?CIBLE_SERVICE_ROLE_KEY non défini}"
CIBLE_SUPABASE_URL="${CIBLE_SUPABASE_URL%/}"
MAN="$BACKUP_DIR/storage/.manifestes"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
printf 'apikey: %s\nAuthorization: Bearer %s\n' "$CIBLE_SERVICE_ROLE_KEY" "$CIBLE_SERVICE_ROLE_KEY" >"$TMP/entetes"

api() {   # api <méthode> <chemin> [curl…] → code HTTP, corps dans $TMP/rep
  local m="$1" c="$2"; shift 2
  curl -sS --retry 3 --connect-timeout 20 --max-time 900 -o "$TMP/rep" -w '%{http_code}' \
    -H @"$TMP/entetes" -X "$m" "$@" "$CIBLE_SUPABASE_URL/storage/v1/$c"
}

if (( $# )); then buckets=("$@"); else mapfile -t buckets < <(jq -r '.[].id' "$MAN/buckets.json"); fi
if [[ -n "$SIMULER" ]]; then echo "cible : $CIBLE_SUPABASE_URL (SIMULATION : aucun envoi)"; else echo "cible : $CIBLE_SUPABASE_URL"; fi
total_err=0
for b in "${buckets[@]}"; do
  [[ -f "$MAN/$b.tsv" ]] || { echo "bucket $b : pas de manifeste, ignoré"; continue; }
  if [[ -z "$SIMULER" ]]; then
    code="$(api GET "bucket/$b")"
    if [[ "$code" != 200 ]]; then
      corps="$(jq -c --arg b "$b" '.[] | select(.id == $b) | {id, name, public, file_size_limit, allowed_mime_types}' "$MAN/buckets.json")"
      code="$(api POST bucket -H "Content-Type: application/json" --data "$corps")"
      [[ "$code" == 200 ]] || { echo "bucket $b : création impossible ($code $(cat "$TMP/rep"))"; total_err=$((total_err + 1)); continue; }
      echo "bucket $b : créé"
    fi
  fi
  envoyes=0 presents=0 err=0
  while IFS=$'\t' read -r chemin _ _ _ type; do
    f="$BACKUP_DIR/storage/$b/$chemin"
    if [[ ! -f "$f" ]]; then echo "  manquant en local : $chemin"; err=$((err + 1)); continue; fi
    if [[ -n "$SIMULER" ]]; then envoyes=$((envoyes + 1)); continue; fi
    enc="$(jq -rn --arg p "$chemin" '$p | split("/") | map(@uri) | join("/")')"
    code="$(api POST "object/$b/$enc" -H "Content-Type: ${type:-application/octet-stream}" \
      -H "x-upsert: false" --data-binary @"$f")"
    case "$code" in
      200) envoyes=$((envoyes + 1)) ;;
      400|409) if grep -qiE 'exist|duplicate' "$TMP/rep"; then presents=$((presents + 1))
               else echo "  échec $chemin ($code $(cut -c1-150 "$TMP/rep"))"; err=$((err + 1)); fi ;;
      *) echo "  échec $chemin ($code $(cut -c1-150 "$TMP/rep"))"; err=$((err + 1)) ;;
    esac
  done <"$MAN/$b.tsv"
  echo "bucket $b : $envoyes ${SIMULER:+à }envoyé(s), $presents déjà présent(s), $err échec(s), $(wc -l <"$MAN/$b.tsv") au manifeste"
  total_err=$((total_err + err))
done
(( total_err == 0 ))
