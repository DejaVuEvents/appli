# Outil de gestion Déjà Vu

> À coller dans une page vide sous la section **Déjà Vu**. Notion convertit titres, tableaux et listes automatiquement.

Application web qui remplace Tiime, l'Excel de trésorerie et les tableurs matériel. Une base unique : le matériel est saisi une fois et alimente devis, préparation, inventaire, plan technique et compta.

**En production.** 237 commits, du 4 août au 20 octobre 2026. Coût : 0 €/mois.

---

## Stack

| | |
|---|---|
| Base + auth | Supabase (PostgreSQL), projet `vowcktyfbihyddgicoqp` |
| App | Next.js 16, App Router, PWA |
| Hébergement | Vercel |
| Itinéraires | Valhalla puis OSRM (sans clé) |
| Adresses | Base Adresse Nationale |
| Cartes | OpenStreetMap |
| PDF | générés par l'app (@react-pdf) |
| Dépôt | `DejaVuEvents/appli` |

Aucune dépendance payante, aucune clé d'API à renouveler sur les services critiques — choix délibéré après que le géocodage d'OpenRouteService soit tombé en production.

---

## Modules

**Catalogue & inventaire** — 412 références (dont le catalogue externe Audiotec pour la sous-location), 121 unités suivies individuellement. Chaque unité a un nom d'usage (`Laser 3`, `Beam 11`), un état, des compteurs, un QR code, une date d'achat. Groupes = matériel qui part ensemble.

**Événements & documents** — plusieurs devis/factures par événement, préparation et disponibilité au niveau de l'événement (une seule check-list). Tarif dégressif, tarif client, transport au km. Les ventes de matériel sont traitées à part : ni dates, ni familles, ni disponibilité.

**Matériel réellement utilisé** — liste par événement, alimentée par les documents mais modifiable. Décocher retire du ROI et de l'historique sans toucher au devis. C'est elle qui fait foi.

**Affectation des unités** — l'outil désigne quelles unités partent : pas avant leur date d'achat, pas si déjà réservées (contrainte GiST), la moins utilisée en priorité. Le manque est affiché comme sous-location.

**Préparation & retour** — check-list mobile, scan QR, compteurs, contrôle de retour avec photo.

**Plan technique** — levage (poids vs capacité) et électricité (arborescence source → armoire → prise, conso qui remonte, code couleur). Aide à la décision, validation humaine.

**Finance** — journal miroir de Qonto, prévisionnel, synthèse mensuelle, alerte découvert, exports, compte de résultat annuel.

**Notes de frais** — circuit complet avec double signature, justificatifs fusionnés au PDF. Frais kilométriques calculés dans l'outil (adresses, carte, tracé, conso, péages, option sans péage) ; le relevé est reconstruit à la demande depuis la ligne.

**Attestation de bon montage** — format du modèle officiel (mémento ensembles démontables, art. 67), pré-remplie, signée, téléchargeable.

**Organisation** — calendrier + Google Agenda/Meet, planning par compétences, réunions avec transcript et extraction d'actions, suivi d'avancement.

---

## Chiffres

| | |
|---|---|
| Événements | 62 |
| Devis & factures | 96 (40 factures émises) |
| Clients | 19 |
| Références | 412 |
| Unités | 121 |
| Lignes de devis | 957, dont 435 reliées au catalogue |
| Matériel engagé | 300 entrées |
| Unités affectées | 310 |
| Écritures | 382 |
| Notes de frais | 22 |

---

## Décisions structurantes

**Numérotation séparée de Tiime** — préfixes `DV-` / `FA-`, série repartie de 1. Tiime est à 000062 ; sans préfixe, deux documents auraient porté le même numéro. Les documents repris gardent le leur.

**Le journal est un miroir de la banque** — toute transaction Qonto existe dans l'outil, y compris en attente ; celles qui disparaissent sont retirées. C'est la saisie sans origine bancaire qui est l'anomalie. Cette inversion a réglé les écarts de solde récurrents.

**La liste du matériel fait foi, pas le devis** — un devis converti en facture duplique ses lignes ; les additionner gonflait le ROI (10 944 € comptés pour 6 519 € réels sur 2026). Le matériel est traité comme un ensemble de références : on part du document le plus complet, chaque autre n'apporte que ce qui manque.

**Le relevé d'itinéraire est une donnée dérivée** — reconstruit depuis la ligne, pas déposé comme fichier. Il ne peut donc ni manquer ni diverger.

**Services sans clé** — Valhalla, OSRM, BAN, OpenStreetMap. Après la panne du géocodage ORS, plus rien de critique ne dépend d'une clé.

---

## Règles d'écran

1. **Un état dit toujours la suite** — ce qui manque et la prochaine action. Bouton désactivé sans raison = bug.
2. **Une validation serveur a son pendant visible** — Next masque les messages des Server Actions en production.
3. **Un import ne contourne jamais un contrôle** — ne pas poser une signature ou un paiement à la place de l'utilisateur.
4. **Un seul mot par objet** — « événement » à l'écran, jamais « prestation ».
5. **L'écran s'adapte à la nature de l'objet** — un devis de vente n'affiche pas les blocs d'une prestation.
6. **Textes courts** — quelques mots, jamais de paragraphe explicatif.

---

## À faire

**Priorité**

- [ ] **Sauvegarde régulière de la base** — rien en place, point le plus critique.
- [ ] **Sync Qonto** — accès API à demander. Import manuel en attendant.
- [ ] **Comptes individuels** — certains usages passent encore par un compte partagé.

**En cours**

- [ ] 522 lignes de devis non reliées au catalogue (une partie est de la main d'œuvre, à écarter). Écran de rattachement en masse disponible.
- [ ] Compteurs d'heures/sorties encore à zéro : ils se remplissent au scan QR lors des chargements.
- [ ] Notifications e-mail inertes (autorisation Gmail à étendre). L'in-app fonctionne.
- [ ] Références sans unité : passe-câbles, licence Pangolin, split box DMX.

**Plus tard**

- [ ] Facturation électronique (obligation 2026-2027, plateforme agréée).
- [ ] Jarvis : serveur MCP sur Vercel pour piloter l'app à la voix depuis Claude.
