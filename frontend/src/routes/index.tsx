import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { detectAgentLabel } from "../lib/domain";
import { useAgents, type Agent } from "../hooks/useAgents";
import { useAgentStatus, type AgentStatus } from "../hooks/useAgentStatus";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { truncateAddress } from "../lib/format";

export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => {
    if ("noredirect" in (location.search as Record<string, unknown>)) return;
    const label = detectAgentLabel();
    if (label) throw redirect({ to: "/agent/$label", params: { label } });
  },
  component: HubPage,
});

// --- Status helpers ---

const STATUS_CONFIG: Record<AgentStatus, { label: string; colorClass: string; dotClass: string }> =
  {
    healthy: {
      label: "Active",
      colorClass: "text-green-500",
      dotClass: "bg-green-500 shadow-[0_0_6px_#22c55e]",
    },
    warning: {
      label: "Warning",
      colorClass: "text-yellow-500",
      dotClass: "bg-yellow-500 shadow-[0_0_6px_#eab308]",
    },
    inactive: {
      label: "Inactive",
      colorClass: "text-zinc-400",
      dotClass: "bg-zinc-400 shadow-[0_0_6px_#a1a1aa]",
    },
    dead: {
      label: "Critical",
      colorClass: "text-red-500",
      dotClass: "bg-red-500 shadow-[0_0_6px_#ef4444]",
    },
  };

function formatHoursLeft(h: number): string {
  if (!isFinite(h)) return "Inactive";
  if (h <= 0) return "Depleted";
  if (h < 1) return `${Math.round(h * 60)}m left`;
  if (h < 48) return `${Math.round(h)}h left`;
  return `${Math.round(h / 24)}d left`;
}

function formatActiveSince(ts: number): string {
  const elapsed = Math.floor(Date.now() / 1000) - ts;
  if (elapsed < 60) return "< 1m";
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h`;
  const days = Math.floor(elapsed / 86400);
  const hours = Math.floor((elapsed % 86400) / 3600);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

// --- AgentCard ---

function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  const { status, hoursLeft, activeSince, isLoading } = useAgentStatus(agent.owner);
  const cfg = STATUS_CONFIG[status];

  return (
    <Link to="/agent/$label" params={{ label: agent.label }} className="block">
      <Card
        className="animate-card-reveal group cursor-pointer border-neutral-800 bg-elevated py-5 transition-all duration-200 hover:scale-[1.02] hover:border-zinc-700"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between">
            <CardTitle
              className="text-lg tracking-tight text-zinc-50"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {agent.label}
              <span className="text-zinc-400">.basileus-agent.eth</span>
            </CardTitle>

            {isLoading ? (
              <div className="h-5 w-16 animate-skeleton-pulse rounded-full bg-neutral-800" />
            ) : (
              <Badge
                variant="outline"
                className={`gap-1.5 border-neutral-800 px-2 py-0.5 text-[11px] ${cfg.colorClass}`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${cfg.dotClass}`} />
                {cfg.label}
              </Badge>
            )}
          </div>

          <CardDescription
            className="text-xs text-zinc-400"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {truncateAddress(agent.owner)}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          {isLoading ? (
            <div className="h-4 w-24 animate-skeleton-pulse rounded bg-neutral-800" />
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400" style={{ fontFamily: "var(--font-mono)" }}>
                {formatHoursLeft(hoursLeft)}
              </span>
              {activeSince != null && (
                <span className="text-xs text-zinc-500" style={{ fontFamily: "var(--font-mono)" }}>
                  {formatActiveSince(activeSince)} active
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// --- Skeleton cards ---

function SkeletonCard({ index }: { index: number }) {
  return (
    <Card
      className="animate-card-reveal border-neutral-800 bg-elevated py-5"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-48 animate-skeleton-pulse rounded bg-neutral-800" />
          <div className="h-5 w-16 animate-skeleton-pulse rounded-full bg-neutral-800" />
        </div>
        <div className="h-3.5 w-32 animate-skeleton-pulse rounded bg-neutral-800" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-3.5 w-20 animate-skeleton-pulse rounded bg-neutral-800" />
      </CardContent>
    </Card>
  );
}

// --- Hub Page ---

function HubPage() {
  const { data: agents, isLoading, isError } = useAgents();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-12 lg:px-8">
      {/* Subtitle */}
      <div className="mb-8">
        <p
          className="text-sm tracking-wide text-zinc-400"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Autonomous Agent Observatory
        </p>
      </div>

      {/* Grid */}
      {isError ? (
        <p className="text-red-500">Failed to load agents.</p>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} index={i} />
          ))}
        </div>
      ) : agents && agents.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent, i) => (
            <AgentCard key={agent.owner} agent={agent} index={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg text-zinc-400" style={{ fontFamily: "var(--font-heading)" }}>
            No agents registered yet
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Agents will appear here once registered on-chain.
          </p>
        </div>
      )}
    </div>
  );
}
