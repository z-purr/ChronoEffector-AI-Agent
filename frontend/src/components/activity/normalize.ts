import type { BlockscoutTx, BlockscoutTokenTransferItem } from "../../lib/blockscout";
import {
  SUPERFLUID_CFAV1_FORWARDER,
  L2_REGISTRAR,
  L2_REGISTRY,
  BLOCKRUN_X402,
} from "../../lib/contracts";
import { formatAmount, formatWeiValue } from "../../lib/format";

export type IconType =
  | { kind: "img"; src: string; alt: string }
  | { kind: "direction"; isSent: boolean };

export interface NormalizedTxItem {
  key: string;
  timestamp: number;
  groupKey: string;
  label: string;
  icon: IconType;
  valueDisplay: string | null;
  symbol: string | null;
  rawValue: number;
  isScam: boolean;
  isSent: boolean;
  counterparty: string | null;
  showCounterparty: boolean;
  explorerTxHash: string;
}

export function normalizeTx(tx: BlockscoutTx, agentAddress: string): NormalizedTxItem {
  const isSent = tx.from.hash.toLowerCase() === agentAddress.toLowerCase();
  const counterparty = isSent ? (tx.to?.hash ?? null) : tx.from.hash;

  const tokenTransfer = tx.token_transfers?.[0];
  let rawValue: number;
  let valueDisplay: string;
  let symbol: string;

  if (tokenTransfer) {
    const decimals = parseInt(tokenTransfer.total.decimals, 10);
    rawValue = parseFloat(tokenTransfer.total.value) / 10 ** decimals;
    valueDisplay = formatAmount(rawValue);
    symbol = tokenTransfer.token.symbol;
  } else {
    rawValue = parseFloat(tx.value) / 1e18;
    valueDisplay = formatWeiValue(tx.value);
    symbol = "ETH";
  }

  const toAddr = tx.to?.hash.toLowerCase() ?? "";
  const isSuperfluid = toAddr === SUPERFLUID_CFAV1_FORWARDER.toLowerCase();
  const isRegistrar = toAddr === L2_REGISTRAR.toLowerCase();
  const isRegistry = toAddr === L2_REGISTRY.toLowerCase();

  let label: string;
  if (isSuperfluid && tx.method === "createFlow") label = "Start ALEPH stream";
  else if (isSuperfluid && tx.method === "deleteFlow") label = "Stop ALEPH stream";
  else if (isSuperfluid && tx.method === "updateFlow") label = "Update ALEPH stream";
  else if (isRegistrar && tx.method === "register") label = "Register ENS name";
  else if (isRegistry && tx.method === "setContenthash") label = "Set ENS content hash";
  else label = tx.method || "Transfer";

  const showCounterparty = !isSuperfluid && !isRegistrar && !isRegistry;

  let icon: IconType;
  if (isSuperfluid) icon = { kind: "img", src: "/icons/aleph.png", alt: "ALEPH" };
  else if (isRegistrar || isRegistry) icon = { kind: "img", src: "/icons/ens.jpg", alt: "ENS" };
  else icon = { kind: "direction", isSent };

  const hideValue = valueDisplay === "0";

  return {
    key: `tx-${tx.hash}`,
    timestamp: new Date(tx.timestamp).getTime(),
    groupKey: `tx-${tx.method || "transfer"}-${toAddr}`,
    label,
    icon,
    valueDisplay: hideValue ? null : valueDisplay,
    symbol: hideValue ? null : symbol,
    rawValue,
    isScam: false,
    isSent,
    counterparty,
    showCounterparty,
    explorerTxHash: tx.hash,
  };
}

export function normalizeTokenTransfer(
  tt: BlockscoutTokenTransferItem,
  agentAddress: string,
): NormalizedTxItem {
  const isSent = tt.from.hash.toLowerCase() === agentAddress.toLowerCase();
  const counterparty = isSent ? tt.to.hash : tt.from.hash;
  const isBlockrun = tt.to.hash.toLowerCase() === BLOCKRUN_X402.toLowerCase();

  const decimals = parseInt(tt.total.decimals, 10);
  const rawValue = parseFloat(tt.total.value) / 10 ** decimals;
  const valueDisplay = formatAmount(rawValue);

  const label = isBlockrun
    ? "x402 AI inference"
    : `${isSent ? "Send" : "Receive"} ${tt.token.symbol}`;

  let icon: IconType;
  if (isBlockrun) icon = { kind: "img", src: "/icons/blockrun.png", alt: "Blockrun" };
  else icon = { kind: "direction", isSent };

  const isScam = tt.method?.toLowerCase() === "airdrop";

  return {
    key: `tt-${tt.transaction_hash}-${tt.log_index}`,
    timestamp: new Date(tt.timestamp).getTime(),
    groupKey: `tt-${tt.to.hash.toLowerCase()}-${tt.token.address_hash.toLowerCase()}`,
    label,
    icon,
    valueDisplay,
    symbol: tt.token.symbol,
    rawValue,
    isScam,
    isSent,
    counterparty,
    showCounterparty: !isBlockrun,
    explorerTxHash: tt.transaction_hash,
  };
}
