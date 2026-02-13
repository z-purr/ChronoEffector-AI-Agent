import { createFileRoute } from "@tanstack/react-router";
import { useAgents } from "../hooks/useAgents";
import { TreasuryGrid } from "../components/treasury/TreasuryGrid";
import { ActivityFeed } from "../components/activity/ActivityFeed";
import { useState, useCallback } from "react";

export const Route = createFileRoute("/agent/$label")({
  component: AgentPage,
});

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [address]);

  return (
    <button
      type="button"
      onClick={copy}
      className="group flex items-center gap-1.5 text-sm text-[#a1a1aa] transition-colors hover:text-[#d4d4d8]"
      style={{ fontFamily: "var(--font-mono)" }}
      title="Copy address"
    >
      <span className="hidden sm:inline">{address}</span>
      <span className="sm:hidden">{truncateAddress(address)}</span>
      {copied ? (
        <span className="text-[#22c55e] text-xs">Copied!</span>
      ) : (
        <svg
          className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

function AgentPage() {
  const { label } = Route.useParams();
  const { data: agents, isLoading, isError } = useAgents();

  const agent = agents?.find((a) => a.label === label);

  // Loading (or data not yet available)
  if (isLoading || (!agents && !isError)) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-10 lg:px-8">
        <div className="mb-8">
          <div className="h-5 w-96 max-w-full animate-skeleton-pulse rounded bg-[#262626]" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={`h-32 animate-skeleton-pulse rounded-xl border border-[#262626] bg-[#141414] ${i === 0 ? "lg:col-span-2" : ""}`}
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Not found
  if (!agent) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-10 lg:px-8">
        <h1
          className="text-2xl font-bold text-[#fafafa]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Agent not found
        </h1>
        <p className="mt-2 text-sm text-[#a1a1aa]">
          No agent registered with label &ldquo;{label}&rdquo;.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-10 lg:px-8">
      {/* Address bar */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <CopyableAddress address={agent.owner} />

        <a
          href={`https://basescan.org/address/${agent.owner}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[#71717a] transition-colors hover:text-[#a1a1aa]"
        >
          Basescan
          <svg
            className="h-3 w-3"
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

      {/* Treasury */}
      <TreasuryGrid address={agent.owner} />

      {/* Activity Feed */}
      <div className="mt-10">
        <ActivityFeed address={agent.owner} />
      </div>
    </div>
  );
}
