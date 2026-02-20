import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Info } from "lucide-react";
import type { PnlData } from "../../hooks/useAgentPnl";

interface PnlCardProps {
  data: PnlData;
  index?: number;
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs === 0) return "$0.00";
  if (abs < 0.01) return n < 0 ? "-< $0.01" : "< $0.01";
  return `${n < 0 ? "-" : ""}$${abs.toFixed(2)}`;
}

function PnlBreakdown({ data, colorClass }: { data: PnlData; colorClass: string }) {
  return (
    <div className="space-y-1.5 text-[11px]" style={{ fontFamily: "var(--font-mono)" }}>
      <div className="flex justify-between text-zinc-400">
        <span>Assets base</span>
        <span>{fmtUsd(data.baseAssetsUsd)}</span>
      </div>
      <div className="flex justify-between text-zinc-400">
        <span>Assets now</span>
        <span>{fmtUsd(data.currentAssetsUsd)}</span>
      </div>
      <div className="flex justify-between text-zinc-400">
        <span>Asset P&L</span>
        <span className={data.assetPnl >= 0 ? "text-emerald-400" : "text-red-400"}>
          {data.assetPnl >= 0 ? "+" : ""}
          {fmtUsd(data.assetPnl)}
        </span>
      </div>
      <div className="border-t border-neutral-700 pt-1.5 flex justify-between text-zinc-400">
        <span>Inference</span>
        <span className="text-red-400">-${data.inferenceCostUsd.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-zinc-400">
        <span>Computing</span>
        <span className="text-red-400">-${data.computingCostUsd.toFixed(2)}</span>
      </div>
      <div className="border-t border-neutral-700 pt-1.5">
        <div className="flex justify-between text-zinc-500">
          <span>{data.totalAlephStreamed.toFixed(2)} ALEPH</span>
          <span>@ ${data.alephUsd.toFixed(4)}</span>
        </div>
      </div>
      <div className="border-t border-neutral-700 pt-1.5 flex justify-between font-medium text-zinc-200">
        <span>Total</span>
        <span className={colorClass}>{fmtUsd(data.pnl)}</span>
      </div>
    </div>
  );
}

export function PnlCard({ data, index = 0 }: PnlCardProps) {
  const [open, setOpen] = useState(false);
  const isPositive = data.pnl >= 0;
  const colorClass = isPositive ? "text-emerald-400" : "text-red-400";
  const glowColor = isPositive ? "rgb(16 185 129 / 0.25)" : "rgb(239 68 68 / 0.25)";
  const borderClass = isPositive ? "border-l-emerald-500" : "border-l-red-500";

  return (
    <Card
      className={`animate-card-reveal relative border-neutral-800 bg-elevated py-8 border-l-4 ${borderClass}`}
      style={{ animationDelay: `${(index + 1) * 80}ms` }}
    >
      {/* Glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${glowColor}, transparent)`,
        }}
      />

      <div className="px-5">
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] uppercase tracking-widest text-zinc-400"
            style={{ fontFamily: "var(--font-body)" }}
          >
            PNL
          </span>

          {/* Mobile: click to expand inline */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="appearance-none md:hidden"
          >
            <Info className="h-3 w-3 cursor-help text-zinc-500 transition-colors active:text-zinc-300" />
          </button>

          {/* Desktop: hover popover */}
          <div className="group relative hidden md:block">
            <Info className="h-3 w-3 cursor-help text-zinc-500 transition-colors group-hover:text-zinc-300" />
            <div className="invisible absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-900 p-3 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
              <PnlBreakdown data={data} colorClass={colorClass} />
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-neutral-700" />
            </div>
          </div>
        </div>

        <p
          className={`mt-3 truncate text-2xl font-medium ${colorClass}`}
          style={{
            fontFamily: "var(--font-mono)",
            textShadow: `0 0 20px ${glowColor}`,
          }}
        >
          {fmtUsd(data.pnl)}
        </p>

        {/* Mobile inline breakdown */}
        {open && (
          <div className="mt-3 border-t border-neutral-700 pt-3 md:hidden">
            <PnlBreakdown data={data} colorClass={colorClass} />
          </div>
        )}
      </div>
    </Card>
  );
}

export function PnlCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <Card
      className="animate-card-reveal border-neutral-800 bg-elevated py-5"
      style={{ animationDelay: `${(index + 1) * 80}ms` }}
    >
      <div className="px-5">
        <div className="h-3.5 w-12 animate-skeleton-pulse rounded bg-neutral-800" />
        <div className="mt-3 h-7 w-24 animate-skeleton-pulse rounded bg-neutral-800" />
      </div>
    </Card>
  );
}
