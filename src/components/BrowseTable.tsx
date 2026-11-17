"use client";

import { useEffect, useState } from "react";
import type { Rfq, RfqMeta, RfqsResponse, SortKey } from "@/lib/ui-types";
import { DueBadge } from "./DueBadge";
import { MOCK, mockRfqs } from "./mock";

const PAGE_SIZE = 50;

export function BrowseTable({ onMeta }: { onMeta?: (m: RfqMeta) => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<SortKey>("return_by");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Rfq[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let data: RfqsResponse;
        if (MOCK) {
          data = mockRfqs();
        } else {
          const params = new URLSearchParams({ q: debounced, sort, dir, page: String(page) });
          const res = await fetch(`/api/rfqs?${params}`);
          if (!res.ok) throw new Error(`Couldn't load RFQs (${res.status}). Refresh to try again.`);
          data = (await res.json()) as RfqsResponse;
        }
        if (cancelled) return;
        setRows(data.rows);
        setTotal(data.total);
        if (data.meta) onMeta?.(data.meta);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load RFQs.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [debounced, sort, dir, page, onMeta]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section aria-label="Browse RFQs">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="browse-q" className="label mb-1 block">
            Search
          </label>
          <input
            id="browse-q"
            className="input"
            placeholder="Words or an NSN, e.g. bearing or 3110-00-100-0428"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="browse-sort" className="label mb-1 block">
            Sort by
          </label>
          <select
            id="browse-sort"
            className="input w-auto pr-8"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setPage(1);
            }}
          >
            <option value="return_by">Due date</option>
            <option value="issued">Issued</option>
            <option value="qty">Qty</option>
          </select>
        </div>
        <button
          type="button"
          className="btn h-10"
          onClick={() => {
            setDir((d) => (d === "asc" ? "desc" : "asc"));
            setPage(1);
          }}
          aria-label={dir === "asc" ? "Ascending; switch to descending" : "Descending; switch to ascending"}
        >
          {dir === "asc" ? "↑ Ascending" : "↓ Descending"}
        </button>
      </div>

      <div className="card mt-4 overflow-x-auto max-[699px]:overflow-visible max-[699px]:border-0 max-[699px]:bg-transparent max-[699px]:[clip-path:none]">
        <table className="rfq-table">
          <thead>
            <tr>
              <th className="label">Solicitation</th>
              <th className="label">NSN</th>
              <th className="label">Item</th>
              <th className="label num">Qty</th>
              <th className="label">Issued</th>
              <th className="label">Due</th>
              <th className="label">PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid="rfq-row">
                <td data-label="Solicitation" className="mono text-[12px]">
                  {r.detail_url ? (
                    <a href={r.detail_url} target="_blank" rel="noopener" style={{ color: "var(--blue)" }}>
                      {r.sol_number}
                    </a>
                  ) : (
                    r.sol_number
                  )}
                </td>
                <td data-label="NSN" className="mono text-[12px]">
                  {r.nsn_url ? (
                    <a href={r.nsn_url} target="_blank" rel="noopener" className="underline decoration-[var(--hairline)] underline-offset-2">
                      {r.nsn}
                    </a>
                  ) : (
                    r.nsn
                  )}
                </td>
                <td data-label="Item">{r.nomenclature}</td>
                <td data-label="Qty" className="mono num text-[12px]">
                  {r.qty?.toLocaleString("en-US") ?? "—"}
                </td>
                <td data-label="Issued" className="mono text-[12px]" style={{ color: "var(--ink-60)" }}>
                  {r.issued ?? "—"}
                </td>
                <td data-label="Due">
                  <DueBadge returnBy={r.return_by} />
                </td>
                <td data-label="PDF">
                  {r.pdf_url ? (
                    <a className="link-action" href={r.pdf_url} target="_blank" rel="noopener">
                      PDF ↗
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !error && rows.length === 0 && (
          <p className="px-4 py-10 text-center" style={{ color: "var(--ink-60)" }}>
            No RFQs match “{debounced}”. Try fewer words or a shorter NSN.
          </p>
        )}
        {error && (
          <p role="alert" className="px-4 py-10 text-center">
            {error}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="label" aria-live="polite">
          {loading ? "Loading…" : `Page ${page} of ${pages} · ${total.toLocaleString("en-US")} results`}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            Prev
          </button>
          <button type="button" className="btn" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
