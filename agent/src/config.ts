import { config as dotenvConfig } from "dotenv";
import { existsSync } from "fs";

// Load env files in order: .env (base), .env.local (local overrides), .env.prod (production/deployed)
// Later files override earlier ones
for (const envFile of [".env", ".env.local", ".env.prod"]) {
  if (existsSync(envFile)) {
    dotenvConfig({ path: envFile, override: true });
  }
}
import { type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

export const config = {
  privateKey: requireEnv("BASE_CHAIN_WALLET_KEY") as Hex,
  chain: process.env.NETWORK === "base" ? base : baseSepolia,
  cycleIntervalMs: parseInt(process.env.CYCLE_INTERVAL_MS || "60000"),
  llmModel: process.env.LLM_MODEL || "anthropic/claude-sonnet-4",
  builderCode: process.env.BUILDER_CODE || undefined,
} as const;
