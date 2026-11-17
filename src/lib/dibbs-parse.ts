import { parse, type HTMLElement } from "node-html-parser";
import type { Rfq } from "./db";

const BASE = "https://www.dibbs.bsm.dla.mil/RFQ/";

const abs = (href: string | undefined): string | null =>
  href ? new URL(href, BASE).toString() : null;

const clean = (s: string) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

function isoDate(s: string): string | null {
  const m = clean(s).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

export function parseRfqGrid(html: string): Rfq[] {
  const root = parse(html);
  const table = root.querySelector("table#ctl00_cph1_grdRfqSearch");
  if (!table) return [];
  const out: Rfq[] = [];
  // Only the grid's own rows: the pager row contains a nested table.
  const trs = table.querySelectorAll("tr").filter((tr) => tr.closest("table") === table);
  for (const tr of trs) {
    const tds = tr.childNodes.filter(
      (n) => (n as HTMLElement).tagName === "TD",
    ) as HTMLElement[];
    if (tds.length !== 9) continue;
    const nsnLink = tds[1].querySelector("a");
    const nsn = clean(nsnLink?.text ?? tds[1].text);
    const solCell = tds[4];
    const links = solCell.querySelectorAll("a");
    const sol = clean(links[0]?.text ?? "");
    if (!nsn || !sol) continue;
    const pdf = links.find((a) => /\.pdf/i.test(a.getAttribute("href") ?? ""));
    const detail = links.find((a) => /rfqrec\.aspx/i.test(a.getAttribute("href") ?? ""));
    const statusSpan = tds[5].querySelector("span span");
    const status = clean(statusSpan?.text ?? tds[5].text.replace(/uote.*$/i, ""));
    // PR cell: "7018634838<br>QTY: 24000"
    const prText = clean(tds[6].structuredText.replace(/\n/g, " "));
    const prm = prText.match(/^(\S+)\s*QTY:\s*([\d,]+)/i);
    out.push({
      id: `${sol}|${nsn}`,
      sol_number: sol,
      nsn,
      fsc: /^\d{4}-/.test(nsn) ? nsn.slice(0, 4) : null,
      nomenclature: clean(tds[2].text) || null,
      tech_docs: clean(tds[3].text) || null,
      status: status || null,
      pr_number: prm ? prm[1] : prText.split(" ")[0] || null,
      qty: prm ? parseInt(prm[2].replace(/,/g, ""), 10) : null,
      issued: isoDate(tds[7].text),
      return_by: isoDate(tds[8].text),
      detail_url: abs(detail?.getAttribute("href")),
      pdf_url: abs(pdf?.getAttribute("href")),
      nsn_url: abs(nsnLink?.getAttribute("href")),
      scraped_at: new Date().toISOString(),
    });
  }
  return out;
}
