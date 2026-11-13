# Sauvegarde de Supabase (base + fichiers)

Le projet Supabase `vowcktyfbihyddgicoqp` est sur le plan **Free** : Supabase n'en fait
**aucune** sauvegarde automatique (réservées aux plans Pro et au-delà). Seule protection :
la sauvegarde nocturne sur le NAS décrite ici.

| Quoi | Où sur le NAS |
|---|---|
| Scripts | `/volume1/docker/backup-supabase/` (root, 750) — copies de `scripts/*.sh` du dépôt |
| Secrets | `/volume1/docker/backup-supabase/backup.env` (root, 600, jamais dans git) |
| Sauvegardes | `/volume1/backups/supabase-dejavu/` (root, 700) |

```
supabase-dejavu/
  db/AAAA-MM-JJ.dump          pg_dump -Fc, schémas public + auth
  storage/<bucket>/…          copie de chaque bucket (docs-prives, catalogue, factures, assets)
  storage/.manifestes/        liste des buckets (réglages) + état de chaque bucket
  tests-restauration/         rapports de test-restauration.sh
  backup.log                  journal horodaté
  dernier-etat.txt            « OK date » ou « ECHEC date »
```

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `SUPABASE_DB_URL` | Supabase → Project Settings → Database → Connection string, **Direct** (URI), mot de passe compris. Le NAS joint l'adresse IPv6 directe. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé `service_role` (lecture des buckets privés). |
| `BACKUP_DIR` | `/volume1/backups/supabase-dejavu` |
| `SUPABASE_URL` | Optionnelle (déduite de `SUPABASE_DB_URL`). |
| `STORAGE_BUCKETS` | Optionnelle : limiter à certains buckets (`"docs-prives catalogue"`). |
| `GARDER_QUOTIDIENS` / `GARDER_HEBDO` / `GARDER_MENSUELS` | 14 / 8 / 12 |
| `MIN_DUMP_OCTETS` / `MIN_DUMP_POURCENT` | Dump refusé sous 100 000 octets ou sous 50 % du précédent. |
| `PG_IMAGE` | `postgres:17-alpine` : pg_dump doit être ≥ la version du serveur (17), celui du NAS est en 15, donc le script passe par Docker. Si Supabase passe en 18, mettre `postgres:18-alpine`. |
| `BACKUP_ALERTE_CMD` | Optionnelle, vide par défaut : commande lancée en cas d'échec (message sur l'entrée standard). |

Après une rotation des clés Supabase (service_role ou mot de passe de la base), mettre à
jour `backup.env` : `sudo nano /volume1/docker/backup-supabase/backup.env`.

## Ce que fait le script

1. **Base** : `pg_dump` en lecture seule vers `db/.AAAA-MM-JJ.dump.partiel`, puis contrôle :
   `pg_restore --list` lisible, données de tables `public` et `auth.users` présentes, taille
   plausible. Seulement alors il devient `db/AAAA-MM-JJ.dump` (relancer le même jour le
   remplace). Sinon : erreur, fichier gardé en `db/.dernier-rejet.dump`, **aucune
   suppression d'ancien dump**.
2. **Rotation** (seulement après un dump valide) : garde les 14 plus récents ; parmi les
   plus anciens, le dernier de chaque semaine (le dimanche s'il existe) sur 8 semaines ;
   le premier de chaque mois (le 1er s'il existe) sur 12 mois. Un jour manqué ne fait
   donc pas perdre la semaine ou le mois. Aperçu sans rien supprimer :
   `--simuler-rotation`.
3. **Fichiers** : liste chaque bucket par l'API Storage, ne télécharge que les fichiers
   nouveaux ou modifiés (taille, eTag, date). Un fichier effacé du bucket reste dans la
   sauvegarde (compté « disparu » dans le journal).
4. Journal dans `backup.log`, code de sortie 1 à la moindre erreur, `dernier-etat.txt`.

Rien n'est jamais écrit côté Supabase. Aucun secret dans le journal ni sur une ligne de
commande (mot de passe passé à pg_dump par variable d'environnement, clé à curl par
fichier temporaire 600 effacé en fin de passage).

## Lancer à la main

```bash
ssh nas
sudo bash -c 'set -a; . /volume1/docker/backup-supabase/backup.env; set +a;
  /volume1/docker/backup-supabase/backup-supabase.sh'            # tout
#  … backup-supabase.sh --base-seulement | --fichiers-seulement | --simuler-rotation
sudo tail -n 20 /volume1/backups/supabase-dejavu/backup.log
```

## Planification (chaque nuit à 3 h)

Le NAS est à l'heure `Europe/Brussels`, identique à Paris (été/hiver compris).
`sudo crontab -e`, puis ajouter :

```cron
0 3 * * * set -a; . /volume1/docker/backup-supabase/backup.env; set +a; /volume1/docker/backup-supabase/backup-supabase.sh >/dev/null 2>&1
```

Vérifier : `sudo crontab -l`. Après une mise à jour d'UGOS, vérifier que la ligne est
toujours là (et `cat /volume1/backups/supabase-dejavu/dernier-etat.txt` le lendemain).

## Alerte en cas d'échec

Par défaut : ligne `[ERREUR]` dans `backup.log` et `ECHEC` dans `dernier-etat.txt`.
Pour être prévenu, mettre une commande dans `BACKUP_ALERTE_CMD`. L'appli sait déjà
envoyer des mails depuis le compte Gmail de l'association (`src/lib/mail.ts`, OAuth
`gmail.send`) mais seulement depuis Vercel ; le réutiliser demanderait une petite route
protégée appelée par le NAS. Non fait : à décider.

## Restaurer

### Base, vers un nouveau projet Supabase

Pré-requis : un Postgres 17 client (`docker run --rm -it --network host -v /volume1/backups/supabase-dejavu/db:/db postgres:17-alpine sh`).
`NEW` = chaîne de connexion **directe** du nouveau projet (même région, eu-west-1).

1. Extensions, dans le SQL Editor du nouveau projet :
   ```sql
   create extension if not exists btree_gist schema public;
   create extension if not exists pg_cron;   -- uuid-ossp et pgcrypto existent déjà
   ```
2. Comptes de connexion d'abord (les tables `public` y font référence). Le schéma `auth`
   du nouveau projet existe déjà : on ne recharge que les données utiles.
   ```bash
   PGOPTIONS='-c session_replication_role=replica' \
   pg_restore -d "$NEW" --data-only --schema=auth -t users -t identities /db/AAAA-MM-JJ.dump
   ```
3. Schéma `public` complet (tables, données, fonctions, RLS, droits) :
   ```bash
   pg_restore -d "$NEW" --schema=public --no-owner /db/AAAA-MM-JJ.dump
   ```
   L'erreur « schema "public" already exists » est normale.
4. Tâches pg_cron (hors dump) :
   ```sql
   select cron.schedule('entretien-comptable', '0 6 * * *', 'select entretien_comptable();');
   select cron.schedule('maj-statuts-echus',   '5 6 * * *', 'select maj_statuts_echus();');
   ```
5. Côté appli : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` du nouveau projet dans Vercel et `.env.local` ; réglages
   Auth (URL du site, redirections, Google) à refaire dans le tableau de bord. Les
   sessions sont perdues : chacun se reconnecte.

### Fichiers

Recrée les buckets manquants avec leurs réglages d'origine, puis renvoie chaque fichier
présent lors de la dernière sauvegarde. N'écrase jamais un fichier déjà là : utilisable
aussi sur le projet actuel pour récupérer des fichiers effacés.

```bash
sudo bash -c 'set -a; . /volume1/docker/backup-supabase/backup.env; set +a;
  export CIBLE_SUPABASE_URL=https://<nouveau-ref>.supabase.co CIBLE_SERVICE_ROLE_KEY=<clé>;
  /volume1/docker/backup-supabase/restaurer-storage.sh --simuler      # aperçu
  /volume1/docker/backup-supabase/restaurer-storage.sh [bucket…]'    # envoi
```

Les pièces privées sont stockées en base par chemin relatif : rien à réécrire. Les photos
du catalogue (bucket public) sont stockées en URL complète, avec l'ancien identifiant de
projet : après restauration, `update … set … = replace(…, '<ancien-ref>', '<nouveau-ref>')`
sur la colonne concernée.

## Tester la restauration

Restaure un dump dans un Postgres 17 jetable (conteneur sans réseau, supprimé à la fin)
et compte les lignes de chaque table :

```bash
sudo /volume1/docker/backup-supabase/test-restauration.sh /volume1/backups/supabase-dejavu/db/AAAA-MM-JJ.dump
```

Comparer `tests-restauration/AAAA-MM-JJ.comptes.tsv` aux comptes de la production
(SQL Editor, même requête : `count(*)` par table de `public` et `auth`). Les écarts
doivent se limiter à ce qui a changé depuis l'heure du dump. À refaire une fois par
trimestre, et après toute mise à jour majeure de Postgres chez Supabase.
