import { Card } from "@/components/ui/card";
import { PieChart, Pie, Cell } from "recharts";

interface AssetsCardProps {
  usdc: string;
  compoundUsdc: string;
  limitless?: number;
  index?: number;
}

const PALETTE = {
  usdc: "#2775ca",
  compound: "#00d395",
  limitless: "#a855f7",
  empty: "#27272a",
};

function fmt(n: number) {
  if (n === 0) return "$0.00";
  if (n < 0.01) return "< $0.01";
  return `$${n.toFixed(2)}`;
}

function pct(value: number, total: number) {
  if (total === 0) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 1) return "< 1%";
  return `${Math.round(p)}%`;
}

export function AssetsCard({ usdc, compoundUsdc, limitless = 0, index = 0 }: AssetsCardProps) {
  const usdcVal = parseFloat(usdc) || 0;
  const compoundVal = parseFloat(compoundUsdc) || 0;
  const limitlessVal = limitless || 0;
  const total = usdcVal + compoundVal + limitlessVal;

  const segments = [
    { name: "USDC", value: usdcVal, color: PALETTE.usdc },
    { name: "Compound USDC", value: compoundVal, color: PALETTE.compound },
    { name: "Limitless", value: limitlessVal, color: PALETTE.limitless },
  ].filter((s) => s.value > 0);

  const isEmpty = segments.length === 0;
  const chartData = isEmpty ? [{ name: "Empty", value: 1, color: PALETTE.empty }] : segments;

  const items = [
    { label: "USDC", sub: "Wallet", value: usdcVal, color: PALETTE.usdc, icon: "/icons/usdc.png" },
    {
      label: "Compound USDC",
      sub: "Lending",
      value: compoundVal,
      color: PALETTE.compound,
      icon: "/icons/compound.png",
    },
    {
      label: "Limitless",
      sub: "Predictions",
      value: limitlessVal,
      color: PALETTE.limitless,
      icon: "/icons/limitless.png",
    },
  ].filter((item) => item.value > 0);

  return (
    <Card
      className="animate-card-reveal relative overflow-hidden border-neutral-800 bg-elevated py-4"
      style={{ animationDelay: `${(index + 1) * 80}ms` }}
    >
      {/* Subtle emerald glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgb(16 185 129 / 0.2), transparent)",
        }}
      />

      <div className="px-5">
        {/* Header */}
        <span
          className="text-[11px] uppercase tracking-widest text-zinc-400"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Assets
        </span>

        {isEmpty ? (
          <div className="mt-3 flex items-center justify-center py-8">
            <span className="text-sm text-zinc-600" style={{ fontFamily: "var(--font-body)" }}>
              No assets
            </span>
          </div>
        ) : (
          /* Mobile: stacked. Desktop: side by side */
          <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
            {/* Donut with total in center */}
            <div className="relative h-[110px] w-[110px] shrink-0">
              <PieChart width={110} height={110}>
                <Pie
                  data={chartData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={34}
                  outerRadius={50}
                  strokeWidth={0}
                  paddingAngle={segments.length > 1 ? 3 : 0}
                  isAnimationActive={false}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
              {/* Center total */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span
                  className="text-base font-medium text-zinc-50"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {fmt(total)}
                </span>
              </div>
            </div>

            {/* Breakdown */}
            <div className="flex w-full flex-1 flex-col gap-3">
              {items.map((item) => {
                const barPct = total > 0 ? (item.value / total) * 100 : 0;
                return (
                  <div key={item.label}>
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <img
                          src={item.icon}
                          alt={item.label}
                          className="h-4 w-4 shrink-0 rounded-full"
                        />
                        <span
                          className="text-sm text-zinc-200"
                          style={{ fontFamily: "var(--font-body)" }}
                        >
                          {item.label}
                        </span>
                        <span
                          className="text-[10px] text-zinc-600"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {pct(item.value, total)}
                        </span>
                      </div>
                      <span
                        className="text-sm font-medium text-zinc-50 tabular-nums"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {fmt(item.value)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 w-full rounded-full bg-neutral-800/60">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${barPct}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
