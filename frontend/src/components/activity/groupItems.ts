import type { AgentActivity } from "../../hooks/useActivities";
import type { NormalizedTxItem } from "./normalize";

export type DisplayItem =
  | { kind: "single"; item: NormalizedTxItem }
  | { kind: "group"; items: NormalizedTxItem[] }
  | { kind: "activity"; data: AgentActivity };

export function groupFeedItems(
  txItems: NormalizedTxItem[],
  activities: AgentActivity[],
  filter: "all" | "transactions" | "activities",
): DisplayItem[] {
  // Merge into one timeline
  const merged: { sort: number; di: DisplayItem }[] = [];

  if (filter !== "activities") {
    for (const item of txItems) {
      merged.push({ sort: item.timestamp, di: { kind: "single", item } });
    }
  }

  if (filter !== "transactions") {
    for (const act of activities) {
      merged.push({
        sort: new Date(act.timestamp).getTime(),
        di: { kind: "activity", data: act },
      });
    }
  }

  merged.sort((a, b) => b.sort - a.sort);

  // Group adjacent items with matching groupKey
  const result: DisplayItem[] = [];
  for (const { di } of merged) {
    if (di.kind !== "single") {
      result.push(di);
      continue;
    }
    const prev = result[result.length - 1];
    if (prev?.kind === "single" && prev.item.groupKey === di.item.groupKey) {
      result[result.length - 1] = { kind: "group", items: [prev.item, di.item] };
    } else if (prev?.kind === "group" && prev.items[0].groupKey === di.item.groupKey) {
      prev.items.push(di.item);
    } else {
      result.push(di);
    }
  }

  return result;
}
