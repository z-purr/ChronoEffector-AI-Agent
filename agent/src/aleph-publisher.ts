import { AuthenticatedAlephHttpClient } from "@aleph-sdk/client";
import { importAccountFromPrivateKey } from "@aleph-sdk/ethereum";
import { ItemType } from "@aleph-sdk/message";

const CHANNEL = "basileus";

export interface ToolExecution {
  name: string;
  args?: Record<string, string>;
  result?: string;
  txHash?: string;
  meta?: Record<string, string>;
}

export type ActivityType = "inventory" | "survival" | "strategy" | "error";

export interface AgentActivity {
  summary: string;
  model: string;
  cycleId: string;
  tools?: ToolExecution[];
  txHashes?: string[];
}

let alephClient: AuthenticatedAlephHttpClient | null = null;

export function initAlephPublisher(privateKey: string): void {
  try {
    const account = importAccountFromPrivateKey(privateKey);
    alephClient = new AuthenticatedAlephHttpClient(account);
    console.log("[aleph] Publisher initialized");
  } catch (err) {
    console.error("[aleph] Failed to init publisher:", err);
  }
}

export async function publishActivity(
  postType: ActivityType,
  activity: AgentActivity,
): Promise<void> {
  if (!alephClient) {
    console.warn("[aleph] Publisher not initialized, skipping publish");
    return;
  }
  try {
    await alephClient.createPost({
      postType,
      content: activity,
      channel: CHANNEL,
      storageEngine: ItemType.inline,
    });
    console.log(`[aleph] Published ${postType}`);
  } catch (err) {
    console.error(`[aleph] Failed to publish ${postType}:`, err);
  }
}
