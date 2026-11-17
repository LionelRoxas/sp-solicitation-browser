import { getDb, type Rfq } from "./db";
import { cosine, embedTexts, fromBlob } from "./embed";

export type Intent = {
  keywords: string[];
  semantic: string;
  fsc: string[];
  nsn: string[];
  dueWithinDays?: number;
  minQty?: number;
  maxQty?: number;
};
export type Hit = Rfq & { score: number; reasons: string[] };

const digits = (s: string) => s.replace(/\D/g, "");
const words = (s: string) => s.match(/[A-Za-z0-9]+/g) ?? [];

/** Build a safe FTS5 MATCH expression, or null if nothing searchable. */
export function ftsQuery(keywords: string[]): string | null {
  const parts: string[] = [];
  for (const k of keywords) {
    const w = words(k).filter((x) => !/^(AND|OR|NOT|NEAR)$/i.test(x));
    if (!w.length) continue;
    if (w.length === 1) parts.push(w[0].length >= 3 ? `"${w[0]}"*` : `"${w[0]}"`);
    else parts.push(`"${w.join(" ")}"`);
  }
  return parts.length ? parts.join(" OR ") : null;
}

type Filters = {
  fsc?: string[];
  nsn?: string[];
  today?: string;
  dueWithinDays?: number;
  minQty?: number;
  maxQty?: number;
};

function where(f: Filters): { sql: string; params: (string | number)[] } {
  const c: string[] = [];
  const p: (string | number)[] = [];
  if (f.fsc?.length) {
    c.push(`r.fsc IN (${f.fsc.map(() => "?").join(",")})`);
    p.push(...f.fsc);
  }
  const nsns = (f.nsn ?? []).map(digits).filter(Boolean);
  if (nsns.length) {
    c.push(`REPLACE(r.nsn,'-','') IN (${nsns.map(() => "?").join(",")})`);
    p.push(...nsns);
  }
  if (f.today) {
    c.push("r.return_by >= ?");
    p.push(f.today);
    if (f.dueWithinDays != null) {
      const d = new Date(f.today + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + f.dueWithinDays);
      c.push("r.return_by <= ?");
      p.push(d.toISOString().slice(0, 10));
    }
  }
  if (f.minQty != null) {
    c.push("r.qty >= ?");
    p.push(f.minQty);
  }
  if (f.maxQty != null) {
    c.push("r.qty <= ?");
    p.push(f.maxQty);
  }
  return { sql: c.length ? " AND " + c.join(" AND ") : "", params: p };
}

export async function hybridSearch(
  intent: Intent,
  opts: { limit?: number; today?: string } = {},
): Promise<Hit[]> {
  const db = getDb();
  const limit = opts.limit ?? 50;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  // NSNs are not a WHERE filter for the search legs: a named NSN is pinned to the top,
  // and keyword/meaning search still runs, so "this NSN or anything similar" works.
  const w = where({ ...intent, nsn: [], today: intent.dueWithinDays != null ? today : opts.today });
  const nsnList = [...new Set((intent.nsn ?? []).map(digits).filter(Boolean))];
  const fscSet = new Set(intent.fsc ?? []);
  const q = ftsQuery(intent.keywords ?? []);
  const semantic = (intent.semantic ?? "").trim();

  const decorate = (r: Rfq, extra: string[], score: number): Hit => {
    const reasons: string[] = [];
    const nom = (r.nomenclature ?? "").toLowerCase();
    for (const k of intent.keywords ?? [])
      if (k && nom.includes(k.toLowerCase())) reasons.push(`keyword: ${k.toLowerCase()}`);
    reasons.push(...extra);
    if (r.fsc && fscSet.has(r.fsc)) reasons.push(`NSN class ${r.fsc}`);
    const d = digits(r.nsn);
    if (nsnList.includes(d)) reasons.push("exact NSN");
    else if (nsnList.some((n) => d.startsWith(n))) reasons.push("NSN prefix");
    return { ...r, score, reasons };
  };

  // Rows whose NSN equals or starts with a named NSN (partial NSNs work too).
  const pinned = nsnList.length
    ? (db
        .prepare(
          `SELECT r.* FROM rfqs r WHERE (${nsnList.map(() => "REPLACE(r.nsn,'-','') LIKE ?").join(" OR ")})
           ORDER BY r.return_by LIMIT ?`,
        )
        .all(...nsnList.map((n) => n + "%"), limit) as Rfq[])
    : [];
  const pinnedHits = pinned.map((r) => decorate(r, [], 1));

  if (!q && !semantic) {
    if (pinnedHits.length) return pinnedHits;
    if (!fscSet.size) return [];
    const rows = db
      .prepare(`SELECT r.* FROM rfqs r WHERE 1=1${w.sql} ORDER BY r.return_by LIMIT ?`)
      .all(...w.params, limit) as Rfq[];
    return rows.map((r) => decorate(r, [], 0));
  }

  const byId = new Map<string, Rfq>();
  const score = new Map<string, number>();
  const semHit = new Map<string, number>();
  const K = 60;

  if (q) {
    const rows = db
      .prepare(
        `SELECT r.* FROM rfqs_fts JOIN rfqs r ON r.rowid = rfqs_fts.rowid
         WHERE rfqs_fts MATCH ?${w.sql} ORDER BY bm25(rfqs_fts) LIMIT 200`,
      )
      .all(q, ...w.params) as Rfq[];
    rows.forEach((r, i) => {
      byId.set(r.id, r);
      score.set(r.id, (score.get(r.id) ?? 0) + 1 / (K + i + 1));
    });
  }

  if (semantic) {
    try {
      const hasEmb = db.prepare("SELECT 1 FROM embeddings LIMIT 1").get();
      if (hasEmb) {
        const [qv] = await embedTexts([semantic]);
        const rows = db
          .prepare(`SELECT r.*, e.vec AS vec FROM rfqs r JOIN embeddings e ON e.id = r.id WHERE 1=1${w.sql}`)
          .all(...w.params) as (Rfq & { vec: Uint8Array })[];
        const scored = rows
          .map((r) => ({ r, c: cosine(qv, fromBlob(r.vec)) }))
          .filter((x) => x.c >= 0.25)
          .sort((a, b) => b.c - a.c)
          .slice(0, 200);
        scored.forEach(({ r, c }, i) => {
          const rfq: Partial<Rfq & { vec: Uint8Array }> = { ...r };
          delete rfq.vec;
          byId.set(r.id, rfq as Rfq);
          score.set(r.id, (score.get(r.id) ?? 0) + 1 / (K + i + 1));
          semHit.set(r.id, c);
        });
      }
    } catch (e) {
      console.error("semantic leg failed, keyword-only:", e instanceof Error ? e.message : e);
    }
  }

  const pinnedIds = new Set(pinned.map((r) => r.id));
  const hits = [...byId.values()]
    .filter((r) => !pinnedIds.has(r.id))
    .map((r) => decorate(r, (semHit.get(r.id) ?? 0) >= 0.35 ? ["similar meaning"] : [], score.get(r.id) ?? 0));
  hits.sort((a, b) => b.score - a.score);
  return [...pinnedHits, ...hits].slice(0, limit);
}

const SORTS = { return_by: "r.return_by", issued: "r.issued", qty: "r.qty" } as const;

export function listRfqs(o: {
  q?: string;
  sort?: keyof typeof SORTS;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}): { rows: Rfq[]; total: number } {
  const db = getDb();
  const col = SORTS[o.sort ?? "return_by"] ?? SORTS.return_by;
  const dir = o.dir === "desc" ? "DESC" : "ASC";
  const pageSize = Math.min(Math.max(o.pageSize ?? 50, 1), 200);
  const page = Math.max(o.page ?? 1, 1);
  const q = (o.q ?? "").trim();
  let from = "rfqs r";
  let cond = "1=1";
  const params: (string | number)[] = [];
  if (q) {
    if (digits(q).length >= 9) {
      // NSN or partial NSN, with or without dashes: prefix match.
      cond = "REPLACE(r.nsn,'-','') LIKE ?";
      params.push(digits(q) + "%");
    } else {
      const m = ftsQuery(words(q));
      if (!m) return { rows: [], total: 0 };
      from = "rfqs r JOIN rfqs_fts ON rfqs_fts.rowid = r.rowid";
      cond = "rfqs_fts MATCH ?";
      params.push(m);
    }
  }
  const total = (db.prepare(`SELECT COUNT(*) c FROM ${from} WHERE ${cond}`).get(...params) as { c: number }).c;
  const rows = db
    .prepare(`SELECT r.* FROM ${from} WHERE ${cond} ORDER BY ${col} ${dir}, r.id LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize) as Rfq[];
  return { rows, total };
}
