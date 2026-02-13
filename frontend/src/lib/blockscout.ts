const BASE_BLOCKSCOUT = "https://base.blockscout.com/api/v2";

export interface BlockscoutTokenTransfer {
  token: { symbol: string; address: string; decimals: string };
  from: { hash: string };
  to: { hash: string };
  total: { value: string; decimals: string };
}

export interface BlockscoutTx {
  hash: string;
  block_number: number;
  timestamp: string;
  from: { hash: string; is_contract: boolean };
  to: { hash: string; is_contract: boolean } | null;
  value: string;
  fee: { value: string };
  method: string | null;
  status: string;
  result: string;
  token_transfers: BlockscoutTokenTransfer[];
}

export interface BlockscoutResponse {
  items: BlockscoutTx[];
  next_page_params: Record<string, unknown> | null;
}

export async function getTransactions(
  address: string,
  params?: Record<string, string>,
): Promise<BlockscoutResponse> {
  const searchParams = new URLSearchParams(params);
  const url = `${BASE_BLOCKSCOUT}/addresses/${address}/transactions?${searchParams}`;
  const res = await fetch(url);
  return res.json();
}
