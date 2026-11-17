import crypto from "node:crypto";
import OpenAI from "openai";
import { getDb } from "./db";

const MODEL = "text-embedding-3-small";
const BATCH = 256;

export function toBlob(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

export function fromBlob(b: Uint8Array): Float32Array {
  const copy = new Uint8Array(b).buffer;
  return new Float32Array(copy);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const key = (t: string) => "emb:" + crypto.createHash("sha1").update(t).digest("hex");

export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const db = getDb();
  const get = db.prepare("SELECT value FROM cache WHERE key = ?");
  const put = db.prepare("INSERT OR REPLACE INTO cache (key, value, created_at) VALUES (?, ?, ?)");
  const out: (Float32Array | null)[] = texts.map((t) => {
    const row = get.get(key(t)) as { value: string } | undefined;
    return row ? fromBlob(Buffer.from(row.value, "base64")) : null;
  });
  const missing = out.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (missing.length) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    for (let s = 0; s < missing.length; s += BATCH) {
      const idx = missing.slice(s, s + BATCH);
      const res = await client.embeddings.create({ model: MODEL, input: idx.map((i) => texts[i]) });
      res.data.forEach((d, j) => {
        const v = Float32Array.from(d.embedding);
        out[idx[j]] = v;
        put.run(key(texts[idx[j]]), Buffer.from(toBlob(v)).toString("base64"), new Date().toISOString());
      });
    }
  }
  return out as Float32Array[];
}
