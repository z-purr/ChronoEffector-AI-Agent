import { Card } from "@/components/ui/card";
import { useLiveAlephBalance } from "../../hooks/useSuperfluid";

interface StreamCardProps {
  address: `0x${string}`;
  alephRaw: bigint | undefined;
  flowRatePerSec: bigint | undefined;
  flowRatePerHour: number;
  hoursLeft: number;
}

function hoursLeftLabel(h: number): { text: string; colorClass: string } {
  if (!isFinite(h)) return { text: "Inactive", colorClass: "text-zinc-400" };
  if (h <= 0) return { text: "Depleted", colorClass: "text-red-500" };
  if (h < 2) return { text: `${Math.round(h * 60)}m remaining`, colorClass: "text-red-500" };
  if (h < 24) return { text: `${Math.round(h)}h remaining`, colorClass: "text-yellow-500" };
  if (h < 48) return { text: `${Math.round(h)}h remaining`, colorClass: "text-green-500" };
  return { text: `${Math.round(h / 24)}d remaining`, colorClass: "text-green-500" };
}

export function StreamCard({
  address,
  alephRaw,
  flowRatePerSec,
  flowRatePerHour,
  hoursLeft,
}: StreamCardProps) {
  const { intRef, decRef } = useLiveAlephBalance(alephRaw, flowRatePerSec, 6);

  const hlInfo = hoursLeftLabel(hoursLeft);
  const rateDisplay =
    flowRatePerHour > 0 ? (flowRatePerHour < 0.01 ? "< 0.01" : flowRatePerHour.toFixed(2)) : "0";

  return (
    <Card
      className="animate-card-reveal relative col-span-1 overflow-hidden border-neutral-800 bg-elevated py-6 lg:col-span-2"
      style={{ animationDelay: "0ms" }}
    >
      {/* Ambient amber glow at top */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgb(245 158 11 / 0.25), transparent)",
        }}
      />

      <div className="px-6">
        {/* Label */}
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] uppercase tracking-widest text-zinc-400"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ALEPH Balance &bull; Streaming
          </span>
          <a
            href={`https://app.superfluid.org/?view=${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-zinc-600 transition-colors hover:text-zinc-400"
          >
            Superfluid
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

        {/* Live-ticking balance */}
        <p
          className="mt-4 text-3xl font-medium leading-none text-zinc-50 md:text-4xl"
          style={{
            fontFamily: "var(--font-mono)",
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 0 20px rgb(245 158 11 / 0.3), 0 0 40px rgb(245 158 11 / 0.1)",
          }}
        >
          <span ref={intRef}>0</span>
          <span className="text-zinc-400">.</span>
          <span ref={decRef} className="text-zinc-300">
            000000
          </span>
        </p>

        {/* Flow rate + hours left */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span
            className="flex items-center gap-1.5 text-sm text-zinc-400"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <span className="text-amber-500">&darr;</span>
            {rateDisplay} ALEPH/hr
          </span>

          <span
            className={`text-sm font-medium ${hlInfo.colorClass}`}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {hlInfo.text}
          </span>
        </div>
      </div>
    </Card>
  );
}

export function StreamCardSkeleton() {
  return (
    <Card
      className="animate-card-reveal border-neutral-800 bg-elevated py-6 lg:col-span-2"
      style={{ animationDelay: "0ms" }}
    >
      <div className="px-6">
        <div className="h-3.5 w-40 animate-skeleton-pulse rounded bg-neutral-800" />
        <div className="mt-4 h-10 w-64 animate-skeleton-pulse rounded bg-neutral-800" />
        <div className="mt-4 flex gap-4">
          <div className="h-4 w-28 animate-skeleton-pulse rounded bg-neutral-800" />
          <div className="h-4 w-20 animate-skeleton-pulse rounded bg-neutral-800" />
        </div>
      </div>
    </Card>
  );
}
