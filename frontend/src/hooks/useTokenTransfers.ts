import { useInfiniteQuery } from "@tanstack/react-query";
import { getTokenTransfers } from "../lib/blockscout";

export function useTokenTransfers(address: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["tokenTransfers", address],
    queryFn: async ({ pageParam }) => {
      if (!address) throw new Error("No address");
      return getTokenTransfers(address, pageParam ?? undefined);
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.next_page_params) return undefined;
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(lastPage.next_page_params)) {
        params[k] = String(v);
      }
      return params;
    },
    initialPageParam: null as Record<string, string> | null,
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
