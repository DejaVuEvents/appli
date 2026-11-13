# Notes de frais et justificatifs depuis Claude

Tenir ses notes de frais et joindre les pièces sans ouvrir le site, avec le jeton MCP
personnel (Paramètres → Jeton MCP). L'écriture est réservée aux co-présidents dont l'id
figure dans la variable Vercel `MCP_ECRITURE_MEMBRES` (ids séparés par des virgules) ;
la lecture reste ouverte aux co-présidents.

## Outils MCP du site (`/api/mcp`)

| Outil | Rôle |
|---|---|
| `creer_note_frais` | Note en **brouillon** + ses lignes. Renvoie l'id de la note et de chaque ligne. |
| `ajouter_ligne_note_frais` | Ajoute une ligne à une de ses notes en brouillon. |
| `modifier_ligne_note_frais` | Corrige libellé, date et/ou montant d'une ligne (brouillon). |
| `supprimer_ligne_note_frais` | Retire une ligne (brouillon). Jamais une note entière. |
| `signer_note_frais` | Signe sa note en brouillon (signature du profil requise). |
| `soumettre_note_frais` | Soumet sa note signée et prévient les autres co-présidents par mail. |
| `lister_notes_frais_brouillon` | Ses brouillons : signé ou non, id des lignes, lignes sans pièce. |
| `lister_depenses_sans_justificatif` | Dépenses sans pièce, par `source` (voir plus bas). |
| `proposer_rapprochements` | Factures (montant, date) → transactions Qonto candidates. |

Jamais par Claude : valider, refuser, marquer remboursée, supprimer une note. Ces gestes
restent dans l'application, à un co-président autre que le demandeur.

Toutes les règles de l'application sont rejouées : brouillon et demandeur = appelant
pour modifier, signature enregistrée pour signer, note signée + profil complet + au
moins une ligne pour soumettre, relevé d'itinéraire produit pour les déplacements sans
pièce (code partagé : `src/lib/ndf-soumission.ts`).

### Sources du journal

`lister_depenses_sans_justificatif` prend `source` :

- `qonto` (défaut) : transactions bancaires synchronisées ;
- `manuel` : saisies à la main (souvent des doublons d'une transaction Qonto) ;
- `ndf` : remboursements de notes de frais (lien vers la note, ou libellé « Remboursement
  NDF… » / « NDF 0027 ») — les pièces sont celles des lignes de la note ;
- `toutes`.

Filtres `depuis` (date), `fournisseur` (texte du libellé), `inclure_partiels` (ajoute les
dépenses qui ont déjà des pièces, avec leur nombre : paiement de plusieurs factures).

`proposer_rapprochements` : montant exact au centime, date à ± 5 jours (réglable), et
détection de deux factures payées par un seul virement (388 € + 210 € = 598 €).

## Joindre un fichier (`/api/mcp/upload`)

Le fichier part directement au serveur (curl, ou l'assistant du NAS), sans passer par Claude.

```bash
# Justificatif d'une ligne de note de frais
curl -H "Authorization: Bearer $MCP_TOKEN" \
     -F ligne_id=<id de la ligne> -F file=@facture.pdf \
     https://appli-pi.vercel.app/api/mcp/upload

# Pièce d'une dépense du journal (transaction Qonto, etc.)
curl -H "Authorization: Bearer $MCP_TOKEN" \
     -F ecriture_id=<id de l'écriture> -F file=@ticket.heic \
     https://appli-pi.vercel.app/api/mcp/upload
```

- PDF, JPEG, PNG ou HEIC (type lu dans les octets), **4 Mo maximum** : Vercel refuse tout
  corps de requête au-delà de 4,5 Mo. Erreur 413 avec la taille et la limite.
- **Écriture du journal** : chaque envoi AJOUTE une pièce (table `justificatif`), plusieurs
  par dépense, jamais d'écrasement. L'écriture repasse **« à valider »** (`valide = false`,
  le statut réel/prévisionnel ne change pas). Réponse : `valide_avant`, `valide_apres`,
  `nb_pieces`. Une écriture qui rembourse une note de frais refuse la pièce : elle se
  joint à la ligne de la note.
- **Ligne de note de frais** : une seule pièce, remplacée seulement avec `-F remplacer=oui`.
  La note doit être en brouillon et à soi.
- **Doublons** : le même fichier (empreinte SHA-256) déjà joint à la même cible n'est pas
  ajouté une seconde fois : réponse `{"ok": true, "doublon": true}`, rien ne change.
- Réponse JSON : `{"ok": true, ...}` ou `{"erreur": "..."}` avec un code HTTP explicite.

## Journal des écritures

Chaque écriture faite par le MCP est tracée (qui, quoi, quand, sur quoi ; jamais le jeton
ni le contenu d'un fichier) :

- dans les journaux Vercel, lignes `[mcp-ecriture]` ;
- dans la table `mcp_journal` une fois créée (`docs/mcp_journal.sql`, non appliquée).

## Assistant du NAS

L'assistant `assistant-nas` (`/volume1/docker/gmail-mcp`, `app/public.py`) relaie ces
outils et ajoute ceux qui lisent Gmail :

- `joindre_piece_jointe_mail` : désigne la pièce par `index` (rang donné par `get_email`),
  ou `nom_fichier` (+ `taille`, `type_mime`). Plus d'`attachmentId` : Gmail en donne un
  nouveau à chaque lecture du même message. La pièce est relue et téléchargée dans le
  même appel. Les images de signature (`inline`) sont ignorées sans critère.
- `joindre_mail_en_pdf` : reçu sans pièce jointe (Google Play, PayPal) rendu en PDF texte
  (en-tête expéditeur, date, objet, corps), puis joint comme n'importe quelle pièce.
- `joindre_fichier_depose` : fichier déposé dans le dossier partagé « Justificatifs-factures ».

## Essais

Automatiques : `npm test` (sources du journal, empreinte et doublons, type de fichier,
rapprochement 388 € + 210 € = 598 €) ; côté NAS, `tests/test_justificatifs.py`
(attachmentId qui change entre deux lectures, même nom de PJ, signature ignorée, limite de
taille, rendu PDF, deux pièces sur une écriture).

Manuels après déploiement (ils écrivent en base, à faire sur une vraie dépense) :

1. **Id Gmail changeant** : `get_email` sur une facture, puis `joindre_piece_jointe_mail`
   avec `index` → la pièce arrive (avant : « Pièce jointe introuvable »).
2. **Deux pièces sur une écriture** : joindre deux factures différentes à la dépense
   Audiotec de 598 € → `nb_pieces` passe à 2, rien n'est écrasé.
3. **Doublon** : rejoindre la même facture → `doublon: true`, `nb_pieces` inchangé.
4. **Repassage à valider** : valider l'écriture dans l'appli, joindre une pièce →
   `valide_avant: true`, `valide_apres: false`, la ligne réapparaît dans « À valider ».
5. **Filtre source** : `lister_depenses_sans_justificatif` sans argument → uniquement
   « (Qonto) » ; `source: "manuel"` → uniquement des saisies manuelles.
6. **Reçu sans PDF** : `joindre_mail_en_pdf` sur un reçu Google Play → PDF lisible joint.
