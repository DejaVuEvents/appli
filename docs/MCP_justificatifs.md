# Notes de frais et justificatifs depuis Claude

Créer une note de frais et y joindre ses pièces sans ouvrir le site, avec le jeton
MCP personnel (Paramètres → Jeton MCP). L'écriture est réservée aux co-présidents
dont l'id figure dans la variable Vercel `MCP_ECRITURE_MEMBRES` (ids séparés par
des virgules). Les listes restent ouvertes aux co-présidents.

## Outils MCP

| Outil | Rôle |
|---|---|
| `creer_note_frais` | Note en **brouillon** + ses lignes. Renvoie l'id de la note et de chaque ligne. |
| `ajouter_ligne_note_frais` | Ajoute une ligne à une de ses notes en brouillon. |
| `lister_notes_frais_brouillon` | Ses brouillons, avec l'id des lignes et celles sans justificatif. |
| `lister_depenses_sans_justificatif` | Dépenses réelles du journal (dont Qonto) sans aucune pièce. |

Signer, soumettre et valider se font dans l'application, jamais par Claude.

## Joindre un fichier

Le fichier part du Mac vers le serveur avec curl, sans passer par Claude.

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

- PDF, JPEG, PNG ou HEIC, 4 Mo maximum (limite de Vercel : 4,5 Mo par requête).
- Une ligne qui a déjà une pièce n'est remplacée qu'avec `-F remplacer=oui`.
- La note doit être en brouillon et à soi. Une écriture qui rembourse une note de
  frais refuse la pièce : elle se joint à la ligne de la note.
- Réponse JSON : `{"ok": true, ...}` ou `{"erreur": "..."}` avec un code HTTP explicite.
