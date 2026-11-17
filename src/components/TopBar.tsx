"use client";

import { useRef } from "react";
import type { RfqMeta } from "@/lib/ui-types";

export type Tab = "find" | "browse";
const TABS: { id: Tab; label: string }[] = [
  { id: "find", label: "Find" },
  { id: "browse", label: "Browse" },
];

function mmdd(d: string) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[1]}-${m[2]}` : d;
}

export function freshness(meta: RfqMeta | null): string {
  if (!meta) return "";
  const dates = [...(meta.issuedDates ?? [])].sort();
  const range =
    dates.length === 0 ? "" : dates.length === 1 ? ` · ISSUED ${mmdd(dates[0])}` : ` · ISSUED ${mmdd(dates[0])} → ${mmdd(dates[dates.length - 1])}`;
  return `${meta.total.toLocaleString("en-US")} RFQS · DIBBS${range}`;
}

export function TopBar({ tab, onTab, meta }: { tab: Tab; onTab: (t: Tab) => void; meta: RfqMeta | null }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: React.KeyboardEvent, i: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onTab(TABS[next].id);
    refs.current[next]?.focus();
  }

  return (
    <header style={{ background: "var(--surface)", borderBottom: "1px solid var(--hairline)" }}>
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-3 px-4 pt-6 pb-0 sm:px-8">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <picture>
            <source srcSet="/logo-white.svg" media="(prefers-color-scheme: dark)" />
            <img src="/logo.svg" alt="" width={28} height={28} />
          </picture>
          <span className="heading text-[20px]">SalesPatriot</span>
          <span className="label hidden sm:inline">Solicitation browser</span>
        </div>
        <p className="label ml-auto" aria-live="polite">
          {freshness(meta)}
        </p>
        <div role="tablist" aria-label="Views" className="flex w-full gap-6">
          {TABS.map((t, i) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => onTab(t.id)}
                onKeyDown={(e) => onKey(e, i)}
                className="pb-3 pt-2 text-[14px]"
                style={{
                  color: active ? "var(--ink)" : "var(--ink-60)",
                  borderBottom: `2px solid ${active ? "var(--blue)" : "transparent"}`,
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
