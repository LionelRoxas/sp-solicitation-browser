import type { Hit } from "@/lib/ui-types";
import { DueBadge } from "./DueBadge";

export function ResultCard({ hit }: { hit: Hit }) {
  return (
    <article className="card p-4" data-testid="result-card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="heading text-[17px]">{hit.nomenclature}</h3>
        <DueBadge returnBy={hit.return_by} />
      </div>
      <div className="mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: "var(--ink-60)" }}>
        <span>
          NSN{" "}
          {hit.nsn_url ? (
            <a href={hit.nsn_url} target="_blank" rel="noopener" className="underline decoration-[var(--hairline)] underline-offset-2" style={{ color: "var(--ink)" }}>
              {hit.nsn}
            </a>
          ) : (
            <span style={{ color: "var(--ink)" }}>{hit.nsn}</span>
          )}
        </span>
        <span>
          SOL <span style={{ color: "var(--ink)" }}>{hit.sol_number}</span>
        </span>
        <span>
          QTY <span style={{ color: "var(--ink)" }}>{hit.qty?.toLocaleString("en-US") ?? "—"}</span>
        </span>
      </div>
      {hit.reasons?.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Why it matched">
          {hit.reasons.map((r) => (
            <li key={r} className="chip">
              {r}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-4">
        {hit.detail_url && (
          <a className="link-action" href={hit.detail_url} target="_blank" rel="noopener">
            Open on DIBBS ↗
          </a>
        )}
        {hit.pdf_url && (
          <a className="link-action" href={hit.pdf_url} target="_blank" rel="noopener">
            PDF ↗
          </a>
        )}
      </div>
    </article>
  );
}
