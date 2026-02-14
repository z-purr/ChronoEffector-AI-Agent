import type { NormalizedTxItem } from "./normalize";
import { relativeTime, truncateAddress } from "../../lib/format";

function ItemIcon({ icon }: { icon: NormalizedTxItem["icon"] }) {
  if (icon.kind === "img") {
    return <img src={icon.src} alt={icon.alt} className="h-7 w-7 shrink-0 rounded-md" />;
  }
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
        icon.isSent ? "bg-rose-500/10 text-rose-500" : "bg-green-500/10 text-green-500"
      }`}
    >
      {icon.isSent ? "\u2191" : "\u2193"}
    </span>
  );
}

export { ItemIcon };

export function FeedItemRow({ item }: { item: NormalizedTxItem }) {
  return (
    <div className="group flex items-center gap-3 border-b border-subtle px-3 py-3 sm:px-4 transition-colors hover:bg-elevated">
      <ItemIcon icon={item.icon} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-50">{item.label}</span>
          {item.showCounterparty && item.counterparty && (
            <span className="text-xs text-zinc-500" style={{ fontFamily: "var(--font-mono)" }}>
              {item.isSent ? "to" : "from"}{" "}
              <a
                href={`https://basescan.org/address/${item.counterparty}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 transition-colors hover:text-zinc-400 hover:underline"
              >
                {truncateAddress(item.counterparty)}
              </a>
            </span>
          )}
        </div>
      </div>

      {item.valueDisplay != null && (
        <div className="shrink-0 text-right">
          <span className="text-sm text-zinc-300" style={{ fontFamily: "var(--font-mono)" }}>
            {item.valueDisplay}
          </span>
          <span className="ml-1 text-xs text-zinc-500">{item.symbol}</span>
        </div>
      )}

      <span className="hidden shrink-0 text-xs text-zinc-500 sm:block">
        {relativeTime(new Date(item.timestamp).toISOString())}
      </span>

      <a
        href={`https://basescan.org/tx/${item.explorerTxHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-zinc-600 transition-colors hover:text-zinc-400"
        title="View on Basescan"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
    </div>
  );
}
