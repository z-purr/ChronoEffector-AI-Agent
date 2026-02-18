import { type Tool } from "@blockrun/llm";
import { AgentKit, erc20ActionProvider, walletActionProvider } from "@coinbase/agentkit";
import { alephActionProvider } from "./actions/aleph.js";
import { basileusTriggerProvider } from "./actions/basileus.js";
import { compoundFixedProvider } from "./actions/compound/index.js";
import { initAlephPublisher, publishActivity, type ToolExecution } from "./aleph-publisher.js";
import { config } from "./config.js";
import { createLLMClient, runAgentLoop } from "./llm.js";
import { summarizePhase } from "./summarizer.js";
import { actionsToTools } from "./tools.js";
import { createAgentWallet, getBalances, type WalletInfo } from "./wallet.js";
import { drainX402TxHashes, installX402Tracker } from "./x402-tracker.js";

const INVENTORY_PROMPT = `You are Basileus, an autonomous AI agent on Base blockchain.
You pay for compute via an ALEPH Superfluid stream. You pay for inference with USDC via x402.

Your job this phase: CHECK HEALTH + CAPITAL INVENTORY.

1. Call get_aleph_info → check ALEPH balance, burn rate, hours left
2. Check your ETH balance (for gas) and idle USDC balance
3. Call compound_get_portfolio → check USDC supplied in Compound

Then evaluate:
- ALEPH healthy? (hours_left >= 24)
- ETH sufficient for gas? (>= ${config.ethMinBalance} ETH)
- Idle USDC sufficient for inference? (>= ${config.usdcSurvivalThreshold} USDC, considering you can withdraw from Compound if needed)

If UNHEALTHY (idle USDC + Compound USDC < ${config.usdcSurvivalThreshold}): call trigger_survival with what's wrong + all balances.
If HEALTHY: calculate excess = idle USDC + Compound USDC - ${config.usdcIdleTarget}. If excess > 0, call trigger_strategy with excess amount + balances. The idle target (${config.usdcIdleTarget}) is higher than the survival threshold (${config.usdcSurvivalThreshold}) to leave a buffer for operational costs between cycles.

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
IMPORTANT: You MUST keep ${config.usdcIdleTarget} USDC idle in the wallet — this is raw USDC needed for inference payments.
Only supply USDC from idle that is ABOVE the idle target. The amount you can supply = idleUsdc - ${config.usdcIdleTarget}.
If that is <= 0, the excess is already deployed — do nothing.
Otherwise, use the Compound supply tool to supply that amount.

Be concise.`;

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
ETH: ${balances.ethBalance} | USDC: ${balances.usdcBalance} | Survival threshold: ${config.usdcSurvivalThreshold} | Idle target: ${config.usdcIdleTarget}

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
      const userPrompt = `Total excess capital: ${trigger.args.excessAmount ?? "0"} USDC (idle + compound - idle target)
Idle USDC: ${trigger.args.idleUsdc ?? "?"} | Already in Compound: ${trigger.args.compoundUsdc ?? "?"} | Idle target: ${config.usdcIdleTarget}

Calculate availableToSupply = idle USDC - idle target. If <= 0, the excess is already deployed — do nothing. Otherwise supply that amount.`;

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
  const inferenceTxHashes = drainX402TxHashes();
  if (inferenceTxHashes.length > 0) {
    console.log(
      `[x402] Drained ${inferenceTxHashes.length} inference tx hashes: ${inferenceTxHashes.join(", ")}`,
    );
  }

  for (const phase of phases) {
    const summary = await summarizePhase(
      llmClient,
      config.heartbeatModel,
      phase.type,
      phase.reasoning,
      phase.toolExecutions,
    );

    const toolTxHashes = phase.toolExecutions.map((t) => t.txHash).filter(Boolean) as string[];
    const allTxHashes =
      phase === phases[phases.length - 1] ? [...toolTxHashes, ...inferenceTxHashes] : toolTxHashes;

    await publishActivity(phase.type, {
      summary,
      model: phase.model,
      cycleId,
      tools: phase.toolExecutions.length > 0 ? phase.toolExecutions : undefined,
      txHashes: allTxHashes.length > 0 ? allTxHashes : undefined,
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
  console.log(
    `USDC survival threshold: ${config.usdcSurvivalThreshold} | idle target: ${config.usdcIdleTarget}`,
  );
  console.log(`Cycle interval: ${config.cycleIntervalMs}ms`);

  initAlephPublisher(config.privateKey);

  const wallet = await createAgentWallet(config.privateKey, config.chain, config.builderCode);

  // All actions from all providers, then filter per phase
  const allKit = await AgentKit.from({
    walletProvider: wallet.provider,
    actionProviders: [
      walletActionProvider(),
      erc20ActionProvider(),
      alephActionProvider,
      compoundFixedProvider,
      basileusTriggerProvider,
    ],
  });

  const allActions = allKit.getActions();
  const pick = (names: string[]) => allActions.filter((a) => names.some((n) => a.name.endsWith(n)));

  // Inventory: read-only checks + triggers (no transfers, no supply)
  const inventoryActions = pick([
    "get_aleph_info",
    "get_portfolio",
    "trigger_survival",
    "trigger_strategy",
  ]);

  // Survival: fix resource issues (swap ALEPH, withdraw from Compound)
  const survivalActions = pick(["swap_eth_to_aleph", "withdraw", "approve", "get_balance"]);

  // Strategy: deploy capital (supply to Compound)
  const strategyActions = pick(["supply", "approve", "get_balance"]);

  const toolSets = {
    inventory: actionsToTools(inventoryActions),
    survival: actionsToTools(survivalActions),
    strategy: actionsToTools(strategyActions),
  };

  console.log(
    `[agentkit] Inventory: ${toolSets.inventory.length} tools | Survival: ${toolSets.survival.length} tools | Strategy: ${toolSets.strategy.length} tools`,
  );

  installX402Tracker();
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
