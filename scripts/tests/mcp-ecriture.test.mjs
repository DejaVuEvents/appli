// Tests des règles d'écriture du MCP (fonctions pures, sans base).
// Lancer : node --test scripts/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cheminJustificatif, cheminPorteEmpreinte, empreinte, motifIlike, rapprocher, sourceEcriture, typeJustificatif,
} from "../../src/lib/mcp-ecriture.ts";

const pdf = (texte) => new TextEncoder().encode(`%PDF-1.4\n${texte}`);

test("source : une transaction Qonto est « qonto »", () => {
  assert.equal(sourceEcriture({ qonto_transaction_id: "tx_1", note_frais_id: null, denomination: "AUDIOTEC" }), "qonto");
});

test("source : sans transaction ni note, c'est une saisie « manuel »", () => {
  assert.equal(sourceEcriture({ qonto_transaction_id: null, note_frais_id: null, denomination: "Audiotec facture 12" }), "manuel");
});

test("source : un remboursement de note de frais est « ndf », même venu de Qonto", () => {
  assert.equal(sourceEcriture({ qonto_transaction_id: "tx_2", note_frais_id: "n1", denomination: "Virement" }), "ndf");
  assert.equal(sourceEcriture({ qonto_transaction_id: "tx_3", note_frais_id: null, denomination: "Remboursement NDF0027" }), "ndf");
  assert.equal(sourceEcriture({ qonto_transaction_id: null, note_frais_id: null, denomination: "NDF 0012 Léo" }), "ndf");
  assert.equal(sourceEcriture({ qonto_transaction_id: null, note_frais_id: null, denomination: "Remboursement de la note de frais" }), "ndf");
  // Lien porté par note_frais.ecriture_id
  assert.equal(sourceEcriture({ qonto_transaction_id: "tx_4", note_frais_id: null, denomination: "Virement" }, new Set(["e4"]), "e4"), "ndf");
});

test("source : « NDFX » ou un mot qui contient ndf n'est pas une note de frais", () => {
  assert.equal(sourceEcriture({ qonto_transaction_id: "tx", note_frais_id: null, denomination: "NDFX location" }), "qonto");
  assert.equal(sourceEcriture({ qonto_transaction_id: "tx", note_frais_id: null, denomination: "Achat ndf-like" }), "qonto");
});

test("filtre fournisseur : %, _ et \\ sont échappés", () => {
  assert.equal(motifIlike(" 100%_net "), "%100\\%\\_net%");
});

test("dédoublonnage : le chemin porte l'empreinte du contenu", () => {
  const a = pdf("facture A");
  const sha = empreinte(a);
  assert.equal(sha.length, 64);
  const chemin = cheminJustificatif("", sha, "pdf", 1700000000000);
  assert.equal(chemin, `1700000000000-${sha.slice(0, 16)}.pdf`);
  assert.ok(cheminPorteEmpreinte(chemin, sha));
  assert.ok(!cheminPorteEmpreinte(chemin, empreinte(pdf("facture B"))));
  assert.ok(cheminPorteEmpreinte(cheminJustificatif("ndf/", sha, "pdf"), sha));
  // Anciennes pièces de l'application : nom aléatoire, il faudra comparer le contenu.
  assert.ok(!cheminPorteEmpreinte("1699999999999-k3j4h5.pdf", sha));
});

test("type réel : lu dans les octets, pas dans le nom", () => {
  assert.equal(typeJustificatif(pdf("x"))?.ext, "pdf");
  assert.equal(typeJustificatif(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext, "jpg");
  assert.equal(typeJustificatif(new TextEncoder().encode("<html>")), null);
});

const depenses = [
  { id: "q598", date: "2026-10-03", denomination: "AUDIOTEC", montant_ttc: 598, nb_pieces: 0 },
  { id: "q388", date: "2026-09-01", denomination: "AUDIOTEC", montant_ttc: 388, nb_pieces: 0 },
  { id: "q42", date: "2026-10-20", denomination: "LEROY MERLIN", montant_ttc: 42.5, nb_pieces: 1 },
];

test("rapprochement : montant exact et date à ± 5 jours seulement", () => {
  const { par_piece } = rapprocher([{ montant: 42.5, date: "2026-10-16" }], depenses);
  assert.deepEqual(par_piece[0].candidats.map((c) => c.id), ["q42"]);
  assert.equal(par_piece[0].candidats[0].ecart_jours, 4);
  // 6 jours d'écart : refusé ; 42,51 € : refusé.
  assert.equal(rapprocher([{ montant: 42.5, date: "2026-10-14" }], depenses).par_piece[0].candidats.length, 0);
  assert.equal(rapprocher([{ montant: 42.51, date: "2026-10-20" }], depenses).par_piece[0].candidats.length, 0);
});

test("rapprochement : deux factures (388 € + 210 €) payées par un virement de 598 €", () => {
  const { par_piece, paires } = rapprocher(
    [{ montant: 388, date: "2026-10-01", libelle: "F1" }, { montant: 210, date: "2026-10-02", libelle: "F2" }],
    depenses,
  );
  // La facture de 388 € d'octobre ne doit pas être rapprochée du virement de 388 € de septembre.
  assert.equal(par_piece[0].candidats.length, 0);
  assert.equal(paires.length, 1);
  assert.deepEqual(paires[0].pieces, [0, 1]);
  assert.equal(paires[0].depense.id, "q598");
});
