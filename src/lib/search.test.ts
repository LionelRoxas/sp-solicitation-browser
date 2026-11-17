import { describe, it, expect, vi, beforeAll } from "vitest";

vi.hoisted(() => {
  process.env.DB_PATH = require("node:path").join(require("node:os").tmpdir(), `search-${Date.now()}.db`);
});
const embedMock = vi.hoisted(() => vi.fn());
vi.mock("./embed", async (orig) => ({ ...(await orig<typeof import("./embed")>()), embedTexts: embedMock }));

import { getDb, upsertRfqs, type Rfq } from "./db";
import { toBlob } from "./embed";
import { hybridSearch, ftsQuery, listRfqs } from "./search";

const mk = (i: number, nomen: string, nsn: string, ret: string, qty = 10): Rfq => ({
  id: `S${i}|${nsn}|P${i}`, sol_number: `S${i}`, nsn, fsc: nsn.slice(0, 4), nomenclature: nomen,
  tech_docs: null, status: "Open", pr_number: `P${i}`, qty, issued: "2026-11-01", return_by: ret,
  detail_url: null, pdf_url: null, nsn_url: null, scraped_at: null,
});

beforeAll(() => {
  upsertRfqs([
    mk(1, "BEARING, BALL", "3110-01-111-1111", "2026-11-20"),
    mk(2, "SCREW, CAP", "5305-01-222-2222", "2026-12-30"),
    mk(3, "BUSHING, SLEEVE", "3120-01-333-3333", "2026-11-25"),
  ]);
  const ins = getDb().prepare("INSERT INTO embeddings (id, vec) VALUES (?, ?)");
  ins.run("S1|3110-01-111-1111|P1", toBlob(new Float32Array([0.6, 0.8])));
  ins.run("S2|5305-01-222-2222|P2", toBlob(new Float32Array([0, 1])));
  ins.run("S3|3120-01-333-3333|P3", toBlob(new Float32Array([1, 0])));
});

const base = { keywords: [], semantic: "", fsc: [], nsn: [] };

describe("search", () => {
  it("keyword hit with reasons", async () => {
    embedMock.mockRejectedValue(new Error("no"));
    const h = await hybridSearch({ ...base, keywords: ["bearing"] });
    expect(h[0].nsn).toBe("3110-01-111-1111");
    expect(h[0].reasons).toContain("keyword: bearing");
  });
  it("fsc filter and exact NSN with dashes or digits", async () => {
    expect((await hybridSearch({ ...base, fsc: ["5305"] })).map((h) => h.fsc)).toEqual(["5305"]);
    const a = await hybridSearch({ ...base, nsn: ["3110-01-111-1111"] });
    const b = await hybridSearch({ ...base, nsn: ["3110011111111"] });
    expect(a.map((h) => h.id)).toEqual(b.map((h) => h.id));
    expect(a[0].reasons).toContain("exact NSN");
  });
  it("dueWithinDays filter", async () => {
    const h = await hybridSearch({ ...base, fsc: ["5305", "3110"], dueWithinDays: 7 }, { today: "2026-11-17" });
    expect(h.map((x) => x.fsc)).toEqual(["3110"]);
  });
  it("RRF puts items in both legs first", async () => {
    embedMock.mockResolvedValue([new Float32Array([1, 0])]);
    // keyword matches BEARING only; semantic ranks BUSHING first, BEARING second
    const h = await hybridSearch({ ...base, keywords: ["bearing"], semantic: "x" });
    expect(h[0].nsn).toBe("3110-01-111-1111");
    expect(h.map((x) => x.nsn)).toContain("3120-01-333-3333");
    expect(h[0].reasons).toContain("similar meaning");
  });
  it("hostile query text does not throw", async () => {
    embedMock.mockRejectedValue(new Error("no"));
    for (const k of ['"', "NEAR(", "-", "a OR", "*", "bear\"ing"]) {
      await expect(hybridSearch({ ...base, keywords: [k] })).resolves.toBeDefined();
      expect(() => listRfqs({ q: k })).not.toThrow();
    }
    expect(ftsQuery(["NEAR("])).toBeNull();
  });
  it("falls back to keyword-only when OpenAI fails", async () => {
    embedMock.mockRejectedValue(new Error("down"));
    const h = await hybridSearch({ ...base, keywords: ["screw"], semantic: "fasteners" });
    expect(h.map((x) => x.nsn)).toEqual(["5305-01-222-2222"]);
  });
});
