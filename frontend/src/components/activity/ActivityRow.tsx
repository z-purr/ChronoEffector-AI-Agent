import { useState } from "react";
import type { AgentActivity } from "../../hooks/useActivities";
import type { ToolExecution } from "../../lib/aleph";
import { relativeTime } from "../../lib/format";

interface ActivityRowProps {
  activity: AgentActivity;
  /** Hide the outer border-b when rendered inside a group */
  nested?: boolean;
}

const typeConfig: Record<
  AgentActivity["type"],
  { label: string; colorClass: string; dotClass: string; bgClass: string }
> = {
  inventory: {
    label: "Inventory",
    colorClass: "text-blue-500",
    dotClass: "bg-blue-500 shadow-[0_0_6px_#3b82f6]",
    bgClass: "bg-blue-500/10",
  },
  survival: {
    label: "Survival",
    colorClass: "text-orange-500",
    dotClass: "bg-orange-500 shadow-[0_0_6px_#f97316]",
    bgClass: "bg-orange-500/10",
  },
  strategy: {
    label: "Strategy",
    colorClass: "text-violet-400",
    dotClass: "bg-violet-400 shadow-[0_0_6px_#a78bfa]",
    bgClass: "bg-violet-400/10",
  },
  error: {
    label: "Error",
    colorClass: "text-red-500",
    dotClass: "bg-red-500 shadow-[0_0_6px_#ef4444]",
    bgClass: "bg-red-500/10",
  },
};

function ToolAccordionItem({ tool }: { tool: ToolExecution }) {
  const [open, setOpen] = useState(false);
  const hasDetails = tool.args || tool.result;

  // Strip provider prefix for display (e.g. "CustomActionProvider_get_aleph_info" → "get_aleph_info")
  const displayName = tool.name.replace(/^[A-Za-z]+Provider_/, "");

  return (
    <div className="border-t border-neutral-800/60 first:border-t-0">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 px-2 py-1.5 text-[11px] text-left ${hasDetails ? "cursor-pointer hover:bg-neutral-800/40" : "cursor-default"}`}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {hasDetails && (
          <svg
            className={`h-3 w-3 shrink-0 text-zinc-600 transition-transform ${open ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        )}
        {!hasDetails && <span className="w-3 shrink-0" />}
        <span className="text-zinc-400">{displayName}</span>
        {tool.txHash && (
          <a
            href={`https://basescan.org/tx/${tool.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-zinc-600 transition-colors hover:text-zinc-400"
            onClick={(e) => e.stopPropagation()}
          >
            {tool.txHash.slice(0, 10)}&hellip;
          </a>
        )}
      </button>
      {open && hasDetails && (
        <div className="px-2 pb-2 pl-7 space-y-1.5">
          {tool.args && (
            <div>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                Params
              </span>
              <pre className="mt-0.5 whitespace-pre-wrap text-[10px] text-zinc-600 leading-relaxed">
                {JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}
          {tool.result && (
            <div>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                Return
              </span>
              <pre className="mt-0.5 whitespace-pre-wrap text-[10px] text-zinc-600 leading-relaxed max-h-32 overflow-y-auto">
                {tool.result.length > 300 ? `${tool.result.slice(0, 300)}…` : tool.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ActivityRow({ activity, nested }: ActivityRowProps) {
  const [expanded, setExpanded] = useState(false);
  const config = typeConfig[activity.type];
  const toolCount = activity.tools?.length ?? 0;
  const txCount = activity.txHashes?.length ?? 0;

  return (
    <div
      className={`group ${nested ? "" : "border-b border-subtle"} px-3 py-3 sm:px-4 transition-colors hover:bg-elevated`}
    >
      {/* Main row */}
      <div className="flex items-start gap-3">
        {/* Type badge */}
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
            className={`text-sm leading-relaxed text-zinc-300 ${expanded ? "" : "line-clamp-1"}`}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {activity.summary}
          </p>
        </button>

        {/* Right side indicators */}
        <div className="flex shrink-0 items-center gap-2.5">
          {toolCount > 0 && (
            <span
              className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
              style={{ fontFamily: "var(--font-mono)" }}
              title={activity.tools!.map((t) => t.name).join(", ")}
            >
              {toolCount} tool{toolCount > 1 ? "s" : ""}
            </span>
          )}

          {txCount === 1 && (
            <a
              href={`https://basescan.org/tx/${activity.txHashes![0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:text-zinc-50"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              1 tx
            </a>
          )}
          {txCount > 1 && (
            <div className="flex items-center gap-1">
              {activity.txHashes!.map((hash, i) => (
                <a
                  key={hash}
                  href={`https://basescan.org/tx/${hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:text-zinc-50"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  tx {i + 1}
                </a>
              ))}
            </div>
          )}

          <span className="text-xs text-zinc-500">{relativeTime(activity.timestamp)}</span>
        </div>
      </div>

      {/* Expanded: tool accordion */}
      {expanded && toolCount > 0 && (
        <div className="mt-2 ml-[42px] rounded-lg border border-neutral-800/60 bg-neutral-900/50 overflow-hidden">
          {activity.tools!.map((tool, i) => (
            <ToolAccordionItem key={i} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}
