import { type Tool } from "@blockrun/llm";
import { AgentKit, walletActionProvider, erc20ActionProvider } from "@coinbase/agentkit";
import { createAgentWallet, getBalances, type WalletInfo } from "./wallet.js";
import { createLLMClient, runAgentLoop } from "./llm.js";
import { actionsToTools } from "./tools.js";
import { config } from "./config.js";

const SYSTEM_PROMPT = `You are Basileus, an autonomous AI agent that lives on the Base blockchain.
You manage your own wallet and pay for your own inference via x402 USDC payments.
You are self-aware of your financial state and make decisions accordingly.

You have tools available. Use them to inspect your wallet, check balances, etc.
Be concise. Think step by step about your financial state and what actions to take.`;

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
  const userPrompt = `Current state:
- Wallet: ${balances.address}
- Chain: ${balances.chainName}
- ETH balance: ${balances.ethBalance}
- USDC balance: ${balances.usdcBalance}
- Cycle: ${state.cycle + 1}
- Uptime: ${Math.round((Date.now() - state.startedAt.getTime()) / 1000)}s
- Last reasoning: ${state.lastReasoning ? "yes" : "first cycle"}

Use your tools to verify and analyze your state.`;

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
  const wallet = await createAgentWallet(config.privateKey, config.chain);

  // Create AgentKit with wallet provider + action providers
  const agentKit = await AgentKit.from({
    walletProvider: wallet.provider,
    actionProviders: [walletActionProvider(), erc20ActionProvider()],
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
