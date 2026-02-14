import { useAgentBalance } from "../../hooks/useAgentBalance";
import { useSuperfluidStreams } from "../../hooks/useSuperfluid";
import { BalanceCard, BalanceCardSkeleton } from "./BalanceCard";
import { StreamCard, StreamCardSkeleton } from "./StreamCard";

interface TreasuryGridProps {
  address: `0x${string}`;
}

export function TreasuryGrid({ address }: TreasuryGridProps) {
  const balances = useAgentBalance(address);
  const streams = useSuperfluidStreams(address);

  const isLoading = balances.isLoading || streams.isLoading;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StreamCardSkeleton />
        <BalanceCardSkeleton index={0} />
        <BalanceCardSkeleton index={1} />
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Hero: StreamCard — spans 2 cols on lg */}
      <StreamCard
        address={address}
        alephRaw={alephRaw}
        flowRatePerSec={flowRatePerSec}
        flowRatePerHour={flowRatePerHour}
        hoursLeft={hoursLeft}
      />

      {/* ETH balance */}
      <BalanceCard
        label="ETH"
        value={balances.data?.eth ?? "0"}
        accentBorderClass="border-l-indigo-400"
        icon={<span className="text-indigo-400">&#9670;</span>}
        index={1}
      />

      {/* USDC balance */}
      <BalanceCard
        label="USDC"
        value={balances.data?.usdc ?? "0"}
        accentBorderClass="border-l-emerald-500"
        icon={<span className="text-emerald-500">&#9679;</span>}
        index={2}
      />
    </div>
  );
}
