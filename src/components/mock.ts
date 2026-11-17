// Dev-only sample data, used ONLY when NEXT_PUBLIC_MOCK === '1'.
import type { ChatResponse, Hit, Rfq, RfqsResponse } from "@/lib/ui-types";

export const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

const base: Rfq = {
  id: 1,
  sol_number: "SPE1C1-27-Q-0127",
  nsn: "8455-01-145-6344",
  fsc: "8455",
  nomenclature: "SERVICE RIBBON, AWAR",
  tech_docs: null,
  status: null,
  pr_number: null,
  qty: 24000,
  issued: "2026-11-17",
  return_by: "2026-11-24",
  detail_url: "https://www.dibbs.bsm.dla.mil/rfq/rfqrec.aspx?sn=SPE1C127Q0127",
  pdf_url: "https://dibbs2.bsm.dla.mil/Downloads/RFQ/7/SPE1C127Q0127.PDF",
  nsn_url: "https://www.dibbs.bsm.dla.mil/rfq/rfqnsn.aspx?value=8455011456344",
  scraped_at: "2026-11-17T08:00:00Z",
};

const rows: Rfq[] = [
  base,
  { ...base, id: 2, sol_number: "SPE7M1-27-T-1042", nsn: "3110-00-100-0428", fsc: "3110", nomenclature: "BEARING, BALL, ANNULAR", qty: 40, return_by: "2026-11-19", issued: "2026-11-16" },
  { ...base, id: 3, sol_number: "SPE7L3-27-T-0815", nsn: "5310-01-382-1907", fsc: "5310", nomenclature: "NUT, SELF-LOCKING, HEXAGON", qty: 1500, return_by: "2026-12-07", issued: "2026-11-16" },
  { ...base, id: 4, sol_number: "SPE7M5-27-T-0230", nsn: "5330-00-579-9384", fsc: "5330", nomenclature: "O-RING", qty: 250, return_by: "2026-11-17", issued: "2026-11-16" },
];

export function mockChat(): ChatResponse {
  const results: Hit[] = rows.map((r, i) => ({
    ...r,
    score: 1 - i * 0.1,
    reasons: i === 0 ? ["FSC 8455", "due in 7 days"] : ["keyword: bearing", "qty ≥ 100"],
  }));
  return {
    reply: "Here are open RFQs for ball bearings and bushings due in the next two weeks.",
    intent: { keywords: ["bearing", "bushing"], semantic: "ball bearings and bushings", fsc: ["3110", "3120"], nsn: [], dueWithinDays: 14 },
    source: "llm",
    results,
    total: results.length,
  };
}

export function mockRfqs(): RfqsResponse {
  return {
    rows,
    total: rows.length,
    meta: { total: 3986, lastScrapedAt: "2026-11-17T08:00:00Z", issuedDates: ["2026-11-16", "2026-11-17"] },
  };
}
