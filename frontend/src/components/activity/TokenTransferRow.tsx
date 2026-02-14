import type { BlockscoutTokenTransferItem } from "../../lib/blockscout";
import { relativeTime, truncateAddress } from "../../lib/format";

interface TokenTransferRowProps {
  transfer: BlockscoutTokenTransferItem;
  agentAddress: string;
}

export function TokenTransferRow({ transfer, agentAddress }: TokenTransferRowProps) {
  const isSent = transfer.from.hash.toLowerCase() === agentAddress.toLowerCase();
  const counterparty = isSent ? transfer.to.hash : transfer.from.hash;

  const decimals = parseInt(transfer.total.decimals, 10);
  const raw = parseFloat(transfer.total.value) / 10 ** decimals;
  const valueDisplay = raw < 0.001 && raw > 0 ? "< 0.001" : raw.toFixed(4);

  return (
    <div className="group flex items-center gap-3 border-b border-subtle px-3 py-3 sm:px-4 transition-colors hover:bg-elevated">
      {/* Direction icon */}
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
          isSent ? "bg-rose-500/10 text-rose-500" : "bg-green-500/10 text-green-500"
        }`}
      >
        {isSent ? "\u2191" : "\u2193"}
      </span>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-50">
            {isSent ? "Send" : "Receive"} {transfer.token.symbol}
          </span>
          <span className="text-xs text-zinc-500" style={{ fontFamily: "var(--font-mono)" }}>
            {isSent ? "to" : "from"}{" "}
            <a
              href={`https://basescan.org/address/${counterparty}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 transition-colors hover:text-zinc-400 hover:underline"
            >
              {truncateAddress(counterparty)}
            </a>
          </span>
        </div>
      </div>

      {/* Value */}
      <div className="shrink-0 text-right">
        <span className="text-sm text-zinc-300" style={{ fontFamily: "var(--font-mono)" }}>
          {valueDisplay}
        </span>
        <span className="ml-1 text-xs text-zinc-500">{transfer.token.symbol}</span>
      </div>

      {/* Timestamp */}
      <span className="hidden shrink-0 text-xs text-zinc-500 sm:block">
        {relativeTime(transfer.timestamp)}
      </span>

      {/* External link */}
      <a
        href={`https://basescan.org/tx/${transfer.transaction_hash}`}
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
