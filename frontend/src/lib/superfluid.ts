const SUPERFLUID_SUBGRAPH = "https://subgraph-endpoints.superfluid.dev/base-mainnet/protocol-v1";

export interface SuperfluidStream {
  currentFlowRate: string;
  token: { symbol: string; id: string };
  receiver: { id: string };
  sender: { id: string };
  streamedUntilUpdatedAt: string;
  updatedAtTimestamp: string;
  createdAtTimestamp: string;
}

export async function getOutflows(address: string): Promise<SuperfluidStream[]> {
  const query = `{
    streams(where: { sender: "${address.toLowerCase()}" }) {
      currentFlowRate
      streamedUntilUpdatedAt
      updatedAtTimestamp
      createdAtTimestamp
      token { symbol id }
      receiver { id }
      sender { id }
    }
  }`;

  const res = await fetch(SUPERFLUID_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  return data.data?.streams ?? [];
}
