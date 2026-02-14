import type { BlockscoutTx } from "../../lib/blockscout";
import { relativeTime, truncateAddress, formatWeiValue } from "../../lib/format";
import { SUPERFLUID_CFAV1_FORWARDER, L2_REGISTRAR, L2_REGISTRY } from "../../lib/contracts";

interface TransactionRowProps {
  tx: BlockscoutTx;
  agentAddress: string;
}

export function TransactionRow({ tx, agentAddress }: TransactionRowProps) {
  const isSent = tx.from.hash.toLowerCase() === agentAddress.toLowerCase();
  const counterparty = isSent ? tx.to?.hash : tx.from.hash;

  // Token transfer info
  const tokenTransfer = tx.token_transfers?.[0];
  let valueDisplay: string;
  let symbolDisplay: string;

  if (tokenTransfer) {
    const decimals = parseInt(tokenTransfer.total.decimals, 10);
    const raw = parseFloat(tokenTransfer.total.value) / 10 ** decimals;
    valueDisplay = raw < 0.001 && raw > 0 ? "< 0.001" : raw.toFixed(4);
    symbolDisplay = tokenTransfer.token.symbol;
  } else {
    valueDisplay = formatWeiValue(tx.value);
    symbolDisplay = "ETH";
  }

  const toAddr = tx.to?.hash.toLowerCase() ?? "";
  const isSuperfluid = toAddr === SUPERFLUID_CFAV1_FORWARDER.toLowerCase();
  const isRegistrar = toAddr === L2_REGISTRAR.toLowerCase();
  const isRegistry = toAddr === L2_REGISTRY.toLowerCase();

  let methodLabel: string;
  if (isSuperfluid && tx.method === "createFlow") methodLabel = "Start ALEPH stream";
  else if (isSuperfluid && tx.method === "deleteFlow") methodLabel = "Stop ALEPH stream";
  else if (isSuperfluid && tx.method === "updateFlow") methodLabel = "Update ALEPH stream";
  else if (isRegistrar && tx.method === "register") methodLabel = "Register ENS name";
  else if (isRegistry && tx.method === "setContenthash") methodLabel = "Set ENS content hash";
  else methodLabel = tx.method || "Transfer";

  return (
    <div className="group flex items-center gap-3 border-b border-subtle px-3 py-3 sm:px-4 transition-colors hover:bg-elevated">
      {/* Icon */}
      {isSuperfluid ? (
        <img src="/icons/aleph.png" alt="ALEPH" className="h-7 w-7 shrink-0 rounded-md" />
      ) : isRegistrar || isRegistry ? (
        <img src="/icons/ens.jpg" alt="ENS" className="h-7 w-7 shrink-0 rounded-md" />
      ) : (
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
            isSent ? "bg-rose-500/10 text-rose-500" : "bg-green-500/10 text-green-500"
          }`}
        >
          {isSent ? "\u2191" : "\u2193"}
        </span>
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
        {/* Label + context */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-50">{methodLabel}</span>
          {!isSuperfluid && !isRegistrar && !isRegistry && counterparty && (
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
          )}
        </div>
      </div>

      {/* Value */}
      {valueDisplay !== "0" && valueDisplay !== "0.0000" && (
        <div className="shrink-0 text-right">
          <span className="text-sm text-zinc-300" style={{ fontFamily: "var(--font-mono)" }}>
            {valueDisplay}
          </span>
          <span className="ml-1 text-xs text-zinc-500">{symbolDisplay}</span>
        </div>
      )}

      {/* Timestamp */}
      <span className="hidden shrink-0 text-xs text-zinc-500 sm:block">
        {relativeTime(tx.timestamp)}
      </span>

      {/* External link */}
      <a
        href={`https://basescan.org/tx/${tx.hash}`}
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

export function TransactionRowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b border-subtle px-3 py-3 sm:px-4">
      <div className="h-7 w-7 animate-skeleton-pulse rounded-md bg-neutral-800" />
      <div className="flex-1 space-y-1">
        <div className="h-4 w-32 animate-skeleton-pulse rounded bg-neutral-800" />
        <div className="h-3 w-20 animate-skeleton-pulse rounded bg-neutral-800" />
      </div>
      <div className="h-4 w-16 animate-skeleton-pulse rounded bg-neutral-800" />
    </div>
  );
}
