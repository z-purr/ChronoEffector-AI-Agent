import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchActivities } from "../lib/aleph";

export type { AgentActivity } from "../lib/aleph";

export function useActivities(address: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["activities", address],
    queryFn: ({ pageParam }) => fetchActivities(address!, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
