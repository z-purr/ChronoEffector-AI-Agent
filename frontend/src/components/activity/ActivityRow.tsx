import { useState } from "react";
import type { AgentActivity } from "../../hooks/useActivities";
import { relativeTime } from "../../lib/format";

interface ActivityRowProps {
  activity: AgentActivity;
}

const typeConfig: Record<
  AgentActivity["type"],
  { label: string; colorClass: string; dotClass: string; bgClass: string }
> = {
  heartbeat: {
    label: "Heartbeat",
    colorClass: "text-green-500",
    dotClass: "bg-green-500 shadow-[0_0_6px_#22c55e]",
    bgClass: "bg-green-500/10",
  },
  strategy: {
    label: "Strategy",
    colorClass: "text-amber-500",
    dotClass: "bg-amber-500 shadow-[0_0_6px_#f59e0b]",
    bgClass: "bg-amber-500/10",
  },
  error: {
    label: "Error",
    colorClass: "text-red-500",
    dotClass: "bg-red-500 shadow-[0_0_6px_#ef4444]",
    bgClass: "bg-red-500/10",
  },
};

export function ActivityRow({ activity }: ActivityRowProps) {
  const [expanded, setExpanded] = useState(false);
  const config = typeConfig[activity.type];
  const toolCount = activity.tools?.length ?? 0;
  const txCount = activity.txHashes?.length ?? 0;

  return (
    <div className="group border-b border-subtle px-3 py-3 sm:px-4 transition-colors hover:bg-elevated">
      {/* Main row */}
      <div className="flex items-start gap-3">
        {/* Type badge — dot + glow pattern matching hub page status dots */}
        <span
          className={`mt-0.5 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 ${config.bgClass}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`} />
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide ${config.colorClass}`}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {config.label}
          </span>
        </span>

        {/* Content — click to expand */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="min-w-0 flex-1 text-left"
        >
          <p
            className={`text-sm leading-relaxed text-zinc-300 ${expanded ? "" : "line-clamp-2"}`}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {activity.content}
          </p>
        </button>

        {/* Right side indicators */}
        <div className="flex shrink-0 items-center gap-2.5">
          {/* Tool count */}
          {toolCount > 0 && (
            <span
              className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
              style={{ fontFamily: "var(--font-mono)" }}
              title={activity.tools!.map((t) => t.name).join(", ")}
            >
              {toolCount} tool{toolCount > 1 ? "s" : ""}
            </span>
          )}

          {/* Tx count */}
          {txCount > 0 && (
            <a
              href={`https://basescan.org/tx/${activity.txHashes![0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:text-zinc-50"
              style={{ fontFamily: "var(--font-mono)" }}
              title={activity.txHashes!.join(", ")}
            >
              {txCount} tx{txCount > 1 ? "s" : ""}
            </a>
          )}

          {/* Timestamp */}
          <span className="text-xs text-zinc-500">{relativeTime(activity.timestamp)}</span>
        </div>
      </div>

      {/* Expanded: tool details */}
      {expanded && toolCount > 0 && (
        <div className="mt-2 ml-[42px] space-y-1">
          {activity.tools!.map((tool, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-[11px] text-zinc-500"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <span className="text-zinc-600">&gt;</span>
              <span className="text-zinc-400">{tool.name}</span>
              {tool.txHash && (
                <a
                  href={`https://basescan.org/tx/${tool.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-600 transition-colors hover:text-zinc-400"
                >
                  {tool.txHash.slice(0, 10)}&hellip;
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
