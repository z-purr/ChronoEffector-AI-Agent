import { useAgentBalance } from "../../hooks/useAgentBalance";
import { useAgentPnl } from "../../hooks/useAgentPnl";
import { useLimitlessPositions } from "../../hooks/useLimitlessPositions";
import { useSuperfluidStreams } from "../../hooks/useSuperfluid";
import { AssetsCard } from "./AssetsCard";
import { BalanceCard, BalanceCardSkeleton } from "./BalanceCard";
import { PnlCard, PnlCardSkeleton } from "./PnlCard";
import { StreamCard, StreamCardSkeleton } from "./StreamCard";

interface TreasuryGridProps {
  address: `0x${string}`;
}

export function TreasuryGrid({ address }: TreasuryGridProps) {
  const balances = useAgentBalance(address);
  const streams = useSuperfluidStreams(address);
  const limitless = useLimitlessPositions(address);

  const pnl = useAgentPnl(address, {
    usdcBalance: balances.data ? parseFloat(balances.data.usdc) : undefined,
    compoundUsdcBalance: balances.data ? parseFloat(balances.data.compoundUsdc) : undefined,
    alephBalance: balances.data ? parseFloat(balances.data.aleph) : undefined,
    limitlessValue: limitless.data ?? undefined,
  });

  const isLoading = balances.isLoading || streams.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_200px]">
          <StreamCardSkeleton />
          <BalanceCardSkeleton index={0} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_200px]">
          <BalanceCardSkeleton index={1} />
          <PnlCardSkeleton index={2} />
        </div>
      </div>
    );
  }

  const alephRaw = balances.data?.alephRaw;
  const flowRatePerSec = streams.data?.totalFlowRatePerSec ?? 0n;
  const flowRatePerHour = streams.data?.flowRatePerHour ?? 0;

  // hours left = balance / (flowRate * 3600)
  let hoursLeft = Infinity;
  if (alephRaw !== undefined && flowRatePerSec > 0n) {
    hoursLeft = Number(alephRaw) / Number(flowRatePerSec * 3600n);
  }

  return (
    <div className="space-y-4">
      {/* Row 1: ALEPH streaming + ETH */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_200px]">
        <StreamCard
          address={address}
          alephRaw={alephRaw}
          flowRatePerSec={flowRatePerSec}
          flowRatePerHour={flowRatePerHour}
          hoursLeft={hoursLeft}
          activeSince={streams.data?.activeSince}
        />
        <BalanceCard
          label="ETH"
          value={balances.data?.eth ?? "0"}
          accentBorderClass="border-l-slate-400"
          icon={<span className="text-slate-400">&#9670;</span>}
          index={1}
        />
      </div>

      {/* Row 2: Assets + PNL */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_200px]">
        <AssetsCard
          usdc={balances.data?.usdc ?? "0"}
          compoundUsdc={balances.data?.compoundUsdc ?? "0"}
          limitless={limitless.data ?? 0}
          index={2}
        />
        {pnl.data ? <PnlCard data={pnl.data} index={3} /> : <PnlCardSkeleton index={3} />}
      </div>
    </div>
  );
}
