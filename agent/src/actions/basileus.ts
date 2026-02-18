import { z } from "zod";
import { customActionProvider, EvmWalletProvider } from "@coinbase/agentkit";

export const basileusTriggerProvider = customActionProvider<EvmWalletProvider>([
  {
    name: "trigger_survival",
    description:
      "Call this when the agent is unhealthy: ALEPH hours too low, ETH too low for gas, or idle USDC too low for inference. This triggers a survival agent to fix the issues.",
    schema: z.object({
      reason: z
        .string()
        .describe(
          "What is unhealthy and needs fixing (e.g. 'ALEPH hours < 24, need to swap ETH to ALEPH')",
        ),
      idleUsdc: z.string().describe("Current idle USDC balance"),
      compoundUsdc: z.string().describe("Current USDC supplied in Compound"),
      ethBalance: z.string().describe("Current ETH balance"),
      alephHoursLeft: z.string().describe("Hours of compute remaining"),
    }),
    invoke: async (_walletProvider: EvmWalletProvider, args: Record<string, string>) => {
      return JSON.stringify({ triggered: "survival", ...args });
    },
  },
  {
    name: "trigger_strategy",
    description:
      "Call this when the agent is healthy and there is excess capital (idle USDC + Compound USDC beyond idle target) to deploy. This triggers a strategy agent to manage the capital.",
    schema: z.object({
      excessAmount: z
        .string()
        .describe("Total excess USDC available for deployment (idle + compound - idle target)"),
      idleUsdc: z.string().describe("Current idle USDC balance"),
      compoundUsdc: z.string().describe("Current USDC supplied in Compound"),
    }),
    invoke: async (_walletProvider: EvmWalletProvider, args: Record<string, string>) => {
      return JSON.stringify({ triggered: "strategy", ...args });
    },
  },
]);
