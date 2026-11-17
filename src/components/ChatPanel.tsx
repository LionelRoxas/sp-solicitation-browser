"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatResponse, Intent } from "@/lib/ui-types";
import { MOCK, mockChat } from "./mock";

const SESSION_KEY = "sp-session-id";
const EXAMPLES = [
  "Ball bearings and bushings, due in 2 weeks",
  "Hex cap screws, nuts and washers (FSC 5305, 5310)",
  "Gaskets and O-rings, qty over 100",
];

type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; intent: Intent | null; source: string }
  | { role: "error"; text: string };

function newSessionId(): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {}
  return id;
}

function loadSessionId(): string {
  try {
    const v = localStorage.getItem(SESSION_KEY);
    if (v) return v;
  } catch {}
  return newSessionId();
}

function IntentChips({ intent, source }: { intent: Intent | null; source: string }) {
  const chips: string[] = [];
  if (intent) {
    intent.keywords?.forEach((k) => chips.push(k));
    intent.fsc?.forEach((f) => chips.push(`FSC ${f}`));
    intent.nsn?.forEach((n) => chips.push(`NSN ${n}`));
    if (intent.dueWithinDays != null) chips.push(`due ≤ ${intent.dueWithinDays}d`);
    if (intent.minQty != null && intent.maxQty != null) chips.push(`qty ${intent.minQty}–${intent.maxQty}`);
    else if (intent.minQty != null) chips.push(`qty ≥ ${intent.minQty}`);
    else if (intent.maxQty != null) chips.push(`qty ≤ ${intent.maxQty}`);
  }
  if (chips.length === 0 && source !== "fallback") return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="What I searched for">
      {chips.map((c) => (
        <span key={c} className="chip">
          {c}
        </span>
      ))}
      {source === "fallback" && <span className="label ml-1">keyword mode</span>}
    </div>
  );
}

export function ChatPanel({ onResults }: { onResults: (r: ChatResponse | null) => void }) {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // localStorage is only available on the client, after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionId(loadSessionId());
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, loading]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: message }]);
    setLoading(true);
    try {
      let data: ChatResponse;
      if (MOCK) {
        await new Promise((r) => setTimeout(r, 400));
        data = mockChat();
      } else {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId || loadSessionId(), message }),
        });
        if (!res.ok) throw new Error(`Search failed (${res.status}). Try again.`);
        data = (await res.json()) as ChatResponse;
      }
      setMessages((m) => [...m, { role: "assistant", text: data.reply, intent: data.intent, source: data.source }]);
      onResults(data);
    } catch (e) {
      setMessages((m) => [...m, { role: "error", text: e instanceof Error ? e.message : "Search failed. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setSessionId(newSessionId());
    setMessages([]);
    setInput("");
    onResults(null);
  }

  return (
    <section className="card flex min-h-[520px] flex-col" aria-label="Chat">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="label">Describe what you supply</span>
        <button type="button" className="btn h-7 px-2 text-[12px]" onClick={reset} disabled={loading}>
          New search
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {messages.length === 0 ? (
          <div className="pt-6">
            <h2 className="heading text-[34px]">What do you supply?</h2>
            <p className="mt-2 max-w-[44ch]" style={{ color: "var(--ink-60)" }}>
              Describe your parts in plain words. I&apos;ll match them against today&apos;s open DIBBS RFQs.
            </p>
            <div className="mt-6 flex flex-col items-start gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="btn text-left" data-testid="example-chip" onClick={() => send(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <li key={i} className={m.role === "user" ? "self-end max-w-[85%]" : "max-w-[92%]"}>
                {m.role === "user" ? (
                  <div className="px-3 py-2" style={{ background: "var(--muted)", border: "1px solid var(--hairline)", borderRadius: 2 }}>
                    {m.text}
                  </div>
                ) : m.role === "error" ? (
                  <p role="alert" style={{ color: "var(--ink)" }}>
                    <span className="label mr-2" style={{ color: "var(--blue)" }}>Error</span>
                    {m.text}
                  </p>
                ) : (
                  <div>
                    <p>{m.text}</p>
                    <IntentChips intent={m.intent} source={m.source} />
                  </div>
                )}
              </li>
            ))}
            {loading && (
              <li className="label flex items-center gap-2" aria-live="polite">
                <span className="loading-dot inline-block h-1.5 w-1.5" style={{ background: "var(--blue)" }} />
                Searching RFQs
              </li>
            )}
          </ol>
        )}
      </div>

      <form
        className="flex gap-2 p-3"
        style={{ borderTop: "1px solid var(--hairline)" }}
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Describe what you supply
        </label>
        <input
          id="chat-input"
          className="input"
          placeholder="e.g. Stainless hex bolts, FSC 5305"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary h-10" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
