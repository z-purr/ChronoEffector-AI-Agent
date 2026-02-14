import { useState, useMemo } from "react";
import { useTransactions } from "../../hooks/useTransactions";
import { useTokenTransfers } from "../../hooks/useTokenTransfers";
import { useActivities } from "../../hooks/useActivities";
import { FeedFilters, type FilterValue } from "./FeedFilters";
import { TransactionRow, TransactionRowSkeleton } from "./TransactionRow";
import { TokenTransferRow } from "./TokenTransferRow";
import { ActivityRow } from "./ActivityRow";
import type { BlockscoutTx, BlockscoutTokenTransferItem } from "../../lib/blockscout";
import type { AgentActivity } from "../../hooks/useActivities";

type FeedItem =
  | { kind: "tx"; timestamp: number; data: BlockscoutTx }
  | { kind: "token_transfer"; timestamp: number; data: BlockscoutTokenTransferItem }
  | { kind: "activity"; timestamp: number; data: AgentActivity };

interface ActivityFeedProps {
  address: string;
}

export function ActivityFeed({ address }: ActivityFeedProps) {
  const [filter, setFilter] = useState<FilterValue>("all");

  const txQuery = useTransactions(address);
  const tokenQuery = useTokenTransfers(address);
  const actQuery = useActivities(address);

  const allTxs = useMemo(() => txQuery.data?.pages.flatMap((p) => p.items) ?? [], [txQuery.data]);

  const allTokenTransfers = useMemo(
    () => tokenQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [tokenQuery.data],
  );

  const activities = useMemo(() => actQuery.data ?? [], [actQuery.data]);

  // Collect tx hashes from regular txs so we can deduplicate token transfers
  const txHashes = useMemo(() => new Set(allTxs.map((tx) => tx.hash.toLowerCase())), [allTxs]);

  // Merge + sort
  const feedItems = useMemo(() => {
    const items: FeedItem[] = [];

    if (filter !== "activities") {
      for (const tx of allTxs) {
        items.push({
          kind: "tx",
          timestamp: new Date(tx.timestamp).getTime(),
          data: tx,
        });
      }
      // Only add token transfers whose tx hash isn't already shown as a regular tx
      for (const tt of allTokenTransfers) {
        if (!txHashes.has(tt.transaction_hash.toLowerCase())) {
          items.push({
            kind: "token_transfer",
            timestamp: new Date(tt.timestamp).getTime(),
            data: tt,
          });
        }
      }
    }

    if (filter !== "transactions") {
      for (const act of activities) {
        items.push({
          kind: "activity",
          timestamp: new Date(act.timestamp).getTime(),
          data: act,
        });
      }
    }

    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }, [allTxs, allTokenTransfers, txHashes, activities, filter]);

  const nothingYet = txQuery.isLoading && tokenQuery.isLoading && actQuery.isLoading;
  const stillLoading = txQuery.isLoading || tokenQuery.isLoading || actQuery.isLoading;

  return (
    <section>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2
          className="text-xl font-bold tracking-tight text-zinc-50"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Activity
        </h2>
        <FeedFilters activeFilter={filter} onFilterChange={setFilter} />
      </div>

      {/* Feed */}
      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-surface">
        {nothingYet ? (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <TransactionRowSkeleton key={i} />
            ))}
          </div>
        ) : feedItems.length === 0 && !stillLoading ? (
          <div className="py-12 text-center text-sm text-zinc-500">No activity yet</div>
        ) : (
          <div>
            {feedItems.map((item) =>
              item.kind === "tx" ? (
                <TransactionRow
                  key={`tx-${item.data.hash}`}
                  tx={item.data}
                  agentAddress={address}
                />
              ) : item.kind === "token_transfer" ? (
                <TokenTransferRow
                  key={`tt-${item.data.transaction_hash}-${item.data.log_index}`}
                  transfer={item.data}
                  agentAddress={address}
                />
              ) : (
                <ActivityRow key={`act-${item.data.id}`} activity={item.data} />
              ),
            )}
            {stillLoading && (
              <>
                <TransactionRowSkeleton />
                <TransactionRowSkeleton />
              </>
            )}
          </div>
        )}

        {/* Load more */}
        {(txQuery.hasNextPage || tokenQuery.hasNextPage) && (
          <div className="border-t border-subtle px-4 py-3 text-center">
            <button
              type="button"
              onClick={() => {
                if (txQuery.hasNextPage) txQuery.fetchNextPage();
                if (tokenQuery.hasNextPage) tokenQuery.fetchNextPage();
              }}
              disabled={txQuery.isFetchingNextPage || tokenQuery.isFetchingNextPage}
              className="text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-50 disabled:opacity-50"
            >
              {txQuery.isFetchingNextPage || tokenQuery.isFetchingNextPage
                ? "Loading..."
                : "Load more"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
