import type { AgentActivity } from "../../hooks/useActivities";
import type { NormalizedTxItem } from "./normalize";

export type DisplayItem =
  | { kind: "single"; item: NormalizedTxItem }
  | { kind: "group"; items: NormalizedTxItem[] }
  | { kind: "activity"; data: AgentActivity }
  | { kind: "activityGroup"; activities: AgentActivity[] };

type MergedEntry = { sort: number; groupKey: string; di: DisplayItem };

export function groupFeedItems(
  txItems: NormalizedTxItem[],
  activities: AgentActivity[],
  filter: "all" | "transactions" | "activities",
): DisplayItem[] {
  const merged: MergedEntry[] = [];

  if (filter !== "activities") {
    for (const item of txItems) {
      merged.push({ sort: item.timestamp, groupKey: item.groupKey, di: { kind: "single", item } });
    }
  }

  // Group activities by cycleId, sorted chronologically within each group
  if (filter !== "transactions") {
    const byCycle = new Map<string, AgentActivity[]>();
    for (const act of activities) {
      const key = `cycle-${act.cycleId}`;
      const arr = byCycle.get(key);
      if (arr) arr.push(act);
      else byCycle.set(key, [act]);
    }
    for (const [key, acts] of byCycle) {
      // Sort within group: oldest first
      acts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      // Use latest timestamp for feed position
      const latest = new Date(acts[acts.length - 1].timestamp).getTime();
      const di: DisplayItem = { kind: "activityGroup", activities: acts };
      merged.push({ sort: latest, groupKey: key, di });
    }
  }

  merged.sort((a, b) => b.sort - a.sort);

  // Group adjacent tx items with matching groupKey
  const result: { groupKey: string; di: DisplayItem }[] = [];
  for (const { groupKey, di } of merged) {
    const prev = result[result.length - 1];
    if (!prev || prev.groupKey !== groupKey) {
      result.push({ groupKey, di });
      continue;
    }
    if (di.kind === "single" && prev.di.kind === "single") {
      prev.di = { kind: "group", items: [prev.di.item, di.item] };
    } else if (di.kind === "single" && prev.di.kind === "group") {
      prev.di.items.push(di.item);
    } else {
      result.push({ groupKey, di });
    }
  }

  return result.map((r) => r.di);
}
