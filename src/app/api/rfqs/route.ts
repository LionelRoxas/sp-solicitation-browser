import { z } from "zod";
import { getDb } from "@/lib/db";
import { listRfqs } from "@/lib/search";


const Query = z.object({
  q: z.string().max(200).optional(),
  sort: z.enum(["return_by", "issued", "qty"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
});

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const parsed = Query.safeParse(Object.fromEntries([...sp.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return Response.json({ error: "Invalid query" }, { status: 400 });
  try {
    const { rows, total } = listRfqs({ ...parsed.data, pageSize: 50 });
    const db = getDb();
    const all = (db.prepare("SELECT COUNT(*) c, MAX(scraped_at) last FROM rfqs").get() as {
      c: number;
      last: string | null;
    });
    const issuedDates = (
      db.prepare("SELECT DISTINCT issued FROM rfqs WHERE issued IS NOT NULL ORDER BY issued DESC").all() as {
        issued: string;
      }[]
    ).map((r) => r.issued);
    return Response.json({ rows, total, meta: { total: all.c, lastScrapedAt: all.last, issuedDates } });
  } catch (e) {
    console.error("rfqs error:", e);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
