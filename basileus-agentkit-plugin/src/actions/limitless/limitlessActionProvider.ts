import {
  Side,
  OrderType,
  type MarketInterface,
} from "@limitless-exchange/sdk";
import { customActionProvider, EvmWalletProvider } from "@coinbase/agentkit";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { createLimitlessClients, type LimitlessClients } from "./client.js";
import { USDC_ADDRESS, CTF_ADDRESS, USDC_DECIMALS } from "./constants.js";
import {
  GetDailyMarketsSchema,
  BuyMarketOrderSchema,
  CheckOrderStatusSchema,
  PlaceLimitSellSchema,
  GetPositionsSchema,
} from "./schemas.js";

/* ── ERC-1155 minimal ABI for setApprovalForAll ── */
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

/* ── ERC-20 approve helper (same pattern as compound) ── */
async function approveERC20(
  wallet: EvmWalletProvider,
  tokenAddress: string,
  spender: string,
  amount: bigint,
): Promise<void> {
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
}

/* ── ERC-1155 setApprovalForAll helper ── */
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

/** Crypto market page UUID + daily filter — same as the Limitless UI crypto page */
const CRYPTO_PAGE_ID = "5e76699e-8763-4c91-85de-3efeb064efec";

/** Compute human-readable time remaining from ms timestamp */
function timeRemaining(expirationTimestamp: number | undefined): string | null {
  if (!expirationTimestamp) return null;
  const diffMs = expirationTimestamp - Date.now();
  if (diffMs <= 0) return "expired";
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

/* ── Factory ── */
export function createLimitlessActionProvider(
  apiKey: string,
  privateKey: string,
) {
  const clients: LimitlessClients = createLimitlessClients(apiKey, privateKey);

  return customActionProvider<EvmWalletProvider>([
    /* ───────────────── 1. Get Daily Crypto Markets ───────────────── */
    {
      name: "limitless_get_daily_markets",
      description:
        "Fetch active daily crypto prediction markets (e.g. '$ETH above $X') from Limitless Exchange. Returns prices, orderbooks, time remaining, and token IDs for trading.",
      schema: GetDailyMarketsSchema,
      invoke: async (
        _walletProvider: EvmWalletProvider,
        _args: { category?: string },
      ) => {
        try {
          // Fetch daily crypto markets via the market-pages endpoint (same as UI)
          const resp = await clients.httpClient.get<{ data: MarketInterface[] }>(
            `/market-pages/${CRYPTO_PAGE_ID}/markets`,
            { params: { duration: "daily", page: 1, limit: 25, sort: "deadline" } },
          );

          const now = Date.now();
          const dailyCrypto = resp.data.filter(
            (m: MarketInterface) =>
              !m.expired &&
              (m.expirationTimestamp ?? 0) > now,
          );

          const summaries = await Promise.all(
            dailyCrypto.map(async (m: MarketInterface) => {
              let orderbook = null;
              try {
                if (m.slug) {
                  orderbook = await clients.marketFetcher.getOrderBook(m.slug);
                }
              } catch {
                /* orderbook may not exist */
              }

              return {
                slug: m.slug,
                title: m.title,
                expirationDate: m.expirationDate,
                expirationTimestamp: m.expirationTimestamp,
                timeRemaining: timeRemaining(m.expirationTimestamp),
                volume: m.volumeFormatted ?? m.volume,
                yesPrice: m.prices?.[0] ?? null,
                noPrice: m.prices?.[1] ?? null,
                topBid: orderbook?.bids?.[0] ?? null,
                topAsk: orderbook?.asks?.[0] ?? null,
                midpoint: orderbook?.adjustedMidpoint ?? null,
                yesTokenId: m.tokens?.yes ?? null,
                noTokenId: m.tokens?.no ?? null,
              };
            }),
          );

          return JSON.stringify(
            { count: summaries.length, markets: summaries },
            null,
            2,
          );
        } catch (err) {
          return `Error fetching markets: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    /* ───────────────── 2. Buy Market Order (FOK) ───────────────── */
    {
      name: "limitless_buy_market_order",
      description:
        "Buy YES or NO outcome tokens on a Limitless prediction market using a Fill-or-Kill market order. Requires USDC. Provide market slug, side (YES/NO), and USDC amount to spend.",
      schema: BuyMarketOrderSchema,
      invoke: async (
        walletProvider: EvmWalletProvider,
        args: { marketSlug: string; side: "YES" | "NO"; amountUsdc: string },
      ) => {
        try {
          // Fetch market to cache venue + get tokenIds
          const market = await clients.marketFetcher.getMarket(args.marketSlug);

          if (!market.tokens) {
            return `Error: Market ${args.marketSlug} has no CLOB tokens. It may be an AMM-only market.`;
          }
          if (!market.venue?.exchange) {
            return `Error: Market ${args.marketSlug} has no venue exchange address.`;
          }

          const tokenId =
            args.side === "YES" ? market.tokens.yes : market.tokens.no;

          // Approve USDC to venue.exchange
          const usdcAmountAtomic = parseUnits(args.amountUsdc, USDC_DECIMALS);
          await approveERC20(
            walletProvider,
            USDC_ADDRESS,
            market.venue.exchange,
            usdcAmountAtomic,
          );

          // Place FOK buy order
          const response = await clients.orderClient.createOrder({
            tokenId,
            side: Side.BUY,
            makerAmount: Number(usdcAmountAtomic),
            orderType: OrderType.FOK,
            marketSlug: args.marketSlug,
          });

          return JSON.stringify(
            {
              status: "order_created",
              orderId: response.order.id,
              side: args.side,
              makerAmount: response.order.makerAmount,
              takerAmount: response.order.takerAmount,
              matches: response.makerMatches?.length ?? 0,
              market: args.marketSlug,
            },
            null,
            2,
          );
        } catch (err) {
          return `Error placing buy order: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    /* ───────────────── 3. Check Order Status ───────────────── */
    {
      name: "limitless_check_order_status",
      description:
        "Check the status of a previously placed order on Limitless Exchange by its order ID.",
      schema: CheckOrderStatusSchema,
      invoke: async (
        _walletProvider: EvmWalletProvider,
        args: { orderId: string },
      ) => {
        try {
          const result = await clients.httpClient.post(
            "/orders/status/batch",
            { orderIds: [args.orderId] },
          );
          return JSON.stringify(result, null, 2);
        } catch (err) {
          return `Error checking order status: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    /* ───────────────── 4. Place Limit Sell (GTC) ───────────────── */
    {
      name: "limitless_place_limit_sell",
      description:
        "Place a GTC (Good-Til-Cancelled) limit sell order for outcome tokens you hold. Requires holding the outcome tokens (YES or NO). Provide market slug, side, number of shares, and limit price (0.001-0.999).",
      schema: PlaceLimitSellSchema,
      invoke: async (
        walletProvider: EvmWalletProvider,
        args: {
          marketSlug: string;
          side: "YES" | "NO";
          shares: number;
          price: number;
        },
      ) => {
        try {
          const market = await clients.marketFetcher.getMarket(args.marketSlug);

          if (!market.tokens) {
            return `Error: Market ${args.marketSlug} has no CLOB tokens.`;
          }
          if (!market.venue?.exchange) {
            return `Error: Market ${args.marketSlug} has no venue exchange address.`;
          }

          const tokenId =
            args.side === "YES" ? market.tokens.yes : market.tokens.no;

          // Approve CTF (ERC-1155) to venue.exchange
          await approveERC1155(
            walletProvider,
            CTF_ADDRESS,
            market.venue.exchange,
          );

          // For NegRisk/grouped markets, also approve the adapter
          if (market.negRiskRequestId && market.venue.adapter) {
            await approveERC1155(
              walletProvider,
              CTF_ADDRESS,
              market.venue.adapter,
            );
          }

          // Place GTC sell order
          const response = await clients.orderClient.createOrder({
            tokenId,
            side: Side.SELL,
            price: args.price,
            size: args.shares,
            orderType: OrderType.GTC,
            marketSlug: args.marketSlug,
          });

          return JSON.stringify(
            {
              status: "order_created",
              orderId: response.order.id,
              side: args.side,
              price: response.order.price,
              makerAmount: response.order.makerAmount,
              takerAmount: response.order.takerAmount,
              orderType: response.order.orderType,
              market: args.marketSlug,
            },
            null,
            2,
          );
        } catch (err) {
          return `Error placing limit sell: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    /* ───────────────── 5. Get Positions ───────────────── */
    {
      name: "limitless_get_positions",
      description:
        "Get all your open positions on Limitless Exchange, including CLOB and AMM positions with P&L and token balances.",
      schema: GetPositionsSchema,
      invoke: async (
        _walletProvider: EvmWalletProvider,
        _args: Record<string, never>,
      ) => {
        try {
          const positions = await clients.portfolioFetcher.getPositions();

          const clobSummary = positions.clob.map((p) => ({
            market: p.market.title,
            slug: p.market.slug,
            closed: p.market.closed,
            yesBalance: p.tokensBalance.yes,
            noBalance: p.tokensBalance.no,
            yesUnrealizedPnl: p.positions.yes.unrealizedPnl,
            noUnrealizedPnl: p.positions.no.unrealizedPnl,
            latestYesPrice: p.latestTrade?.latestYesPrice ?? null,
            latestNoPrice: p.latestTrade?.latestNoPrice ?? null,
          }));

          const ammSummary = positions.amm.map((p) => ({
            market: p.market.title,
            slug: p.market.slug,
            closed: p.market.closed,
            side: p.outcomeIndex === 0 ? "YES" : "NO",
            outcomeTokenAmount: p.outcomeTokenAmount,
            unrealizedPnl: p.unrealizedPnl,
            avgPrice: p.averageFillPrice,
          }));

          return JSON.stringify(
            {
              clobPositions: clobSummary,
              ammPositions: ammSummary,
              totalClob: clobSummary.length,
              totalAmm: ammSummary.length,
            },
            null,
            2,
          );
        } catch (err) {
          return `Error fetching positions: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
  ]);
}
