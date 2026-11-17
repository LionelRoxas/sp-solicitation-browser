import crypto from "node:crypto";
import Groq from "groq-sdk";
import { z } from "zod";
import { getDb } from "./db";
import type { Intent } from "./search";

export type HistoryTurn = { role: "user" | "assistant"; content: string; intent?: Intent };
export type ParsedIntent = { intent: Intent; reply: string; source: "llm" | "fallback" };

const SYSTEM = `You turn a defense vendor's description of what they supply into a DIBBS RFQ search intent.
Return ONLY JSON: {"reply": string, "keywords": string[], "semantic": string, "fsc": string[], "nsn": string[], "dueWithinDays": number|null, "minQty": number|null, "maxQty": number|null}.
- reply: one short friendly sentence describing what you searched for. Never claim a result count.
- keywords: short nouns as DIBBS writes them (uppercase is fine, e.g. BEARING, SCREW, CAP). DIBBS item names are truncated to about 20 characters and written "NOUN, MODIFIER".
- semantic: a plain-English phrase describing the items.
- fsc: 4-digit Federal Supply Classes only when the user names a class or clearly implies one, e.g. 5305 screws, 5310 nuts/washers, 3110 bearings, 5330 seals/gaskets, 5340 hardware, 8415 clothing special purpose. Empty array if unsure.
- nsn: any NSNs the user typed.
- dueWithinDays, minQty, maxQty: numbers or null.
Merge the conversation: a follow-up like "also gaskets" ADDS to the previous intent; "drop textiles" REMOVES from it. The previous intent is given in the context; always return the full merged intent.`;

const num = z.preprocess((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined), z.number().optional());
const strArr = z.preprocess((v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []), z.array(z.string()));
const Schema = z.object({
  reply: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string()),
  keywords: strArr,
  semantic: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string()),
  fsc: strArr,
  nsn: strArr,
  dueWithinDays: num,
  minQty: num,
  maxQty: num,
});

const STOP = new Set(
  "the and for with are our you your that this from have has any all can need want also like just please some what when where which who whom how about into over under there their them they will would could should been being was were but not out get got due next week weeks day days stock supply sell find show".split(" "),
);

function fallback(message: string): ParsedIntent {
  const keywords = [...new Set((message.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)))].slice(0, 12);
  return {
    intent: { keywords, semantic: message, fsc: [], nsn: [] },
    reply: `Searching for: ${message}`,
    source: "fallback",
  };
}

export async function parseIntent(history: HistoryTurn[], message: string): Promise<ParsedIntent> {
  const recent = history.slice(-6);
  const key =
    "intent:" +
    crypto
      .createHash("sha1")
      .update(JSON.stringify(recent) + "\n" + message)
      .digest("hex");
  const db = getDb();
  const hit = db.prepare("SELECT value FROM cache WHERE key = ?").get(key) as { value: string } | undefined;
  if (hit) {
    try {
      return JSON.parse(hit.value) as ParsedIntent;
    } catch {}
  }
  try {
    const prev = [...recent].reverse().find((t) => t.role === "assistant" && t.intent)?.intent;
    const messages = [
      { role: "system" as const, content: SYSTEM },
      ...recent.map((t) => ({ role: t.role, content: t.content })),
      {
        role: "user" as const,
        content: (prev ? `Previous intent: ${JSON.stringify(prev)}\n\n` : "") + message,
      },
    ];
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const res = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages,
    });
    const raw = JSON.parse(res.choices[0]?.message?.content ?? "");
    const p = Schema.parse(raw);
    const out: ParsedIntent = {
      intent: {
        keywords: p.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 12),
        semantic: p.semantic,
        fsc: p.fsc.map((f) => f.trim()).filter((f) => /^\d{4}$/.test(f)).slice(0, 10),
        nsn: p.nsn,
        dueWithinDays: p.dueWithinDays,
        minQty: p.minQty,
        maxQty: p.maxQty,
      },
      reply: p.reply || `Searching for: ${message}`,
      source: "llm",
    };
    db.prepare("INSERT OR REPLACE INTO cache (key, value, created_at) VALUES (?, ?, ?)").run(
      key,
      JSON.stringify(out),
      new Date().toISOString(),
    );
    return out;
  } catch (e) {
    console.error("intent LLM failed, using fallback:", e instanceof Error ? e.message : e);
    return fallback(message);
  }
}
