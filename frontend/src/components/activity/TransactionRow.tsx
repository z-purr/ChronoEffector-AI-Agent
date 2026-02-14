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
