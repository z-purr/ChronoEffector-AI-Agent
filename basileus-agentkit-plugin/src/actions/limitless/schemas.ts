import { z } from "zod";

export const GetDailyMarketsSchema = z
  .object({})
  .describe(
    "Scan daily crypto prediction markets on Limitless for mispricing opportunities. " +
      "Returns each market's ticker, spot-vs-strike % difference, best buy YES/NO price with available shares, and time remaining. " +
      "Positive pctDiff = spot above strike (favors YES), negative = below (favors NO). " +
      "Compare pctDiff against buy prices to find edges.",
  );

export const BuyMarketOrderSchema = z
  .object({
    marketSlug: z
      .string()
      .describe(
        "Market slug from get_daily_markets, e.g. 'dollareth-above-dollar196952-on-feb-20-0600-utc-1771480804344'",
      ),
    side: z
      .enum(["YES", "NO"])
      .describe("YES if you think price will be above strike, NO if below"),
    amountUsdc: z
      .string()
      .regex(/^\d+(\.\d+)?$/, "Must be a valid number")
      .describe(
        "USDC to spend (e.g. '5'). Will execute immediately against the orderbook (Fill-or-Kill).",
      ),
  })
  .describe(
    "Buy YES or NO shares on a Limitless market. Executes immediately as a Fill-or-Kill order. " +
      "Returns orderId, USDC spent, and shares received. Call check_order_status right after to confirm.",
  );

export const CheckOrderStatusSchema = z
  .object({
    orderId: z.string().describe("Order ID returned by buy_market_order or place_limit_sell"),
  })
  .describe(
    "Check if an order was filled, partially filled, or failed. Call immediately after placing any order.",
  );

export const PlaceLimitSellSchema = z
  .object({
    marketSlug: z.string().describe("Market slug of the position to sell"),
    side: z
      .enum(["YES", "NO"])
      .describe("Which outcome tokens to sell — must match the side you bought"),
    shares: z
      .number()
      .positive()
      .describe("Number of shares to sell (from buy order's sharesReceived)"),
    price: z
      .number()
      .min(0.001)
      .max(0.999)
      .describe(
        "Limit price per share (0.001-0.999). Order stays open until filled or market expires.",
      ),
  })
  .describe(
    "Place a limit sell order (GTC) for shares you hold. Use after buying to lock in profit at a target price. " +
      "Returns orderId and order details.",
  );

export const GetPositionsSchema = z
  .object({})
  .describe(
    "Get all open Limitless positions with share balances, unrealized P&L, and latest prices. " +
      "Use to monitor existing positions and decide whether to sell.",
  );
