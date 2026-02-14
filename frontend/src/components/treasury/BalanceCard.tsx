import { Card } from "@/components/ui/card";
import type { ReactNode } from "react";

interface BalanceCardProps {
  label: string;
  value: string;
  accentBorderClass: string;
  icon?: ReactNode;
  index?: number;
}

export function BalanceCard({
  label,
  value,
  accentBorderClass,
  icon,
  index = 0,
}: BalanceCardProps) {
  // Truncate to 6 decimals for readability
  const parts = value.split(".");
  const display = parts.length === 2 ? `${parts[0]}.${parts[1].slice(0, 6)}` : value;

  return (
    <Card
      className={`animate-card-reveal relative overflow-hidden border-neutral-800 bg-elevated py-5 border-l-4 ${accentBorderClass}`}
      style={{ animationDelay: `${(index + 1) * 80}ms` }}
    >
      <div className="px-5">
        <div className="flex items-center gap-2">
          {icon && <span className="text-base">{icon}</span>}
          <span
            className="text-[11px] uppercase tracking-widest text-zinc-400"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {label}
          </span>
        </div>

        <p
          className="mt-3 truncate text-2xl font-medium text-zinc-50"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {display}
        </p>
      </div>
    </Card>
  );
}

export function BalanceCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <Card
      className="animate-card-reveal border-neutral-800 bg-elevated py-5"
      style={{ animationDelay: `${(index + 1) * 80}ms` }}
    >
      <div className="px-5">
        <div className="h-3.5 w-12 animate-skeleton-pulse rounded bg-neutral-800" />
        <div className="mt-3 h-7 w-32 animate-skeleton-pulse rounded bg-neutral-800" />
      </div>
    </Card>
  );
}
