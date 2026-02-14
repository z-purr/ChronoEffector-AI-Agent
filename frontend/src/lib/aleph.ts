import { AlephHttpClient } from "@aleph-sdk/client";

const CHANNEL = "basileus";

export interface ToolExecution {
  name: string;
  args?: Record<string, string>;
  result?: string;
  txHash?: string;
  meta?: Record<string, string>;
}

export interface AlephActivityContent {
  model: string;
  content: string;
  tools?: ToolExecution[];
  txHashes?: string[];
}

export type ActivityType = "heartbeat" | "strategy" | "error";

export interface AgentActivity {
  id: string;
  timestamp: string;
  type: ActivityType;
  model: string;
  content: string;
  tools?: ToolExecution[];
  txHashes?: string[];
}

const client = new AlephHttpClient();

export async function fetchActivities(address: string): Promise<AgentActivity[]> {
  const res = await client.getPosts<AlephActivityContent>({
    types: ["heartbeat", "strategy", "error"],
    channels: [CHANNEL],
    addresses: [address],
    pagination: 50,
    page: 1,
  });

  return res.posts.map((post) => ({
    id: post.item_hash,
    timestamp: new Date(post.time * 1000).toISOString(),
    type: post.original_type as ActivityType,
    model: post.content.model,
    content: post.content.content,
    tools: post.content.tools,
    txHashes: post.content.txHashes,
  }));
}
