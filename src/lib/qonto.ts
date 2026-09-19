// Client Qonto REST API v2

export type QontoTransaction = {
  id: string;
  transaction_id: string;
  amount: number;
  side: "debit" | "credit";
  label: string;
  settled_at: string | null;
  emitted_at: string | null;
  status: string;
  reference: string | null;
  note: string | null;
  category: string | null;
  cashflow_category: { id: string; name: string } | null;
  cashflow_subcategory: { id: string; name: string } | null;
  bank_account_id: string;
  attachment_ids: string[];
};

export type QontoAttachment = {
  id: string;
  url: string;
  file_name: string;
  file_content_type: string;
  file_size: number;
};

export async function fetchQontoAttachment(
  login: string,
  token: string,
  attachmentId: string,
): Promise<QontoAttachment> {
  const resp = await fetch(`https://thirdparty.qonto.com/v2/attachments/${attachmentId}`, {
    headers: { Authorization: `${login}:${token}` },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`Qonto attachment ${resp.status}`);
  const data = await resp.json();
  return data.attachment;
}

export type QontoOrg = {
  name: string;
  slug: string;
  bank_accounts: { slug: string; iban: string; balance: number; name: string; status: string }[];
};

export async function fetchQontoOrg(login: string, token: string): Promise<QontoOrg> {
  const resp = await fetch("https://thirdparty.qonto.com/v2/organization", {
    headers: { Authorization: `${login}:${token}` },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`Qonto API ${resp.status}`);
  const data = await resp.json();
  return data.organization;
}

export async function fetchQontoTransactions(
  login: string,
  token: string,
  accountSlug: string,
  settledAfter?: string,
  includePending = false,
): Promise<QontoTransaction[]> {
  const all: QontoTransaction[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams();
    params.set("slug", accountSlug);
    // Toujours les transactions réglées ; en option celles en attente de règlement
    // (les plus récentes, qui n'ont pas encore de settled_at).
    params.append("status[]", "completed");
    if (includePending) params.append("status[]", "pending");
    params.set("per_page", "100");
    params.set("current_page", String(page));
    // On trie par date d'émission quand on inclut le pending (settled_at peut être null).
    params.set("sort_by", includePending ? "emitted_at:desc" : "settled_at:desc");
    if (settledAfter) params.set("settled_after", settledAfter);

    const resp = await fetch(`https://thirdparty.qonto.com/v2/transactions?${params}`, {
      headers: { Authorization: `${login}:${token}` },
      cache: "no-store",
    });
    if (!resp.ok) throw new Error(`Qonto API ${resp.status}`);

    const data = await resp.json();
    all.push(...data.transactions);
    if (!data.meta?.next_page) break;
    page++;
  }

  return all;
}

/** Mappe les catégories Qonto vers notre nomenclature (type + specification). */
export function mapQontoCategorie(
  side: "debit" | "credit",
  cat: string | null,
  sub: string | null,
  label: string,
): { type: string; specification: string } {
  if (side === "credit") {
    const l = label.toLowerCase();
    if (l.includes("subvention")) return { type: "Subventions_Dons", specification: "Subvention" };
    if (l.includes("don") || l.includes("donati")) return { type: "Subventions_Dons", specification: "Don" };
    if (l.includes("remboursement")) return { type: "Remboursement", specification: "Remboursement" };
    if (l.includes("vente")) return { type: "Vente_Materiel", specification: "Vente de Materiel" };
    return { type: "Recettes_Evenement", specification: "Recettes Evenement" };
  }

  // Sorties
  const c = cat ?? "";
  const s = sub ?? "";

  if (s === "Sous-traitants") return { type: "Frais_Techniques", specification: "Techniciens" };
  if (s === "Salaires") return { type: "Frais_Techniques", specification: "Techniciens" };
  if (s === "Coûts de production") return { type: "Frais_Techniques", specification: "Techniciens" };
  if (c === "Travel Expenses" || s === "Transport" || s === "Autres frais de déplacement")
    return { type: "Frais_Techniques", specification: "Transport" };
  if (s === "Loyer") return { type: "Frais_Fixes", specification: "Local" };
  if (s === "Achats de matériel" && c.includes("technolog"))
    return { type: "Matériel", specification: "Achat de matériel" };
  if (s === "Licences logicielles") return { type: "Frais_Fixes", specification: "Frais IT" };
  if (c === "Frais bancaires" || s.includes("bancaires"))
    return { type: "Frais_Fixes", specification: "Frais Bancaires" };
  if (s === "Frais d'assurance") return { type: "Frais_Fixes", specification: "Assurance" };
  if (c.includes("marketing") || s.includes("Campagnes"))
    return { type: "Frais_Artistiques", specification: "Communication" };
  if (s === "Fournitures de bureau") return { type: "Frais_Fixes", specification: "Frais Bancaires" };

  // Fallback label
  const l = label.toLowerCase();
  if (l.includes("google")) return { type: "Frais_Fixes", specification: "Google Drive" };
  if (l.includes("assur")) return { type: "Frais_Fixes", specification: "Assurance" };
  if (l.includes("loyer") || l.includes("local")) return { type: "Frais_Fixes", specification: "Local" };
  if (l.includes("ovh") || l.includes("vercel") || l.includes("supabase") || l.includes("notion"))
    return { type: "Frais_Fixes", specification: "Frais IT" };

  return { type: "Matériel", specification: "Achat de matériel" };
}

/**
 * Date calendaire À PARIS d'un horodatage Qonto.
 *
 * Les horodatages de l'API sont en UTC : `settled_at.slice(0, 10)` prend donc la date
 * UTC, et une opération passée entre minuit et 2 h du matin heure française tombe la
 * veille. D'où des dates décalées d'un jour par rapport à ce qu'affiche Qonto.
 */
export function dateParis(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  // « fr-CA » formate en AAAA-MM-JJ, directement exploitable en base.
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
