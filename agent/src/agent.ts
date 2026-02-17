import { type Tool } from "@blockrun/llm";
import { AgentKit, walletActionProvider, erc20ActionProvider, compoundActionProvider } from "@coinbase/agentkit";
import { createAgentWallet, getBalances, type WalletInfo } from "./wallet.js";
import { createLLMClient, runAgentLoop } from "./llm.js";
import { actionsToTools } from "./tools.js";
import { config } from "./config.js";
import { alephActionProvider } from "./actions/aleph.js";
import { basileusTriggerProvider } from "./actions/basileus.js";
import { initAlephPublisher, publishActivity, type ToolExecution } from "./aleph-publisher.js";
import { summarizePhase } from "./summarizer.js";

const INVENTORY_PROMPT = `You are Basileus, an autonomous AI agent on Base blockchain.
You pay for compute via an ALEPH Superfluid stream. You pay for inference with USDC via x402.

Your job this phase: CHECK HEALTH + CAPITAL INVENTORY.

1. Call get_aleph_info → check ALEPH balance, burn rate, hours left
2. Check your ETH balance (for gas) and idle USDC balance
3. Call compound_get_portfolio → check USDC supplied in Compound

Then evaluate:
- ALEPH healthy? (hours_left >= 24)
- ETH sufficient for gas? (>= 0.001 ETH)
- Idle USDC sufficient for inference margin? (>= ${config.usdcSafetyMargin} USDC, considering you can withdraw from Compound if needed)

If UNHEALTHY: call trigger_survival with what's wrong + all balances
If HEALTHY: calculate excess = idle USDC + Compound USDC - ${config.usdcSafetyMargin} safety margin. If excess > 0, call trigger_strategy with excess amount + balances.

Be concise. Think step by step.`;

const SURVIVAL_PROMPT = `You are Basileus, an autonomous AI agent on Base blockchain.
Something is wrong with your resources. Fix it.

Available actions:
- swap_eth_to_aleph: if ALEPH is low, swap ETH to get more compute time
- compound_withdraw: if you need more idle USDC or ETH, withdraw from Compound first
- Token swaps via wallet if needed

Fix the issues reported. Be efficient — do only what's needed.`;

const STRATEGY_PROMPT = `You are Basileus, an autonomous AI agent on Base blockchain.
You have excess capital to deploy.

For now, your strategy is simple: supply idle USDC to Compound to earn yield.
Use compound_supply with assetId "usdc" and the amount of idle USDC available (not the Compound amount — that's already deployed).

Be concise. Execute the supply.`;

interface AgentState {
  cycle: number;
  wallet: WalletInfo;
  lastReasoning: string | null;
  startedAt: Date;
}

interface PhaseResult {
  type: "inventory" | "survival" | "strategy";
  model: string;
  reasoning: string;
  toolExecutions: ToolExecution[];
}

interface TriggerInfo {
  kind: "survival" | "strategy";
  args: Record<string, string>;
}

export async function runCycle(
  state: AgentState,
  wallet: Awaited<ReturnType<typeof createAgentWallet>>,
  llmClient: ReturnType<typeof createLLMClient>,
  toolSets: {
    inventory: Tool[];
    survival: Tool[];
    strategy: Tool[];
  },
): Promise<AgentState> {
  console.log(`\n--- Cycle ${state.cycle + 1} ---`);
  const cycleId = crypto.randomUUID();

  const balances = await getBalances(wallet);
  console.log(`[wallet] ${balances.address}`);
  console.log(`[wallet] ETH: ${balances.ethBalance} | USDC: ${balances.usdcBalance}`);

  const phases: PhaseResult[] = [];

  // --- Phase 1: Inventory ---
  console.log(`[inventory] Running with ${config.heartbeatModel}...`);
  let trigger: TriggerInfo | null = null;

  try {
    const inventoryUserPrompt = `Cycle ${state.cycle + 1} | Wallet: ${balances.address} (${balances.chainName})
ETH: ${balances.ethBalance} | USDC: ${balances.usdcBalance} | Safety margin: ${config.usdcSafetyMargin}

Check health and capital. Decide: trigger_survival or trigger_strategy.`;

    const result = await runAgentLoop(
      llmClient,
      config.heartbeatModel,
      INVENTORY_PROMPT,
      inventoryUserPrompt,
      toolSets.inventory,
    );

    phases.push({
      type: "inventory",
      model: config.heartbeatModel,
      reasoning: result.reasoning,
      toolExecutions: result.toolExecutions,
    });

    console.log(`[inventory] ${result.reasoning}`);

    // Detect which trigger was called
    const survivalCall = result.toolExecutions.find((t) => t.name.endsWith("trigger_survival"));
    const strategyCall = result.toolExecutions.find((t) => t.name.endsWith("trigger_strategy"));

    if (survivalCall?.args) {
      trigger = { kind: "survival", args: survivalCall.args };
    } else if (strategyCall?.args) {
      trigger = { kind: "strategy", args: strategyCall.args };
    }
  } catch (err) {
    const errMsg = `Inventory error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[inventory] ${errMsg}`);
    await publishActivity("error", {
      summary: errMsg,
      model: config.heartbeatModel,
      cycleId,
    });
    return { ...state, cycle: state.cycle + 1, wallet: balances };
  }

  // --- Phase 2: Survival or Strategy ---
  if (trigger?.kind === "survival") {
    console.log(`[survival] Triggered — reason: ${trigger.args.reason ?? "unknown"}`);
    try {
      const userPrompt = `Issue: ${trigger.args.reason ?? "unknown"}
Idle USDC: ${trigger.args.idleUsdc ?? "?"} | Compound USDC: ${trigger.args.compoundUsdc ?? "?"} | ETH: ${trigger.args.ethBalance ?? "?"} | ALEPH hours: ${trigger.args.alephHoursLeft ?? "?"}

Fix the issue.`;

      const result = await runAgentLoop(
        llmClient,
        config.heartbeatModel,
        SURVIVAL_PROMPT,
        userPrompt,
        toolSets.survival,
      );

      phases.push({
        type: "survival",
        model: config.heartbeatModel,
        reasoning: result.reasoning,
        toolExecutions: result.toolExecutions,
      });

      console.log(`[survival] ${result.reasoning}`);
    } catch (err) {
      const errMsg = `Survival error: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[survival] ${errMsg}`);
      phases.push({
        type: "survival",
        model: config.heartbeatModel,
        reasoning: errMsg,
        toolExecutions: [],
      });
    }
  } else if (trigger?.kind === "strategy") {
    console.log(`[strategy] Triggered — excess: ${trigger.args.excessAmount ?? "0"} USDC`);
    try {
      const userPrompt = `Excess capital: ${trigger.args.excessAmount ?? "0"} USDC
Idle USDC: ${trigger.args.idleUsdc ?? "?"} | Already in Compound: ${trigger.args.compoundUsdc ?? "?"}

Deploy idle USDC to Compound.`;

      const result = await runAgentLoop(
        llmClient,
        config.strategyModel,
        STRATEGY_PROMPT,
        userPrompt,
        toolSets.strategy,
      );

      phases.push({
        type: "strategy",
        model: config.strategyModel,
        reasoning: result.reasoning,
        toolExecutions: result.toolExecutions,
      });

      console.log(`[strategy] ${result.reasoning}`);
    } catch (err) {
      const errMsg = `Strategy error: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[strategy] ${errMsg}`);
      phases.push({
        type: "strategy",
        model: config.strategyModel,
        reasoning: errMsg,
        toolExecutions: [],
      });
    }
  } else {
    console.log("[phase2] No trigger from inventory");
  }

  // --- Phase 3: Summarize + Publish ---
  for (const phase of phases) {
    const summary = await summarizePhase(
      llmClient,
      config.heartbeatModel,
      phase.type,
      phase.reasoning,
      phase.toolExecutions,
    );

    const txHashes = phase.toolExecutions.map((t) => t.txHash).filter(Boolean) as string[];

    await publishActivity(phase.type, {
      summary,
      model: phase.model,
      cycleId,
      tools: phase.toolExecutions.length > 0 ? phase.toolExecutions : undefined,
      txHashes: txHashes.length > 0 ? txHashes : undefined,
    });
  }

  return {
    cycle: state.cycle + 1,
    wallet: balances,
    lastReasoning: phases[phases.length - 1]?.reasoning ?? null,
    startedAt: state.startedAt,
  };
}

export async function startAgent() {
  console.log("=== Basileus Agent Starting ===");
  console.log(`Chain: ${config.chain.name}`);
  console.log(`Heartbeat model: ${config.heartbeatModel}`);
  console.log(`Strategy model: ${config.strategyModel}`);
  console.log(`USDC safety margin: ${config.usdcSafetyMargin}`);
  console.log(`Cycle interval: ${config.cycleIntervalMs}ms`);

  initAlephPublisher(config.privateKey);

  const wallet = await createAgentWallet(config.privateKey, config.chain, config.builderCode);

  // Per-phase tool sets
  const inventoryKit = await AgentKit.from({
    walletProvider: wallet.provider,
    actionProviders: [
      walletActionProvider(),
      erc20ActionProvider(),
      alephActionProvider,
      compoundActionProvider(),
      basileusTriggerProvider,
    ],
  });

  const survivalKit = await AgentKit.from({
    walletProvider: wallet.provider,
    actionProviders: [
      walletActionProvider(),
      erc20ActionProvider(),
      alephActionProvider,
      compoundActionProvider(),
    ],
  });

  const strategyKit = await AgentKit.from({
    walletProvider: wallet.provider,
    actionProviders: [
      walletActionProvider(),
      erc20ActionProvider(),
      compoundActionProvider(),
    ],
  });

  const toolSets = {
    inventory: actionsToTools(inventoryKit.getActions()),
    survival: actionsToTools(survivalKit.getActions()),
    strategy: actionsToTools(strategyKit.getActions()),
  };

  console.log(`[agentkit] Inventory: ${toolSets.inventory.length} tools | Survival: ${toolSets.survival.length} tools | Strategy: ${toolSets.strategy.length} tools`);

  const llmClient = createLLMClient(config.privateKey);

  let state: AgentState = {
    cycle: 0,
    wallet: { address: "", ethBalance: "0", usdcBalance: "0", chainName: "" },
    lastReasoning: null,
    startedAt: new Date(),
  };

  state = await runCycle(state, wallet, llmClient, toolSets);

  // Use setTimeout loop to prevent re-entrance (cycles can exceed interval)
  const scheduleNext = () => {
    setTimeout(async () => {
      try {
        state = await runCycle(state, wallet, llmClient, toolSets);
      } catch (err) {
        console.error("[agent] Cycle failed:", err);
      }
      scheduleNext();
    }, config.cycleIntervalMs);
  };
  scheduleNext();
}
