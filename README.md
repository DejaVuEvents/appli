# Déjà Vu — Application de gestion

Application web (Next.js + Supabase) de gestion intégrée du matériel scénique.
Voir le cahier des charges dans [`CLAUDE.md`](./CLAUDE.md) et les specs dans [`docs/`](./docs).

## Démarrage

### 1. Créer le projet Supabase (gratuit)

1. Va sur [supabase.com](https://supabase.com) → **New project**.
2. Dans **SQL Editor**, exécute dans l'ordre :
   - [`docs/schema_deja_vu.sql`](./docs/schema_deja_vu.sql) — crée toutes les tables.
   - [`docs/rls_policies.sql`](./docs/rls_policies.sql) — sécurise l'accès (utilisateurs connectés).
3. Dans **Authentication → Users**, crée ton compte (email + mot de passe).
4. Dans **Project Settings → API**, copie l'**URL** et la clé **anon / publishable**.

### 2. Configurer l'application

Copie `.env.example` en `.env.local` et renseigne :

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 3. Lancer en local

```bash
npm install
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000), connecte-toi avec le compte créé à l'étape 1.

## Structure

- `src/app/(app)/` — écrans authentifiés (tableau de bord, catalogue, clients, véhicules).
- `src/app/login/` — connexion.
- `src/lib/supabase/` — clients Supabase (navigateur + serveur) et middleware de session.
- `src/components/` — composants d'UI réutilisables.
- `docs/` — cahier des charges, schéma SQL, politiques RLS.

## Phases (feuille de route)

1. ✅ **Fondations** — catalogue matériel, clients, véhicules (en cours).
2. Devis — calcul auto des prix, sélection des unités, disponibilité.
3. Préparation — check-list, sorties/retours (QR), compteurs.
4. Inventaire & maintenance — sessions mobiles, fiches unités.
5. Calculateurs élec & levage.
6. Finance — sync Qonto, prévisionnel de trésorerie.
7. Facturation — PDF + email, conformité facturation électronique.
