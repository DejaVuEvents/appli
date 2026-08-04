# Déploiement de « Déjà Vu » sur Vercel

L'app Next.js s'héberge sur **Vercel** (gratuit). La base de données est déjà en ligne
sur **Supabase**. Objectif : ~0 €/mois.

## 1. Pousser le code sur GitHub

Le dépôt Git est déjà initialisé localement (1er commit fait). Il reste à créer le
dépôt distant et à pousser :

```bash
# Crée un dépôt VIDE sur github.com (sans README), puis :
git remote add origin https://github.com/<ton-compte>/deja-vu.git
git branch -M main
git push -u origin main
```

> ⚠️ Le fichier `.env.local` (tes secrets) est **ignoré par Git** : il ne partira pas sur
> GitHub. C'est normal — les secrets se configurent côté Vercel (étape 3).

## 2. Importer le projet dans Vercel

1. Va sur [vercel.com](https://vercel.com) → **Add New… → Project**.
2. Connecte ton compte GitHub, choisis le dépôt `deja-vu`.
3. Framework détecté : **Next.js** (rien à changer). Ne clique pas encore « Deploy » :
   ajoute d'abord les variables (étape 3).

## 3. Variables d'environnement (Settings → Environment Variables)

Recopie les valeurs depuis ton `.env.local`. Obligatoires :

| Variable | Où la trouver |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |

Optionnelles (fonctionnalités liées) :

| Variable | Fonction |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` | Drive + Agenda + invitations |
| `ORS_API_KEY` | Itinéraires logistiques |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Résumé de réunions |

Coche les 3 environnements (Production, Preview, Development) pour chaque variable.

## 4. Déployer

Clique **Deploy**. Au bout de ~1-2 min tu obtiens une URL `https://<projet>.vercel.app`.

## 5. Après le déploiement

- **Comptes utilisateurs** : chaque personne a besoin d'un compte
  (Supabase → Authentication → Add user, email + mot de passe). L'app exige la connexion.
- **Google OAuth** : dans la console Google Cloud, ajoute l'URL de production
  (`https://<projet>.vercel.app`) aux **origines JavaScript autorisées** et l'URI de
  redirection, sinon Drive/Agenda ne marcheront qu'en local.
- **Nom de domaine** (optionnel) : Vercel → Settings → Domains.

## 6. Continuer à faire des modifications

C'est le flux normal, le site reste en ligne :

```bash
# après des modifs de code
git add -A
git commit -m "Description de la modif"
git push
```

Vercel **redéploie automatiquement** à chaque push sur `main` (~1-2 min). Les utilisateurs
ne voient aucune coupure.

> Les **changements de base de données** (migrations SQL) s'appliquent, eux, immédiatement
> au projet Supabase partagé — prudence en production (tester d'abord si possible).
