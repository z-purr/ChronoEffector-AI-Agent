import { AlertCircle } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActivities } from "../../hooks/useActivities";
import { useBlockscoutFreshness } from "../../hooks/useBlockscoutFreshness";
import { useTokenTransfers } from "../../hooks/useTokenTransfers";
import { useTransactions } from "../../hooks/useTransactions";
import { ActivityGroupRow } from "./ActivityGroupRow";
import { ActivityRow } from "./ActivityRow";
import { FeedFilters } from "./FeedFilters";
import { FeedGroupRow } from "./FeedGroupRow";
import { FeedItemRow } from "./FeedItemRow";
import { groupFeedItems } from "./groupItems";
import { normalizeTokenTransfer, normalizeTx } from "./normalize";
import { TransactionRowSkeleton } from "./TransactionRow";

interface ActivityFeedProps {
  address: string;
}

function FiltersButton({
  hideScams,
  onHideScamsChange,
  hideInference,
  onHideInferenceChange,
}: {
  hideScams: boolean;
  onHideScamsChange: (v: boolean) => void;
  hideInference: boolean;
  onHideInferenceChange: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeCount = [hideScams, hideInference].filter(Boolean).length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
          open ? "bg-neutral-800 text-zinc-50" : "bg-elevated text-zinc-400 hover:text-zinc-300"
        }`}
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Filters
        {activeCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-zinc-50" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1.5 w-56 rounded-xl border border-neutral-800 bg-neutral-900 p-3 shadow-xl">
          <p className="mb-2 text-xs font-medium text-zinc-300">Filters</p>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-elevated select-none">
            <input
              type="checkbox"
              checked={hideScams}
              onChange={(e) => onHideScamsChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-600 bg-neutral-800 accent-zinc-400"
            />
            Hide scam transactions
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-elevated select-none">
            <input
              type="checkbox"
              checked={hideInference}
              onChange={(e) => onHideInferenceChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-600 bg-neutral-800 accent-zinc-400"
            />
            Hide inference payments
          </label>
        </div>
      )}
    </div>
  );
}

export function ActivityFeed({ address }: ActivityFeedProps) {
  const [filter, setFilter] = useQueryState(
    "tab",
    parseAsStringLiteral(["all", "transactions", "activities"] as const).withDefault("all"),
  );
  const [hideScams, setHideScams] = useState(true);
  const [hideInference, setHideInference] = useState(false);

  const txQuery = useTransactions(address);
  const tokenQuery = useTokenTransfers(address);
  const actQuery = useActivities(address);
  const freshness = useBlockscoutFreshness();

  const allTxs = useMemo(() => txQuery.data?.pages.flatMap((p) => p.items) ?? [], [txQuery.data]);
  const allTokenTransfers = useMemo(
    () => tokenQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [tokenQuery.data],
  );
  const activities = useMemo(() => actQuery.data ?? [], [actQuery.data]);

  // Deduplicate token transfers whose tx hash already appears in regular txs
  const txHashes = useMemo(() => new Set(allTxs.map((tx) => tx.hash.toLowerCase())), [allTxs]);

  // Normalize → filter scams → group
  const normalizedItems = useMemo(() => {
    const items = [
      ...allTxs.map((tx) => normalizeTx(tx, address)),
      ...allTokenTransfers
        .filter((tt) => !txHashes.has(tt.transaction_hash.toLowerCase()))
        .map((tt) => normalizeTokenTransfer(tt, address)),
    ];
    return items.filter((i) => (!hideScams || !i.isScam) && (!hideInference || !i.isInference));
  }, [allTxs, allTokenTransfers, txHashes, address, hideScams, hideInference]);

  const displayItems = useMemo(
    () => groupFeedItems(normalizedItems, activities, filter),
    [normalizedItems, activities, filter],
  );

  const nothingYet = txQuery.isLoading && tokenQuery.isLoading && actQuery.isLoading;
  const stillLoading = txQuery.isLoading || tokenQuery.isLoading || actQuery.isLoading;

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2
          className="text-xl font-bold tracking-tight text-zinc-50"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Activity
        </h2>
        <div className="flex items-center gap-2">
          <FeedFilters activeFilter={filter} onFilterChange={setFilter} />
          <FiltersButton
            hideScams={hideScams}
            onHideScamsChange={setHideScams}
            hideInference={hideInference}
            onHideInferenceChange={setHideInference}
          />
        </div>
      </div>

      {freshness.data?.stale && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-yellow-800/50 bg-yellow-950/30 px-3 py-2 text-xs text-yellow-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Blockscout data looks delayed (last block {freshness.data.ageMinutes}min ago). Recent
          transactions might not appear yet.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-surface">
        {nothingYet ? (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <TransactionRowSkeleton key={i} />
            ))}
          </div>
        ) : displayItems.length === 0 && !stillLoading ? (
          <div className="py-12 text-center text-sm text-zinc-500">No activity yet</div>
        ) : (
          <div>
            {displayItems.map((item) =>
              item.kind === "single" ? (
                <FeedItemRow key={item.item.key} item={item.item} />
              ) : item.kind === "group" ? (
                <FeedGroupRow key={item.items[0].key} items={item.items} />
              ) : item.kind === "activityGroup" ? (
                <ActivityGroupRow
                  key={`actg-${item.activities[0].id}`}
                  activities={item.activities}
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
