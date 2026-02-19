import type {
  BlockscoutTx,
  BlockscoutTokenTransferItem,
  BlockscoutAddress,
} from "../../lib/blockscout";
import {
  SUPERFLUID_CFAV1_FORWARDER,
  L2_REGISTRAR,
  L2_REGISTRY,
  BLOCKRUN_X402,
  COMPOUND_COMET,
  LIMITLESS,
} from "../../lib/contracts";
import { formatAmount, formatWeiValue } from "../../lib/format";
import { USDC_DECIMALS } from "../../lib/contracts";

/** Extract protocol name from Blockscout address metadata tags */
function getProtocolTag(addr: BlockscoutAddress | null): string | null {
  const tags = addr?.metadata?.tags;
  if (!tags) return null;
  const proto = tags.find((t) => t.tagType === "protocol");
  return proto?.name ?? null;
}

/** Capitalise first letter of a method name */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
  isInference: boolean;
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
  const isCompound = toAddr === COMPOUND_COMET.toLowerCase();
  const isLimitless = toAddr === LIMITLESS.toLowerCase();

  // For approve txs, check if spender is a known protocol
  const spender =
    tx.method === "approve"
      ? tx.decoded_input?.parameters?.find((p) => p.name === "spender")?.value.toLowerCase()
      : null;
  const isApproveForCompound = spender === COMPOUND_COMET.toLowerCase();
  const isApproveForLimitless = spender === LIMITLESS.toLowerCase();

  let label: string;
  if (isSuperfluid && tx.method === "createFlow") label = "Start ALEPH stream";
  else if (isSuperfluid && tx.method === "deleteFlow") label = "Stop ALEPH stream";
  else if (isSuperfluid && tx.method === "updateFlow") label = "Update ALEPH stream";
  else if (isRegistrar && tx.method === "register") label = "Register ENS name";
  else if (isRegistry && tx.method === "setContenthash") label = "Set ENS content hash";
  else if (isCompound) {
    const compoundToken = tokenTransfer?.token.symbol || "USDC";
    label = `${capitalize(tx.method || "interact")} ${compoundToken} (Compound)`;
  } else if (isApproveForCompound) label = `Approve ${tx.to?.name || "USDC"} (Compound)`;
  else if (isLimitless) label = `${isSent ? "Buy" : "Redeem"} shares (Limitless)`;
  else if (isApproveForLimitless) label = `Approve USDC (Limitless)`;
  else {
    // Fallback: use Blockscout protocol tag if available
    const protocol = getProtocolTag(tx.to);
    const method = tx.method || "Transfer";
    label = protocol ? `${capitalize(method)} (${protocol})` : method;
  }

  const hasCustomLabel =
    isSuperfluid ||
    isRegistrar ||
    isRegistry ||
    isCompound ||
    isApproveForCompound ||
    isLimitless ||
    isApproveForLimitless;
  const showCounterparty = !hasCustomLabel;

  let icon: IconType;
  if (isSuperfluid) icon = { kind: "img", src: "/icons/aleph.png", alt: "ALEPH" };
  else if (isRegistrar || isRegistry) icon = { kind: "img", src: "/icons/ens.jpg", alt: "ENS" };
  else if (isCompound || isApproveForCompound)
    icon = { kind: "img", src: "/icons/compound.png", alt: "Compound" };
  else if (isLimitless || isApproveForLimitless)
    icon = { kind: "img", src: "/icons/limitless.png", alt: "Limitless" };
  else icon = { kind: "direction", isSent };

  // For Compound/Limitless txs with no token transfers, extract amount from decoded_input
  if (
    (isCompound || isApproveForCompound || isLimitless || isApproveForLimitless) &&
    rawValue === 0 &&
    tx.decoded_input?.parameters
  ) {
    const amountParam = tx.decoded_input.parameters.find(
      (p) => p.name === "value" || p.name === "amount",
    );
    if (amountParam) {
      const parsed = parseFloat(amountParam.value) / 10 ** USDC_DECIMALS;
      if (!Number.isFinite(parsed) || parsed > 1e12) {
        valueDisplay = "Unlimited";
      } else {
        rawValue = parsed;
        valueDisplay = formatAmount(rawValue);
      }
      symbol = "USDC";
    }
  }

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
    isInference: false,
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

  const isCompound = tt.to.hash.toLowerCase() === COMPOUND_COMET.toLowerCase();
  const isLimitlessTo = tt.to.hash.toLowerCase() === LIMITLESS.toLowerCase();
  const isLimitlessFrom = tt.from.hash.toLowerCase() === LIMITLESS.toLowerCase();
  const isLimitless = isLimitlessTo || isLimitlessFrom;

  let label: string;
  if (isBlockrun) label = "x402 AI inference";
  else if (isLimitless) label = `${isLimitlessTo ? "Buy" : "Redeem"} shares (Limitless)`;
  else if (isCompound) label = `${isSent ? "Supply" : "Withdraw"} ${tt.token.symbol} (Compound)`;
  else {
    const protocol = getProtocolTag(isSent ? tt.to : tt.from);
    const direction = isSent ? "Send" : "Receive";
    label = protocol
      ? `${direction} ${tt.token.symbol} (${protocol})`
      : `${direction} ${tt.token.symbol}`;
  }

  let icon: IconType;
  if (isBlockrun) icon = { kind: "img", src: "/icons/blockrun.png", alt: "Blockrun" };
  else if (isLimitless) icon = { kind: "img", src: "/icons/limitless.png", alt: "Limitless" };
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
    isInference: isBlockrun,
    isSent,
    counterparty,
    showCounterparty: !isBlockrun && !isLimitless,
    explorerTxHash: tt.transaction_hash,
  };
}
