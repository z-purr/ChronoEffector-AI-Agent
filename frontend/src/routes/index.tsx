import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { detectAgentLabel } from "../lib/domain";
import { useAgents, type Agent } from "../hooks/useAgents";
import { useAgentStatus, type AgentStatus } from "../hooks/useAgentStatus";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const label = detectAgentLabel();
    if (label) throw redirect({ to: "/agent/$label", params: { label } });
  },
  component: HubPage,
});

// --- Status helpers ---

const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; color: string; dotClass: string }
> = {
  healthy: {
    label: "Healthy",
    color: "#22c55e",
    dotClass: "bg-[#22c55e] shadow-[0_0_6px_#22c55e]",
  },
  warning: {
    label: "Warning",
    color: "#eab308",
    dotClass: "bg-[#eab308] shadow-[0_0_6px_#eab308]",
  },
  inactive: {
    label: "Inactive",
    color: "#a1a1aa",
    dotClass: "bg-[#a1a1aa] shadow-[0_0_6px_#a1a1aa]",
  },
  dead: {
    label: "Critical",
    color: "#ef4444",
    dotClass: "bg-[#ef4444] shadow-[0_0_6px_#ef4444]",
  },
};

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatHoursLeft(h: number): string {
  if (!isFinite(h)) return "Inactive";
  if (h <= 0) return "Depleted";
  if (h < 1) return `${Math.round(h * 60)}m left`;
  if (h < 48) return `${Math.round(h)}h left`;
  return `${Math.round(h / 24)}d left`;
}

// --- AgentCard ---

function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  const { status, hoursLeft, isLoading } = useAgentStatus(agent.owner);
  const cfg = STATUS_CONFIG[status];

  return (
    <Link to="/agent/$label" params={{ label: agent.label }} className="block">
      <Card
        className="animate-card-reveal group cursor-pointer border-[#262626] bg-[#141414] py-5 transition-all duration-200 hover:scale-[1.02] hover:border-[#3f3f46]"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between">
            <CardTitle
              className="text-lg tracking-tight text-[#fafafa]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {agent.label}
              <span className="text-[#a1a1aa]">.basileus-agent.eth</span>
            </CardTitle>

            {isLoading ? (
              <div className="h-5 w-16 animate-skeleton-pulse rounded-full bg-[#262626]" />
            ) : (
              <Badge
                variant="outline"
                className="gap-1.5 border-[#262626] px-2 py-0.5 text-[11px]"
                style={{ color: cfg.color }}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${cfg.dotClass}`}
                />
                {cfg.label}
              </Badge>
            )}
          </div>

          <CardDescription
            className="text-xs text-[#a1a1aa]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {truncateAddress(agent.owner)}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          {isLoading ? (
            <div className="h-4 w-24 animate-skeleton-pulse rounded bg-[#262626]" />
          ) : (
            <span
              className="text-xs text-[#a1a1aa]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {formatHoursLeft(hoursLeft)}
            </span>
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
      className="animate-card-reveal border-[#262626] bg-[#141414] py-5"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-48 animate-skeleton-pulse rounded bg-[#262626]" />
          <div className="h-5 w-16 animate-skeleton-pulse rounded-full bg-[#262626]" />
        </div>
        <div className="h-3.5 w-32 animate-skeleton-pulse rounded bg-[#262626]" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-3.5 w-20 animate-skeleton-pulse rounded bg-[#262626]" />
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
          className="text-sm tracking-wide text-[#a1a1aa]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Autonomous Agent Observatory
        </p>
      </div>

      {/* Grid */}
      {isError ? (
        <p className="text-[#ef4444]">Failed to load agents.</p>
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
          <p
            className="text-lg text-[#a1a1aa]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            No agents registered yet
          </p>
          <p className="mt-1 text-sm text-[#52525b]">
            Agents will appear here once registered on-chain.
          </p>
        </div>
      )}
    </div>
  );
}
