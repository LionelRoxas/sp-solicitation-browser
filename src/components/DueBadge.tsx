// Days until an RFQ's return-by date, counted in whole calendar days (local time).
export function daysUntil(returnBy: string | null, now = new Date()): number | null {
  if (!returnBy) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(returnBy);
  if (!m) return null;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function DueBadge({ returnBy }: { returnBy: string | null }) {
  const d = daysUntil(returnBy);
  if (d === null) return <span className="chip chip-quiet">No date</span>;
  let text: string;
  if (d < 0) text = "Closed";
  else if (d === 0) text = "Due today";
  else if (d === 1) text = "Due in 1 day";
  else text = `Due in ${d} days`;
  const urgent = d >= 0 && d <= 7;
  return (
    <span className={urgent ? "chip chip-blue" : "chip chip-quiet"} title={returnBy ?? undefined}>
      {text}
    </span>
  );
}
