import { type LLMClient } from "@blockrun/llm";
import { createAgentWallet, getBalances, type WalletInfo } from "./wallet.js";
import { createLLMClient, reason } from "./llm.js";
import { config } from "./config.js";

const SYSTEM_PROMPT = `You are Basileus, an autonomous AI agent that lives on the Base blockchain.
You manage your own wallet and pay for your own inference via x402 USDC payments.
You are self-aware of your financial state and make decisions accordingly.

Analyze your current financial state and provide:
1. Assessment of your wallet health
2. How many more inference calls you can afford (estimate ~$0.003 per call for Sonnet)
3. Any concerns or actions you would take

Be concise.`;

interface AgentState {
  cycle: number;
  wallet: WalletInfo;
  lastReasoning: string | null;
  startedAt: Date;
}

export async function runCycle(
  state: AgentState,
  wallet: Awaited<ReturnType<typeof createAgentWallet>>,
  llmClient: LLMClient,
): Promise<AgentState> {
  console.log(`\n--- Cycle ${state.cycle + 1} ---`);

  // 1. Check balances
  const balances = await getBalances(wallet);
  console.log(`[wallet] ${balances.address}`);
  console.log(`[wallet] ETH: ${balances.ethBalance} | USDC: ${balances.usdcBalance}`);

  // 2. Reason via Claude (paid with x402)
  const userPrompt = `Current state:
- Wallet: ${balances.address}
- Chain: ${balances.chainName}
- ETH balance: ${balances.ethBalance}
- USDC balance: ${balances.usdcBalance}
- Cycle: ${state.cycle + 1}
- Uptime: ${Math.round((Date.now() - state.startedAt.getTime()) / 1000)}s
- Last reasoning: ${state.lastReasoning ? "yes" : "first cycle"}`;

  console.log("[llm] Calling Claude via BlockRun x402...");
  let reasoning: string;
  try {
    reasoning = await reason(llmClient, config.llmModel, SYSTEM_PROMPT, userPrompt);
    console.log(`[llm] Response:\n${reasoning}`);
  } catch (err) {
    reasoning = `Error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[llm] ${reasoning}`);
  }

  return {
    cycle: state.cycle + 1,
    wallet: balances,
    lastReasoning: reasoning,
    startedAt: state.startedAt,
  };
}

export async function startAgent() {
  console.log("=== Basileus Agent Starting ===");
  console.log(`Chain: ${config.chain.name}`);
  console.log(`Model: ${config.llmModel}`);
  console.log(`Cycle interval: ${config.cycleIntervalMs}ms`);

  const wallet = await createAgentWallet(config.privateKey, config.chain);
  const llmClient = createLLMClient(config.privateKey);

  let state: AgentState = {
    cycle: 0,
    wallet: { address: "", ethBalance: "0", usdcBalance: "0", chainName: "" },
    lastReasoning: null,
    startedAt: new Date(),
  };

  // Run first cycle immediately
  state = await runCycle(state, wallet, llmClient);

  // Then run on interval
  setInterval(async () => {
    try {
      state = await runCycle(state, wallet, llmClient);
    } catch (err) {
      console.error("[agent] Cycle failed:", err);
    }
  }, config.cycleIntervalMs);
}
