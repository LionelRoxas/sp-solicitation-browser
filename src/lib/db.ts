import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type Rfq = {
  id: string;
  sol_number: string;
  nsn: string;
  fsc: string | null;
  nomenclature: string | null;
  tech_docs: string | null;
  status: string | null;
  pr_number: string | null;
  qty: number | null;
  issued: string | null;
  return_by: string | null;
  detail_url: string | null;
  pdf_url: string | null;
  nsn_url: string | null;
  scraped_at: string | null;
};

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const file = path.resolve(process.env.DB_PATH ?? "data/dibbs.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  migrate();
  return db;
}

export function migrate(): void {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS rfqs (
      id TEXT PRIMARY KEY,
      sol_number TEXT NOT NULL,
      nsn TEXT NOT NULL,
      fsc TEXT,
      nomenclature TEXT,
      tech_docs TEXT,
      status TEXT,
      pr_number TEXT,
      qty INTEGER,
      issued TEXT,
      return_by TEXT,
      detail_url TEXT,
      pdf_url TEXT,
      nsn_url TEXT,
      scraped_at TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS rfqs_fts USING fts5(
      nomenclature, nsn, sol_number, fsc,
      content='rfqs', content_rowid='rowid', tokenize='porter unicode61'
    );
    CREATE TRIGGER IF NOT EXISTS rfqs_ai AFTER INSERT ON rfqs BEGIN
      INSERT INTO rfqs_fts(rowid, nomenclature, nsn, sol_number, fsc)
      VALUES (new.rowid, new.nomenclature, new.nsn, new.sol_number, new.fsc);
    END;
    CREATE TRIGGER IF NOT EXISTS rfqs_ad AFTER DELETE ON rfqs BEGIN
      INSERT INTO rfqs_fts(rfqs_fts, rowid, nomenclature, nsn, sol_number, fsc)
      VALUES ('delete', old.rowid, old.nomenclature, old.nsn, old.sol_number, old.fsc);
    END;
    CREATE TRIGGER IF NOT EXISTS rfqs_au AFTER UPDATE ON rfqs BEGIN
      INSERT INTO rfqs_fts(rfqs_fts, rowid, nomenclature, nsn, sol_number, fsc)
      VALUES ('delete', old.rowid, old.nomenclature, old.nsn, old.sol_number, old.fsc);
      INSERT INTO rfqs_fts(rowid, nomenclature, nsn, sol_number, fsc)
      VALUES (new.rowid, new.nomenclature, new.nsn, new.sol_number, new.fsc);
    END;
    CREATE TABLE IF NOT EXISTS embeddings (id TEXT PRIMARY KEY, vec BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, messages TEXT NOT NULL DEFAULT '[]', updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at TEXT
    );
  `);
}

export function upsertRfqs(rows: Rfq[]): number {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO rfqs (id, sol_number, nsn, fsc, nomenclature, tech_docs, status, pr_number, qty,
      issued, return_by, detail_url, pdf_url, nsn_url, scraped_at)
    VALUES (:id, :sol_number, :nsn, :fsc, :nomenclature, :tech_docs, :status, :pr_number, :qty,
      :issued, :return_by, :detail_url, :pdf_url, :nsn_url, :scraped_at)
    ON CONFLICT(id) DO UPDATE SET
      sol_number=excluded.sol_number, nsn=excluded.nsn, fsc=excluded.fsc,
      nomenclature=excluded.nomenclature, tech_docs=excluded.tech_docs, status=excluded.status,
      pr_number=excluded.pr_number, qty=excluded.qty, issued=excluded.issued,
      return_by=excluded.return_by, detail_url=excluded.detail_url, pdf_url=excluded.pdf_url,
      nsn_url=excluded.nsn_url, scraped_at=excluded.scraped_at
  `);
  d.exec("BEGIN");
  try {
    for (const r of rows) stmt.run({ ...r });
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return rows.length;
}
