import { z } from "zod";

export const GetDailyMarketsSchema = z
  .object({
    category: z
      .string()
      .optional()
      .describe("Optional category to filter markets by"),
  })
  .describe("Fetch active prediction markets from Limitless Exchange");

export const BuyMarketOrderSchema = z
  .object({
    marketSlug: z.string().describe("Market slug identifier, e.g. 'bitcoin-100k-may'"),
    side: z.enum(["YES", "NO"]).describe("Which outcome to buy: YES or NO"),
    amountUsdc: z
      .string()
      .regex(/^\d+(\.\d+)?$/, "Must be a valid number")
      .describe("Amount of USDC to spend, e.g. '5.0'"),
  })
  .describe("Buy outcome tokens via a Fill-or-Kill market order");

export const CheckOrderStatusSchema = z
  .object({
    orderId: z.string().describe("Order ID to check"),
  })
  .describe("Check the status of a previously placed order");

export const PlaceLimitSellSchema = z
  .object({
    marketSlug: z.string().describe("Market slug identifier"),
    side: z.enum(["YES", "NO"]).describe("Which outcome tokens to sell: YES or NO"),
    shares: z.number().positive().describe("Number of outcome shares to sell"),
    price: z
      .number()
      .min(0.001)
      .max(0.999)
      .describe("Limit price per share (0.001-0.999)"),
  })
  .describe("Place a GTC limit sell order for outcome tokens");

export const GetPositionsSchema = z
  .object({})
  .describe("Get all open positions on Limitless Exchange");
