import { useQuery } from "@tanstack/react-query";
import { getOutflows, type SuperfluidStream } from "../lib/superfluid";
import { useEffect, useRef, useCallback } from "react";
import { formatUnits } from "viem";

export interface StreamInfo {
  totalFlowRatePerSec: bigint;
  flowRatePerHour: number;
  totalAlephStreamed: number;
  activeSince: number | undefined; // unix timestamp of earliest stream
  streams: SuperfluidStream[];
}

export function useSuperfluidStreams(address: `0x${string}` | undefined) {
  return useQuery({
    queryKey: ["superfluid", address],
    queryFn: async (): Promise<StreamInfo> => {
      if (!address) throw new Error("No address");
      const streams = await getOutflows(address);
      const alephStreams = streams.filter((s) => s.token.symbol.toLowerCase().includes("aleph"));
      const totalFlowRate = alephStreams.reduce((sum, s) => sum + BigInt(s.currentFlowRate), 0n);

      // Compute total ALEPH streamed across all streams
      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      let totalStreamedWei = 0n;
      for (const s of alephStreams) {
        const streamed = BigInt(s.streamedUntilUpdatedAt);
        const elapsed = nowSec - BigInt(s.updatedAtTimestamp);
        const sinceUpdate = BigInt(s.currentFlowRate) * (elapsed > 0n ? elapsed : 0n);
        totalStreamedWei += streamed + sinceUpdate;
      }

      // Active since = creation of the current (non-zero) stream
      const activeStreams = alephStreams.filter((s) => BigInt(s.currentFlowRate) > 0n);
      const activeSince = activeStreams.length
        ? Math.min(...activeStreams.map((s) => Number(s.createdAtTimestamp)))
        : undefined;

      return {
        totalFlowRatePerSec: totalFlowRate,
        flowRatePerHour: parseFloat(formatUnits(totalFlowRate * 3600n, 18)),
        totalAlephStreamed: parseFloat(formatUnits(totalStreamedWei, 18)),
        activeSince,
        streams: alephStreams,
      };
    },
    enabled: !!address,
    refetchInterval: 30_000,
  });
}

/**
 * Live-ticking ALEPH balance using requestAnimationFrame.
 * Writes directly to DOM refs to avoid React re-renders at 60fps.
 */
export function useLiveAlephBalance(
  snapshotBalance: bigint | undefined,
  flowRatePerSec: bigint | undefined,
  decimals: number = 6,
): {
  intRef: React.RefObject<HTMLSpanElement | null>;
  decRef: React.RefObject<HTMLSpanElement | null>;
} {
  const intRef = useRef<HTMLSpanElement | null>(null);
  const decRef = useRef<HTMLSpanElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const startBalRef = useRef<bigint>(0n);
  const rateRef = useRef<bigint>(0n);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (snapshotBalance === undefined || flowRatePerSec === undefined) return;
    startBalRef.current = snapshotBalance;
    rateRef.current = flowRatePerSec;
    startTimeRef.current = performance.now();
  }, [snapshotBalance, flowRatePerSec]);

  const tick = useCallback(() => {
    const elapsedMs = BigInt(Math.floor(performance.now() - startTimeRef.current));
    const drained = (rateRef.current * elapsedMs) / 1000n;
    const current = startBalRef.current - drained;
    const formatted = formatUnits(current > 0n ? current : 0n, 18);
    const dot = formatted.indexOf(".");
    if (intRef.current) intRef.current.textContent = dot >= 0 ? formatted.slice(0, dot) : formatted;
    if (decRef.current)
      decRef.current.textContent =
        dot >= 0
          ? formatted.slice(dot + 1, dot + 1 + decimals).padEnd(decimals, "0")
          : "0".repeat(decimals);
    rafRef.current = requestAnimationFrame(tick);
  }, [decimals]);

  useEffect(() => {
    if (snapshotBalance === undefined || flowRatePerSec === undefined) return;
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [snapshotBalance, flowRatePerSec, tick]);

  return { intRef, decRef };
}
