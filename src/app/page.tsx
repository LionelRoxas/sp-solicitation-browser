"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatResponse, RfqMeta, RfqsResponse } from "@/lib/ui-types";
import { TopBar, type Tab } from "@/components/TopBar";
import { ChatPanel } from "@/components/ChatPanel";
import { ResultCard } from "@/components/ResultCard";
import { BrowseTable } from "@/components/BrowseTable";
import { MOCK, mockRfqs } from "@/components/mock";

export default function Home() {
  const [tab, setTab] = useState<Tab>("find");
  const [meta, setMeta] = useState<RfqMeta | null>(null);
  const [results, setResults] = useState<ChatResponse | null>(null);

  // Load data freshness for the top bar once.
  useEffect(() => {
    if (MOCK) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMeta(mockRfqs().meta);
      return;
    }
    fetch("/api/rfqs?page=1")
      .then((r) => (r.ok ? (r.json() as Promise<RfqsResponse>) : null))
      .then((d) => d?.meta && setMeta(d.meta))
      .catch(() => {});
  }, []);

  const onMeta = useCallback((m: RfqMeta) => setMeta(m), []);

  return (
    <>
      <TopBar tab={tab} onTab={setTab} meta={meta} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-8">
        <div id="panel-find" role="tabpanel" aria-labelledby="tab-find" hidden={tab !== "find"}>
          <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ChatPanel onResults={setResults} />
            <section aria-label="Matches">
              <p className="label mb-3" aria-live="polite">
                Matches · {results ? results.total.toLocaleString("en-US") : 0}
              </p>
              {!results ? (
                <div className="card px-6 py-16" style={{ background: "transparent", borderStyle: "dashed" }}>
                  <p className="heading text-[22px]">Matching RFQs show up here.</p>
                  <p className="mt-2 max-w-[52ch]" style={{ color: "var(--ink-60)" }}>
                    Each match shows the item, NSN, quantity, how many days are left to quote, and why it matched. Open the
                    solicitation on DIBBS or grab the PDF straight from the card.
                  </p>
                </div>
              ) : results.results.length === 0 ? (
                <div className="card px-6 py-12">
                  <p className="heading text-[20px]">No open RFQs match that yet.</p>
                  <p className="mt-2" style={{ color: "var(--ink-60)" }}>
                    Try broader words, a 4-digit FSC, or drop the due-date limit.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {results.results.map((h) => (
                    <ResultCard key={h.id} hit={h} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
        <div id="panel-browse" role="tabpanel" aria-labelledby="tab-browse" hidden={tab !== "browse"}>
          {tab === "browse" && <BrowseTable onMeta={onMeta} />}
        </div>
      </main>
    </>
  );
}
