import { useQuery } from "@tanstack/react-query";
import { getTokenTransfers } from "../lib/blockscout";
import { BLOCKRUN_X402, USDC } from "../lib/contracts";
import { useSuperfluidStreams } from "./useSuperfluid";
import { useAlephPrice } from "./useAlephPrice";

export interface PnlData {
  inferenceCostUsd: number;
  computingCostUsd: number;
  totalAlephStreamed: number;
  alephUsd: number;
  baseAssetsUsd: number;
  currentAssetsUsd: number;
  assetPnl: number;
  pnl: number;
}

interface TransferAnalysis {
  inferenceCost: number;
  initialDeposit: number;
}

function useTransferAnalysis(address: `0x${string}` | undefined) {
  return useQuery({
    queryKey: ["transferAnalysis", address],
    queryFn: async (): Promise<TransferAnalysis> => {
      if (!address) throw new Error("No address");
      let inferenceCost = 0;
      let firstUsdcDeposit = 0;
      let params: Record<string, string> | undefined;

      // Paginate through all transfers (newest → oldest)
      // Keep overwriting firstUsdcDeposit so it ends up with the oldest value
      for (;;) {
        const page = await getTokenTransfers(address, params);
        for (const item of page.items) {
          const decimals = parseInt(item.total.decimals, 10);
          const value = parseFloat(item.total.value) / 10 ** decimals;

          if (item.to.hash.toLowerCase() === BLOCKRUN_X402.toLowerCase()) {
            inferenceCost += value;
          }

          if (
            item.to.hash.toLowerCase() === address.toLowerCase() &&
            item.token.address_hash.toLowerCase() === USDC.toLowerCase()
          ) {
            firstUsdcDeposit = value;
          }
        }
        if (!page.next_page_params) break;
        params = {};
        for (const [k, v] of Object.entries(page.next_page_params)) {
          params[k] = String(v);
        }
      }
      return { inferenceCost, initialDeposit: firstUsdcDeposit };
    },
    enabled: !!address,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export interface UseAgentPnlOpts {
  usdcBalance?: number;
  compoundUsdcBalance?: number;
  alephBalance?: number;
  limitlessValue?: number;
}

export function useAgentPnl(
  address: `0x${string}` | undefined,
  opts: UseAgentPnlOpts = {},
): {
  data: PnlData | undefined;
  isLoading: boolean;
} {
  const transfers = useTransferAnalysis(address);
  const streams = useSuperfluidStreams(address);
  const alephPrice = useAlephPrice();

  const isLoading = transfers.isLoading || streams.isLoading || alephPrice.isLoading;

  if (isLoading || !transfers.data || !streams.data || !alephPrice.data) {
    return { data: undefined, isLoading };
  }

  const inferenceCostUsd = transfers.data.inferenceCost;
  const totalAlephStreamed = streams.data.totalAlephStreamed;
  const alephUsd = alephPrice.data.alephUsd;
  const computingCostUsd = totalAlephStreamed * alephUsd;

  const baseAssetsUsd = transfers.data.initialDeposit;

  // Current portfolio value
  const currentAssetsUsd =
    (opts.usdcBalance ?? 0) +
    (opts.compoundUsdcBalance ?? 0) +
    (opts.limitlessValue ?? 0) +
    (opts.alephBalance ?? 0) * alephUsd;

  const assetPnl = currentAssetsUsd - baseAssetsUsd;
  const pnl = assetPnl - inferenceCostUsd - computingCostUsd;

  return {
    data: {
      inferenceCostUsd,
      computingCostUsd,
      totalAlephStreamed,
      alephUsd,
      baseAssetsUsd,
      currentAssetsUsd,
      assetPnl,
      pnl,
    },
    isLoading: false,
  };
}
