import { config as dotenvConfig } from "dotenv";
import { existsSync } from "fs";
import { type Hex } from "viem";
import { base } from "viem/chains";

// Load env files in order: .env (base), .env.local (local overrides), .env.prod (production/deployed)
// Later files override earlier ones
for (const envFile of [".env", ".env.local", ".env.prod"]) {
  if (existsSync(envFile)) {
    dotenvConfig({ path: envFile, override: true });
  }
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

export const config = {
  privateKey: requireEnv("WALLET_PRIVATE_KEY") as Hex,
  chain: base,
  cycleIntervalMs: parseInt(process.env.CYCLE_INTERVAL_MS || "900000"),
  heartbeatModel: process.env.LLM_HEARTBEAT_MODEL || "nvidia/gpt-oss-120b",
  strategyModel: process.env.LLM_STRATEGY_MODEL || "anthropic/claude-sonnet-4",
  usdcSurvivalThreshold: parseFloat(process.env.USDC_SURVIVAL_THRESHOLD || "3"),
  usdcIdleTarget: parseFloat(process.env.USDC_IDLE_TARGET || "5"),
  builderCode: process.env.BUILDER_CODE || undefined,
  rpcUrl: process.env.RPC_URL || undefined,
} as const;
