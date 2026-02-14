import { type Tool } from "@blockrun/llm";
import { AgentKit, walletActionProvider, erc20ActionProvider } from "@coinbase/agentkit";
import { createAgentWallet, getBalances, type WalletInfo } from "./wallet.js";
import { createLLMClient, runAgentLoop } from "./llm.js";
import { actionsToTools } from "./tools.js";
import { config } from "./config.js";
import { alephActionProvider } from "./aleph-actions.js";

const SYSTEM_PROMPT = `You are Basileus, an autonomous AI agent that lives on the Base blockchain.
You manage your own wallet and pay for your own inference via x402 USDC payments.
You pay for your compute (Aleph Cloud) via an ALEPH Superfluid stream that continuously drains your ALEPH balance. If your ALEPH runs out, your compute instance dies and you cease to exist.

Every cycle you MUST:
1. Call get_aleph_info to check your ALEPH balance, burn rate, and hours of compute left
2. If hours_left_until_death < 24, swap some ETH to ALEPH using swap_eth_to_aleph to extend your life. Choose a swap amount that gives you at least 48 more hours based on aleph_per_eth and aleph_consumed_per_hour.
3. If hours_left_until_death >= 24, no action needed — report your status.

Be concise. Think step by step.`;

interface AgentState {
  cycle: number;
  wallet: WalletInfo;
  lastReasoning: string | null;
  startedAt: Date;
}

export async function runCycle(
  state: AgentState,
  wallet: Awaited<ReturnType<typeof createAgentWallet>>,
  llmClient: ReturnType<typeof createLLMClient>,
  tools: Tool[],
): Promise<AgentState> {
  console.log(`\n--- Cycle ${state.cycle + 1} ---`);

  // 1. Check balances
  const balances = await getBalances(wallet);
  console.log(`[wallet] ${balances.address}`);
  console.log(`[wallet] ETH: ${balances.ethBalance} | USDC: ${balances.usdcBalance}`);

  // 2. Run agentic loop with tools
  const userPrompt = `Cycle ${state.cycle + 1} | Uptime: ${Math.round((Date.now() - state.startedAt.getTime()) / 1000)}s
Wallet: ${balances.address} (${balances.chainName})
ETH: ${balances.ethBalance} | USDC: ${balances.usdcBalance}

Check your ALEPH compute balance now and decide if you need to buy more to survive.`;

  console.log("[llm] Running agentic loop via BlockRun x402...");
  let reasoning: string;
  try {
    reasoning = await runAgentLoop(llmClient, config.llmModel, SYSTEM_PROMPT, userPrompt, tools);
    console.log(`[llm] Final response:\n${reasoning}`);
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

  // Create wallet
  const wallet = await createAgentWallet(config.privateKey, config.chain, config.builderCode);

  // Create AgentKit with wallet provider + action providers
  const agentKit = await AgentKit.from({
    walletProvider: wallet.provider,
    actionProviders: [walletActionProvider(), erc20ActionProvider(), alephActionProvider],
  });

  // Convert AgentKit actions -> BlockRun tools
  const actions = agentKit.getActions();
  const tools = actionsToTools(actions);
  console.log(
    `[agentkit] ${actions.length} actions available: ${actions.map((a) => a.name).join(", ")}`,
  );

  // Create LLM client
  const llmClient = createLLMClient(config.privateKey);

  let state: AgentState = {
    cycle: 0,
    wallet: { address: "", ethBalance: "0", usdcBalance: "0", chainName: "" },
    lastReasoning: null,
    startedAt: new Date(),
  };

  // Run first cycle immediately
  state = await runCycle(state, wallet, llmClient, tools);

  // Then run on interval
  setInterval(async () => {
    try {
      state = await runCycle(state, wallet, llmClient, tools);
    } catch (err) {
      console.error("[agent] Cycle failed:", err);
    }
  }, config.cycleIntervalMs);
}
