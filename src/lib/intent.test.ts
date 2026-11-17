import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.DB_PATH = require("node:path").join(require("node:os").tmpdir(), `intent-${Date.now()}.db`);
});
const create = vi.hoisted(() => vi.fn());
vi.mock("groq-sdk", () => ({ default: class { chat = { completions: { create } }; } }));

import { parseIntent } from "./intent";

const ok = (o: unknown) => ({ choices: [{ message: { content: typeof o === "string" ? o : JSON.stringify(o) } }] });

describe("parseIntent", () => {
  it("parses valid JSON", async () => {
    create.mockResolvedValueOnce(ok({ reply: "Looking for bearings.", keywords: ["BEARING"], semantic: "ball bearings", fsc: ["3110"], nsn: [], dueWithinDays: 14, minQty: null }));
    const r = await parseIntent([], "ball bearings due in 2 weeks");
    expect(r.source).toBe("llm");
    expect(r.intent).toMatchObject({ keywords: ["BEARING"], fsc: ["3110"], dueWithinDays: 14 });
    expect(r.intent.minQty).toBeUndefined();
  });
  it("falls back on invalid JSON", async () => {
    create.mockResolvedValueOnce(ok("not json"));
    const r = await parseIntent([], "hex cap screws please");
    expect(r.source).toBe("fallback");
    expect(r.intent.keywords).toEqual(expect.arrayContaining(["hex", "cap", "screws"]));
    expect(r.reply).toBe("Searching for: hex cap screws please");
  });
  it("strips bad FSC values", async () => {
    create.mockResolvedValueOnce(ok({ reply: "x", keywords: [], semantic: "s", fsc: ["53", "5305", "ABCD", "53051"], nsn: [] }));
    expect((await parseIntent([], "fsc test one")).intent.fsc).toEqual(["5305"]);
  });
  it("caches so groq is not called twice", async () => {
    create.mockClear();
    create.mockResolvedValue(ok({ reply: "r", keywords: ["GASKET"], semantic: "g", fsc: [], nsn: [] }));
    await parseIntent([], "gaskets cache");
    await parseIntent([], "gaskets cache");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
