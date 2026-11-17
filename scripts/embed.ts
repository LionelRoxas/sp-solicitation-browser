import { getDb } from "../src/lib/db";
import { embedTexts, toBlob } from "../src/lib/embed";

try {
  process.loadEnvFile(".env.local");
} catch {}

async function main() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.id, r.nomenclature, r.fsc, r.nsn FROM rfqs r
       LEFT JOIN embeddings e ON e.id = r.id WHERE e.id IS NULL`,
    )
    .all() as { id: string; nomenclature: string | null; fsc: string | null; nsn: string }[];
  console.log(`${rows.length} rows need embeddings`);
  const ins = db.prepare("INSERT OR REPLACE INTO embeddings (id, vec) VALUES (?, ?)");
  const CHUNK = 512;
  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const vecs = await embedTexts(chunk.map((r) => `${r.nomenclature ?? ""} | FSC ${r.fsc ?? ""} | NSN ${r.nsn}`));
    db.exec("BEGIN");
    chunk.forEach((r, j) => ins.run(r.id, toBlob(vecs[j])));
    db.exec("COMMIT");
    done += chunk.length;
    console.log(`embedded ${done}/${rows.length}`);
  }
  const total = (db.prepare("SELECT COUNT(*) c FROM embeddings").get() as { c: number }).c;
  console.log(`done: ${done} new, ${total} embeddings total`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
