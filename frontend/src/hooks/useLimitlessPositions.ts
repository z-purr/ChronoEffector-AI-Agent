import { useQuery } from "@tanstack/react-query";

const LIMITLESS_API = "https://api.allorigins.win/raw?url=https://api.limitless.exchange";
const SHARES_DECIMALS = 6;

function fromAtomic(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  return Number(raw) / 10 ** SHARES_DECIMALS;
}

interface ClobPosition {
  positions: {
    yes: { marketValue: string };
    no: { marketValue: string };
  };
}

interface AmmPosition {
  collateralAmount: string;
}

interface PositionsResponse {
  clob: ClobPosition[];
  amm: AmmPosition[];
}

export function useLimitlessPositions(address: `0x${string}` | undefined) {
  return useQuery({
    queryKey: ["limitless-positions", address],
    queryFn: async (): Promise<number> => {
      if (!address) throw new Error("No address");
      const res = await fetch(`${LIMITLESS_API}/portfolio/${address}/positions`);
      if (!res.ok) return 0;
      const data: PositionsResponse = await res.json();

      let total = 0;

      for (const p of data.clob ?? []) {
        total += fromAtomic(p.positions?.yes?.marketValue);
        total += fromAtomic(p.positions?.no?.marketValue);
      }

      for (const p of data.amm ?? []) {
        total += fromAtomic(p.collateralAmount);
      }

      return total;
    },
    enabled: !!address,
    refetchInterval: 30_000,
  });
}
