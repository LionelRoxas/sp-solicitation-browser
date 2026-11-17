// Client-side copies of the API shapes (Task 3 contract). Kept separate from server code.
export type Rfq = {
  id: number | string;
  sol_number: string;
  nsn: string;
  fsc: string;
  nomenclature: string;
  tech_docs: string | null;
  status: string | null;
  pr_number: string | null;
  qty: number | null;
  issued: string | null;
  return_by: string | null;
  detail_url: string | null;
  pdf_url: string | null;
  nsn_url: string | null;
  scraped_at: string | null;
};

export type Hit = Rfq & { score: number; reasons: string[] };

export type Intent = {
  keywords: string[];
  semantic: string;
  fsc: string[];
  nsn: string[];
  dueWithinDays?: number;
  minQty?: number;
  maxQty?: number;
};

export type ChatResponse = {
  reply: string;
  intent: Intent | null;
  source: string;
  results: Hit[];
  total: number;
};

export type RfqMeta = { total: number; lastScrapedAt: string | null; issuedDates: string[] };

export type RfqsResponse = { rows: Rfq[]; total: number; meta: RfqMeta };

export type SortKey = "return_by" | "issued" | "qty";
