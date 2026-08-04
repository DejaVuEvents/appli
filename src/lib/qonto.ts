// Client Qonto REST API v2

export type QontoTransaction = {
  id: string;
  transaction_id: string;
  amount: number;
  side: "debit" | "credit";
  label: string;
  settled_at: string;
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
): Promise<QontoTransaction[]> {
  const all: QontoTransaction[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      slug: accountSlug,
      "status[]": "completed",
      per_page: "100",
      current_page: String(page),
      sort_by: "settled_at:desc",
    });
    if (settledAfter) params.set("settled_after", settledAfter);

    const resp = await fetch(`https://thirdparty.qonto.com/v2/transactions?${params}`, {
      headers: { Authorization: `${login}:${token}` },
      cache: "no-store",
    });
    if (!resp.ok) throw new Error(`Qonto API ${resp.status}`);

    const data = await resp.json();
    all.push(...data.transactions);
    if (!data.meta.next_page) break;
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
