import { useState, useMemo } from "react";
import { useTransactions } from "../../hooks/useTransactions";
import { useActivities } from "../../hooks/useActivities";
import { FeedFilters, type FilterValue } from "./FeedFilters";
import { TransactionRow, TransactionRowSkeleton } from "./TransactionRow";
import { ActivityRow } from "./ActivityRow";
import type { BlockscoutTx } from "../../lib/blockscout";
import type { AgentActivity } from "../../hooks/useActivities";

type FeedItem =
  | { kind: "tx"; timestamp: number; data: BlockscoutTx }
  | { kind: "activity"; timestamp: number; data: AgentActivity };

interface ActivityFeedProps {
  address: string;
}

export function ActivityFeed({ address }: ActivityFeedProps) {
  const [filter, setFilter] = useState<FilterValue>("all");

  const txQuery = useTransactions(address);
  const actQuery = useActivities(address);

  const allTxs = useMemo(() => txQuery.data?.pages.flatMap((p) => p.items) ?? [], [txQuery.data]);

  const activities = useMemo(() => actQuery.data ?? [], [actQuery.data]);

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
  }, [allTxs, activities, filter]);

  const nothingYet = txQuery.isLoading && actQuery.isLoading;
  const stillLoading = txQuery.isLoading || actQuery.isLoading;

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
        {txQuery.hasNextPage && (
          <div className="border-t border-subtle px-4 py-3 text-center">
            <button
              type="button"
              onClick={() => txQuery.fetchNextPage()}
              disabled={txQuery.isFetchingNextPage}
              className="text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-50 disabled:opacity-50"
            >
              {txQuery.isFetchingNextPage ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
