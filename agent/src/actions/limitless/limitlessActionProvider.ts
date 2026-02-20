import { customActionProvider, EvmWalletProvider } from "@coinbase/agentkit";
import { OrderType, Side, type MarketInterface } from "@limitless-exchange/sdk";
import { createPublicClient, encodeFunctionData, erc20Abi, http } from "viem";
import { base } from "viem/chains";
import { createLimitlessClients, type LimitlessClients } from "./client.js";
import { CTF_ADDRESS, USDC_ADDRESS } from "./constants.js";
import {
  BuyMarketOrderSchema,
  CheckOrderStatusSchema,
  GetMarketsSchema,
  GetPositionsSchema,
  PlaceLimitSellSchema,
  RedeemPositionsSchema,
} from "./schemas.js";

/* ── CTF redeemPositions minimal ABI ── */
const redeemPositionsAbi = [
  {
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "parentCollectionId", type: "bytes32" },
      { name: "conditionId", type: "bytes32" },
      { name: "indexSets", type: "uint256[]" },
    ],
    name: "redeemPositions",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/* ── ERC-1155 minimal ABI ── */
const erc1155SetApprovalAbi = [
  {
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const publicClient = createPublicClient({ chain: base, transport: http() });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function approveERC20(
  wallet: EvmWalletProvider,
  tokenAddress: string,
  spender: string,
  amount: bigint,
): Promise<void> {
  const walletAddress = await wallet.getAddress();
  const currentAllowance = (await publicClient.readContract({
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: "allowance",
    args: [walletAddress as `0x${string}`, spender as `0x${string}`],
  })) as bigint;
  if (currentAllowance > 0n) return;

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender as `0x${string}`, amount],
  });
  const txHash = await wallet.sendTransaction({
    to: tokenAddress as `0x${string}`,
    data,
  });
  await wallet.waitForTransactionReceipt(txHash);
  // Wait for Limitless API's RPC to index the new approval
  await sleep(2000);
}

async function approveERC1155(
  wallet: EvmWalletProvider,
  tokenAddress: string,
  operator: string,
): Promise<void> {
  const data = encodeFunctionData({
    abi: erc1155SetApprovalAbi,
    functionName: "setApprovalForAll",
    args: [operator as `0x${string}`, true],
  });
  const txHash = await wallet.sendTransaction({
    to: tokenAddress as `0x${string}`,
    data,
  });
  await wallet.waitForTransactionReceipt(txHash);
}

/* ── Helpers ── */

const CRYPTO_PAGE_ID = "5e76699e-8763-4c91-85de-3efeb064efec";
const SHARES_DECIMALS = 6;

function fmtShares(raw: number | string | undefined | null): number | null {
  if (raw == null) return null;
  return Number(raw) / 10 ** SHARES_DECIMALS;
}

function minutesRemaining(expirationTimestamp: number | undefined): number | null {
  if (!expirationTimestamp) return null;
  const diffMs = expirationTimestamp - Date.now();
  if (diffMs <= 0) return 0;
  return Math.round(diffMs / 60_000);
}

/** Approximate taker fee %. Limitless: 3% at price=0 → 0.03% at price=1 (linear). */
function estimatedBuyFee(price: number | null): number | null {
  if (price == null) return null;
  return +Math.max(0.03, 3 - 2.97 * price).toFixed(2);
}

/* ── Spot price helper (CoinGecko) ── */
const TICKER_TO_COINGECKO: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  AVAX: "avalanche-2",
  DOGE: "dogecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOT: "polkadot",
  LINK: "chainlink",
  MATIC: "matic-network",
  NEAR: "near",
  SUI: "sui",
  ARB: "arbitrum",
  OP: "optimism",
  PEPE: "pepe",
  WIF: "dogwifcoin",
  BONK: "bonk",
  BNB: "binancecoin",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  AAVE: "aave",
  UNI: "uniswap",
  MKR: "maker",
  HYPE: "hyperliquid",
  TRX: "tron",
  TRUMP: "official-trump",
  MNT: "mantle",
  XLM: "stellar",
  ZEC: "zcash",
  WLFI: "world-liberty-financial",
  LEO: "leo-token",
  HBAR: "hedera-hashgraph",
  PAXG: "pax-gold",
  XMR: "monero",
  ONDO: "ondo-finance",
};

async function fetchSpotPrices(tickers: string[]): Promise<Record<string, number>> {
  const ids = tickers.map((t) => TICKER_TO_COINGECKO[t.toUpperCase()]).filter(Boolean);
  if (!ids.length) return {};
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`;
  const res = await fetch(url);
  const data = await res.json();
  const result: Record<string, number> = {};
  for (const [ticker, cgId] of Object.entries(TICKER_TO_COINGECKO)) {
    if (data[cgId]?.usd != null) result[ticker] = data[cgId].usd;
  }
  return result;
}

/* ── Factory ── */
export function createLimitlessActionProvider(apiKey: string, privateKey: string) {
  const clients: LimitlessClients = createLimitlessClients(apiKey, privateKey);

  return customActionProvider<EvmWalletProvider>([
    /* ───────── 1. Scan Markets ───────── */
    {
      name: "limitless_get_markets",
      description:
        "Scan hourly and daily crypto prediction markets on Limitless for mispricing opportunities. " +
        "Returns ticker, spot-vs-strike % diff, buy YES/NO prices with available shares, and time remaining. " +
        "Positive pctDiff = spot above strike (favors YES), negative = below (favors NO).",
      schema: GetMarketsSchema,
      invoke: async () => {
        try {
          const [hourlyResp, dailyResp] = await Promise.all([
            clients.httpClient.get<{ data: MarketInterface[] }>(
              `/market-pages/${CRYPTO_PAGE_ID}/markets`,
              { params: { duration: "hourly", page: 1, limit: 25, sort: "deadline" } },
            ),
            clients.httpClient.get<{ data: MarketInterface[] }>(
              `/market-pages/${CRYPTO_PAGE_ID}/markets`,
              { params: { duration: "daily", page: 1, limit: 25, sort: "deadline" } },
            ),
          ]);
          const resp = { data: [...hourlyResp.data, ...dailyResp.data] };

          const now = Date.now();
          const active = resp.data.filter(
            (m: MarketInterface) => !m.expired && (m.expirationTimestamp ?? 0) > now,
          );

          const tickers = [
            ...new Set(
              active
                .map((m: any) => m.priceOracleMetadata?.ticker as string | undefined)
                .filter(Boolean),
            ),
          ] as string[];
          const spotPrices = await fetchSpotPrices(tickers);

          const markets = await Promise.all(
            active.map(async (m: MarketInterface) => {
              const mAny = m as any;
              const ticker: string | null = mAny.priceOracleMetadata?.ticker ?? null;

              let buyYes: { price: number; shares: number } | null = null;
              let buyNo: { price: number; shares: number } | null = null;
              try {
                if (m.slug) {
                  const ob = await clients.marketFetcher.getOrderBook(m.slug);
                  if (ob.asks?.length) {
                    buyYes = { price: ob.asks[0].price, shares: fmtShares(ob.asks[0].size)! };
                  }
                  if (ob.bids?.length) {
                    buyNo = {
                      price: +(1 - ob.bids[0].price).toFixed(4),
                      shares: fmtShares(ob.bids[0].size)!,
                    };
                  }
                }
              } catch {
                /* no orderbook */
              }

              const spot = ticker ? (spotPrices[ticker] ?? null) : null;
              const strikeMatch = m.title?.match(/above \$([0-9.,]+)/i);
              const strike = strikeMatch ? parseFloat(strikeMatch[1].replace(/,/g, "")) : null;
              const pctDiff =
                spot != null && strike != null
                  ? +(((spot - strike) / strike) * 100).toFixed(2)
                  : null;

              return {
                slug: m.slug,
                title: m.title,
                ticker,
                pctDiff,
                minutesRemaining: minutesRemaining(m.expirationTimestamp),
                buyYes: buyYes ? { ...buyYes, estimatedFee: estimatedBuyFee(buyYes.price) } : null,
                buyNo: buyNo ? { ...buyNo, estimatedFee: estimatedBuyFee(buyNo.price) } : null,
              };
            }),
          );

          return JSON.stringify({ count: markets.length, markets }, null, 2);
        } catch (err) {
          return `Error fetching markets: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    /* ───────── 2. Buy (FOK) ───────── */
    {
      name: "limitless_buy_market_order",
      description:
        "Buy YES or NO shares on a Limitless market. Executes immediately (Fill-or-Kill). " +
        "Returns orderId, USDC spent, shares received. Call check_order_status right after.",
      schema: BuyMarketOrderSchema,
      invoke: async (
        walletProvider: EvmWalletProvider,
        args: { marketSlug: string; side: "YES" | "NO"; amountUsdc: string },
      ) => {
        try {
          const market = await clients.marketFetcher.getMarket(args.marketSlug);

          if (!market.tokens)
            return `Error: Market ${args.marketSlug} has no CLOB tokens (AMM-only).`;
          if (!market.venue?.exchange)
            return `Error: Market ${args.marketSlug} has no venue exchange.`;

          const tokenId = args.side === "YES" ? market.tokens.yes : market.tokens.no;

          await approveERC20(walletProvider, USDC_ADDRESS, market.venue.exchange, 2n ** 256n - 1n);

          const res = await clients.orderClient.createOrder({
            tokenId,
            side: Side.BUY,
            makerAmount: parseFloat(args.amountUsdc),
            orderType: OrderType.FOK,
            marketSlug: args.marketSlug,
          });

          return JSON.stringify(
            {
              status: "filled",
              orderId: res.order.id,
              side: args.side,
              usdcSpent: fmtShares(res.order.makerAmount),
              sharesReceived: fmtShares(res.order.takerAmount),
              matches: res.makerMatches?.length ?? 0,
              market: args.marketSlug,
            },
            null,
            2,
          );
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    /* ───────── 3. Check Order Status ───────── */
    {
      name: "limitless_check_order_status",
      description:
        "Check if an order was filled, partially filled, or failed. Call right after placing any order.",
      schema: CheckOrderStatusSchema,
      invoke: async (_walletProvider: EvmWalletProvider, args: { orderId: string }) => {
        try {
          const result = await clients.httpClient.post("/orders/status/batch", {
            items: [{ orderId: args.orderId }],
          });
          return JSON.stringify(result, null, 2);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    /* ───────── 4. Limit Sell (GTC) ───────── */
    {
      name: "limitless_place_limit_sell",
      description:
        "Place a limit sell order (GTC) for shares you hold. Use after buying to set a take-profit price. " +
        "Order stays open until filled or market expires. Returns orderId.",
      schema: PlaceLimitSellSchema,
      invoke: async (
        walletProvider: EvmWalletProvider,
        args: { marketSlug: string; side: "YES" | "NO"; shares: number; price: number },
      ) => {
        try {
          const market = await clients.marketFetcher.getMarket(args.marketSlug);

          if (!market.tokens) return `Error: Market ${args.marketSlug} has no CLOB tokens.`;
          if (!market.venue?.exchange)
            return `Error: Market ${args.marketSlug} has no venue exchange.`;

          const tokenId = args.side === "YES" ? market.tokens.yes : market.tokens.no;

          await approveERC1155(walletProvider, CTF_ADDRESS, market.venue.exchange);
          if (market.negRiskRequestId && market.venue.adapter) {
            await approveERC1155(walletProvider, CTF_ADDRESS, market.venue.adapter);
          }

          const res = await clients.orderClient.createOrder({
            tokenId,
            side: Side.SELL,
            price: args.price,
            size: args.shares,
            orderType: OrderType.GTC,
            marketSlug: args.marketSlug,
          });

          return JSON.stringify(
            {
              status: "order_placed",
              orderId: res.order.id,
              side: args.side,
              price: res.order.price,
              shares: fmtShares(res.order.makerAmount),
              usdcExpected: fmtShares(res.order.takerAmount),
              market: args.marketSlug,
            },
            null,
            2,
          );
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    /* ───────── 5. Get Positions ───────── */
    {
      name: "limitless_get_positions",
      description:
        "Get all open Limitless positions with share balances, unrealized P&L, and latest prices. " +
        "Use to monitor positions and decide whether to sell.",
      schema: GetPositionsSchema,
      invoke: async () => {
        try {
          const pos = await clients.portfolioFetcher.getPositions();

          const clob = pos.clob.map((p) => ({
            market: p.market.title,
            slug: p.market.slug,
            closed: p.market.closed,
            yesShares: fmtShares(p.tokensBalance.yes),
            noShares: fmtShares(p.tokensBalance.no),
            yesUnrealizedPnl: fmtShares(p.positions.yes.unrealizedPnl),
            noUnrealizedPnl: fmtShares(p.positions.no.unrealizedPnl),
            latestYesPrice: p.latestTrade?.latestYesPrice ?? null,
            latestNoPrice: p.latestTrade?.latestNoPrice ?? null,
          }));

          const amm = pos.amm.map((p) => ({
            market: p.market.title,
            slug: p.market.slug,
            closed: p.market.closed,
            side: p.outcomeIndex === 0 ? "YES" : "NO",
            shares: fmtShares(p.outcomeTokenAmount),
            unrealizedPnl: fmtShares(p.unrealizedPnl),
            avgPrice: p.averageFillPrice,
          }));

          return JSON.stringify(
            { clob, amm, totalClob: clob.length, totalAmm: amm.length },
            null,
            2,
          );
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    /* ───────── 6. Redeem Positions ───────── */
    {
      name: "limitless_redeem_positions",
      description:
        "Redeem winning shares from resolved Limitless markets back to USDC. " +
        "Auto-detects closed CLOB positions with token balance > 0 and redeems on-chain.",
      schema: RedeemPositionsSchema,
      invoke: async (walletProvider: EvmWalletProvider, _args: Record<string, never>) => {
        try {
          const pos = await clients.portfolioFetcher.getPositions();

          const redeemable = pos.clob.filter((p) => {
            if (!p.market.closed) return false;
            if (!(p.market as any).conditionId) return false;
            const yesBalance = Number(p.tokensBalance.yes ?? 0);
            const noBalance = Number(p.tokensBalance.no ?? 0);
            return yesBalance > 0 || noBalance > 0;
          });

          if (redeemable.length === 0) {
            return JSON.stringify({ redeemed: 0, message: "No redeemable positions found" });
          }

          const PARENT_COLLECTION_ID =
            "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
          const INDEX_SETS = [1n, 2n];

          const results: { market: string; conditionId: string; txHash: string }[] = [];
          const errors: { market: string; error: string }[] = [];

          for (const p of redeemable) {
            const conditionId = (p.market as any).conditionId as string;
            try {
              const data = encodeFunctionData({
                abi: redeemPositionsAbi,
                functionName: "redeemPositions",
                args: [
                  USDC_ADDRESS,
                  PARENT_COLLECTION_ID,
                  conditionId as `0x${string}`,
                  INDEX_SETS,
                ],
              });
              const txHash = await walletProvider.sendTransaction({
                to: CTF_ADDRESS,
                data,
              });
              await walletProvider.waitForTransactionReceipt(txHash);
              results.push({
                market: p.market.title ?? p.market.slug ?? "unknown",
                conditionId,
                txHash,
              });
            } catch (err) {
              errors.push({
                market: p.market.title ?? p.market.slug ?? "unknown",
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          const json = JSON.stringify({ redeemed: results.length, results, errors }, null, 2);
          const hashLines = results.map((r) => `Transaction hash: ${r.txHash}`).join("\n");
          return hashLines ? `${json}\n${hashLines}` : json;
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
  ]);
}
