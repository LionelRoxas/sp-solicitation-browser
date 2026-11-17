import { getDb } from "./db";
import type { Intent } from "./search";

export type Turn = { role: "user" | "assistant"; content: string; intent?: Intent };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

export function getSession(id: string): Turn[] {
  if (!isUuid(id)) throw new Error("invalid session id");
  const row = getDb().prepare("SELECT messages FROM sessions WHERE id = ?").get(id) as
    | { messages: string }
    | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.messages) as Turn[];
  } catch {
    return [];
  }
}

export function appendTurns(id: string, turns: Turn[]): void {
  const all = [...getSession(id), ...turns].slice(-20);
  getDb()
    .prepare(
      `INSERT INTO sessions (id, messages, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at`,
    )
    .run(id, JSON.stringify(all), new Date().toISOString());
}
