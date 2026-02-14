import { useState } from "react";
import type { NormalizedTxItem } from "./normalize";
import { FeedItemRow, ItemIcon } from "./FeedItemRow";
import { formatAmount, relativeTime } from "../../lib/format";

export function FeedGroupRow({ items }: { items: NormalizedTxItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const first = items[0];

  const totalRaw = items.reduce((sum, i) => sum + i.rawValue, 0);
  const totalDisplay = totalRaw === 0 ? null : formatAmount(totalRaw);

  return (
    <div className="border-b border-subtle">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="group flex w-full items-center gap-3 px-3 py-3 sm:px-4 transition-colors hover:bg-elevated text-left"
      >
        <ItemIcon icon={first.icon} />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-sm font-medium text-zinc-50">{first.label}</span>
          <span className="flex h-5 items-center rounded-md bg-neutral-800 px-1.5 text-[10px] font-medium text-zinc-400">
            {items.length}
          </span>
          <svg
            className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {totalDisplay != null && (
          <div className="shrink-0 text-right">
            <span className="text-sm text-zinc-300" style={{ fontFamily: "var(--font-mono)" }}>
              {totalDisplay}
            </span>
            {first.symbol && <span className="ml-1 text-xs text-zinc-500">{first.symbol}</span>}
          </div>
        )}

        <span className="hidden shrink-0 text-xs text-zinc-500 sm:block">
          {relativeTime(new Date(first.timestamp).toISOString())}
        </span>
      </button>

      {expanded && (
        <div className="bg-neutral-950/50">
          {items.map((item) => (
            <FeedItemRow key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
