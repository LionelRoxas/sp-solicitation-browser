import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRfqGrid } from "./dibbs-parse";

const html = readFileSync(join(__dirname, "__fixtures__", "rfqrecs.html"), "utf8");

describe("parseRfqGrid", () => {
  const rows = parseRfqGrid(html);

  it("parses 50 rows", () => {
    expect(rows).toHaveLength(50);
  });

  it("parses the first row", () => {
    expect(rows[0]).toMatchObject({
      id: "SPE1C1-27-Q-0127|8455-01-145-6344",
      sol_number: "SPE1C1-27-Q-0127",
      nsn: "8455-01-145-6344",
      fsc: "8455",
      nomenclature: "SERVICE RIBBON, AWAR",
      status: "Open",
      pr_number: "7018634838",
      qty: 24000,
      issued: "2026-11-17",
      return_by: "2026-11-24",
      detail_url: "https://www.dibbs.bsm.dla.mil/rfq/rfqrec.aspx?sn=SPE1C127Q0127",
      pdf_url: "https://dibbs2.bsm.dla.mil/Downloads/RFQ/7/SPE1C127Q0127.PDF",
    });
    expect(rows[0].nsn_url).toContain("RFQNsn.aspx?value=8455011456344");
  });

  it("fills required fields on every row", () => {
    for (const r of rows) {
      expect(r.sol_number).toBeTruthy();
      expect(r.nsn).toBeTruthy();
      expect(r.issued).toMatch(/^\d{4}-\d\d-\d\d$/);
      expect(r.return_by).toMatch(/^\d{4}-\d\d-\d\d$/);
    }
  });
});
