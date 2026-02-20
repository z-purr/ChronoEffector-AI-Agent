import { type Tool } from "@blockrun/llm";
import { AgentKit, erc20ActionProvider, walletActionProvider } from "@coinbase/agentkit";
import {
  actionsToTools,
  AlephPublisher,
  compoundFixedProvider,
  createAgentWallet,
  createAlephActionProvider,
  createLLMClient,
  drainX402TxHashes,
  getBalances,
  installX402Tracker,
  runAgentLoop,
  summarizePhase,
  type ToolExecution,
  type WalletInfo,
} from "basileus-agentkit-plugin";
import { createLimitlessActionProvider } from "./actions/limitless/index.js";
import { basileusTriggerProvider } from "./actions/basileus.js";
import { config } from "./config.js";

const INVENTORY_PROMPT = `You are Basileus, an autonomous AI agent on Base blockchain.
You pay for compute via an ALEPH Superfluid stream. You pay for inference with USDC via x402.

Your job this phase: CHECK HEALTH + CAPITAL INVENTORY.

1. Call get_aleph_info → check ALEPH balance, burn rate, hours left
2. Check your ETH balance (for gas) and idle USDC balance
3. Call compound_get_portfolio → check USDC supplied in Compound
4. Call limitless_redeem_positions → redeem any resolved winning prediction market positions back to USDC

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

const STRATEGY_PROMPT = `You are Basileus, an autonomous AI agent trading prediction markets on Limitless Exchange (Base chain).

STEP 1 (MANDATORY): Call limitless_get_markets. Never skip this. Never hallucinate market data.

STEP 2: For each market, evaluate whether to trade:

READING THE DATA:
- pctDiff: how far spot price is from strike. Positive = spot ABOVE strike (favors YES). Negative = spot BELOW strike (favors NO).
- buyYes/buyNo: best available price, shares, and estimatedFee (taker fee %) for each side. Lower fee when buying high-probability outcomes (price > 0.5).
- minutesRemaining: minutes until market resolves.

DECISION FRAMEWORK:
1. Determine the favored side from pctDiff sign. pctDiff > 0 → YES likely wins. pctDiff < 0 → NO likely wins.
2. Check if the favored side's share price is cheap relative to the implied probability. The key question: does the share price already reflect the pctDiff, or is there room for it to move toward 1.0?
3. Time amplifies conviction: if minutesRemaining is low (< 120) and pctDiff is strong, the outcome is nearly decided — the share price should be close to 1.0. If it isn't, that's your edge.
4. Time adds uncertainty: if minutesRemaining is high (> 360), spot could still reverse — require a stronger pctDiff to act.
5. Prefer buying the favored side when its price is > 0.5 (lower taker fees: ~0.03-1.5%) over contrarian bets at < 0.5 (fees up to 3%).
6. You hold to resolution. Shares pay $1 if correct, $0 if wrong. Your profit = $1 - buyPrice - fee.

WHEN TO TRADE:
- You SHOULD trade when you see a clear edge. Do not be overly cautious — you are here to make money.
- Max ${config.maxTradeUsdc} USDC per trade.
- You may withdraw from Compound to fund a trade, but NOT to rebalance.

STEP 3: After trading decisions, supply any idle USDC above ${config.usdcIdleTarget} to Compound.

CAPITAL RULES:
- Never go below ${config.usdcSurvivalThreshold} USDC idle (survival minimum).
- Do NOT rebalance — that is survival's job.
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
  txHashes: string[];
}

interface TriggerInfo {
  kind: "survival" | "strategy";
  args: Record<string, string>;
}

interface ToolSet {
  tools: Tool[];
  exec: (name: string, argsJson: string) => Promise<string>;
}

export async function runCycle(
  state: AgentState,
  wallet: Awaited<ReturnType<typeof createAgentWallet>>,
  llmClient: ReturnType<typeof createLLMClient>,
  toolSets: {
    inventory: ToolSet;
    survival: ToolSet;
    strategy: ToolSet;
  },
  publisher: AlephPublisher,
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
      toolSets.inventory.tools,
      toolSets.inventory.exec,
    );

    phases.push({
      type: "inventory",
      model: config.heartbeatModel,
      reasoning: result.response,
      toolExecutions: result.toolExecutions,
      txHashes: result.txHashes,
    });

    console.log(`[inventory] ${result.response}`);

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
    await publisher.publish("error", {
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
        toolSets.survival.tools,
        toolSets.survival.exec,
      );

      phases.push({
        type: "survival",
        model: config.heartbeatModel,
        reasoning: result.response,
        toolExecutions: result.toolExecutions,
        txHashes: result.txHashes,
      });

      console.log(`[survival] ${result.response}`);
    } catch (err) {
      const errMsg = `Survival error: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[survival] ${errMsg}`);
      phases.push({
        type: "survival",
        model: config.heartbeatModel,
        reasoning: errMsg,
        toolExecutions: [],
        txHashes: [],
      });
    }
  } else if (trigger?.kind === "strategy") {
    console.log(`[strategy] Triggered — excess: ${trigger.args.excessAmount ?? "0"} USDC`);
    try {
      const userPrompt = `Idle USDC: ${trigger.args.idleUsdc ?? "?"} | Compound USDC: ${trigger.args.compoundUsdc ?? "?"} | Max per trade: ${config.maxTradeUsdc} USDC
Survival minimum: ${config.usdcSurvivalThreshold} | Idle target: ${config.usdcIdleTarget}

Scan markets and trade if you find an edge. Then handle Compound.`;

      const result = await runAgentLoop(
        llmClient,
        config.strategyModel,
        STRATEGY_PROMPT,
        userPrompt,
        toolSets.strategy.tools,
        toolSets.strategy.exec,
      );

      phases.push({
        type: "strategy",
        model: config.strategyModel,
        reasoning: result.response,
        toolExecutions: result.toolExecutions,
        txHashes: result.txHashes,
      });

      console.log(`[strategy] ${result.response}`);
    } catch (err) {
      const errMsg = `Strategy error: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[strategy] ${errMsg}`);
      phases.push({
        type: "strategy",
        model: config.strategyModel,
        reasoning: errMsg,
        toolExecutions: [],
        txHashes: [],
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

    const allTxHashes =
      phase === phases[phases.length - 1]
        ? [...phase.txHashes, ...inferenceTxHashes]
        : [...phase.txHashes];

    await publisher.publish(phase.type, {
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

  const publisher = new AlephPublisher(config.privateKey);
  await publisher.init();

  const wallet = await createAgentWallet(config.privateKey, config.chain, config.rpcUrl);

  // All actions from all providers, then filter per phase
  const limitlessProvider = config.limitlessApiKey
    ? createLimitlessActionProvider(config.limitlessApiKey, config.privateKey)
    : null;

  const allKit = await AgentKit.from({
    walletProvider: wallet.provider,
    actionProviders: [
      walletActionProvider(),
      erc20ActionProvider(),
      createAlephActionProvider(config.rpcUrl),
      compoundFixedProvider,
      basileusTriggerProvider,
      ...(limitlessProvider ? [limitlessProvider] : []),
    ],
  });

  const allActions = allKit.getActions();
  // Deduplicate (customActionProvider prototype pollution causes duplicates)
  const dedupedActions = [...new Map(allActions.map((a) => [a.name, a])).values()];
  const pick = (names: string[]) =>
    dedupedActions.filter((a) => names.some((n) => a.name.endsWith(n)));

  // Inventory: read-only checks + triggers (no transfers, no supply)
  const inventoryActions = pick([
    "get_aleph_info",
    "get_portfolio",
    "redeem_positions",
    "trigger_survival",
    "trigger_strategy",
  ]);

  // Survival: fix resource issues (swap ALEPH, withdraw from Compound)
  const survivalActions = pick(["swap_eth_to_aleph", "withdraw", "approve", "get_balance"]);

  // Strategy: Limitless markets + Compound yield
  const strategyActions = pick([
    "supply",
    "withdraw",
    "approve",
    "get_balance",
    "get_markets",
    "buy_market_order",
  ]);

  const { tools: inventoryTools, executeTool: execInventory } = actionsToTools(inventoryActions);
  const { tools: survivalTools, executeTool: execSurvival } = actionsToTools(survivalActions);
  const { tools: strategyTools, executeTool: execStrategy } = actionsToTools(strategyActions);

  const toolSets = {
    inventory: { tools: inventoryTools, exec: execInventory },
    survival: { tools: survivalTools, exec: execSurvival },
    strategy: { tools: strategyTools, exec: execStrategy },
  };

  console.log(
    `[agentkit] Inventory: ${toolSets.inventory.tools.length} tools | Survival: ${toolSets.survival.tools.length} tools | Strategy: ${toolSets.strategy.tools.length} tools`,
  );

  installX402Tracker();
  const llmClient = createLLMClient(config.privateKey);

  let state: AgentState = {
    cycle: 0,
    wallet: { address: "", ethBalance: "0", usdcBalance: "0", chainName: "" },
    lastReasoning: null,
    startedAt: new Date(),
  };

  state = await runCycle(state, wallet, llmClient, toolSets, publisher);

  // Use setTimeout loop to prevent re-entrance (cycles can exceed interval)
  const scheduleNext = () => {
    setTimeout(async () => {
      try {
        state = await runCycle(state, wallet, llmClient, toolSets, publisher);
      } catch (err) {
        console.error("[agent] Cycle failed:", err);
      }
      scheduleNext();
    }, config.cycleIntervalMs);
  };
  scheduleNext();
}
