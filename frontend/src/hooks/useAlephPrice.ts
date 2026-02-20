import { useQuery } from "@tanstack/react-query";

export function useAlephPrice() {
  return useQuery({
    queryKey: ["alephPriceUsd"],
    queryFn: async () => {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=aleph&vs_currencies=usd",
      );
      const data = await res.json();
      const usd: number = data.aleph?.usd ?? 0;
      return { alephUsd: usd };
    },
    refetchInterval: 15 * 60_000,
    staleTime: 15 * 60_000,
  });
}
