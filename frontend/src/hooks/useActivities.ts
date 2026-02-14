import { useQuery } from "@tanstack/react-query";
import { fetchActivities, type AgentActivity } from "../lib/aleph";

export type { AgentActivity } from "../lib/aleph";

export function useActivities(address: string | undefined) {
  return useQuery({
    queryKey: ["activities", address],
    queryFn: (): Promise<AgentActivity[]> => fetchActivities(address!),
    enabled: !!address,
    refetchInterval: 30_000,
  });
}
