import { useAgentBalance } from "./useAgentBalance";
import { useSuperfluidStreams } from "./useSuperfluid";

export type AgentStatus = "healthy" | "warning" | "inactive" | "dead";

export function useAgentStatus(address: `0x${string}`) {
  const balance = useAgentBalance(address);
  const streams = useSuperfluidStreams(address);

  const isLoading = balance.isLoading || streams.isLoading;
  const aleph = parseFloat(balance.data?.aleph ?? "0");
  const rate = streams.data?.flowRatePerHour ?? 0;
  const hoursLeft = rate > 0 ? aleph / rate : Infinity;

  let status: AgentStatus = "healthy";
  if (rate === 0) status = aleph > 0 ? "inactive" : "dead";
  else if (hoursLeft <= 0) status = "dead";
  else if (hoursLeft < 24) status = "warning";

  return { status, hoursLeft, activeSince: streams.data?.activeSince, isLoading };
}
