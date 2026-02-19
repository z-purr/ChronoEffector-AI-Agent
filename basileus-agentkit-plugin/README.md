# basileus-agentkit-plugin

[Coinbase AgentKit](https://github.com/coinbase/agentkit) plugin for [Basileus](https://github.com/RezaRahemtola/ETHDenver-2026) — build autonomous onchain agents with [Aleph Cloud](https://aleph.cloud), x402 payment tracking, and predefined action providers.

## Features

- **Aleph Publisher** — publish agent activity (reasoning, tool calls, transactions) to Aleph Cloud for full transparency
- **x402 Tracker** — intercept HTTP 402 payments and track transaction hashes
- **Agent Loop** — BlockRun AI tool-calling loop with auto conversion of AgentKit actions to BlockRun tools.
- **Summarizer** — summarize agent phases into short, human-readable activity logs
- **Wallet** — create an AgentKit wallet with Basileus' ERC-8021 builder code attribution
- **Compound Actions** — fixed Compound Finance action provider (supply, withdraw, portfolio)
- **Limitless Actions** - action provider for Limitless prediction market
- **Aleph Actions** — VPS computing costs information, balance tracking and swaps action provider for built-in self-funding of computing costs

## Install

```bash
npm install basileus-agentkit-plugin
```

Peer dependencies (install alongside):

```bash
npm install @blockrun/llm @coinbase/agentkit viem
```

## Usage

```ts
import {
  AlephPublisher,
  installX402Tracker,
  actionsToTools,
  runAgentLoop,
  createLLMClient,
  createAgentWallet,
} from "basileus-agentkit-plugin";
```

### Sub-path imports

```ts
// Individual modules
import { AlephPublisher } from "basileus-agentkit-plugin/aleph";
import { installX402Tracker } from "basileus-agentkit-plugin/x402";
import { runAgentLoop } from "basileus-agentkit-plugin/agent-loop";
import { actionsToTools } from "basileus-agentkit-plugin/tools";
import { summarizePhase } from "basileus-agentkit-plugin/summarizer";
import { createAgentWallet } from "basileus-agentkit-plugin/wallet";

// Action providers
import { createAlephActionProvider } from "basileus-agentkit-plugin/actions/aleph";
import { compoundFixedProvider } from "basileus-agentkit-plugin/actions/compound";
```

### Quick start

```ts
import { createAgentWallet, AlephPublisher, actionsToTools, runAgentLoop, createLLMClient, installX402Tracker, drainX402TxHashes } from "basileus-agentkit-plugin";
import { createAlephActionProvider } from "basileus-agentkit-plugin/actions/aleph";
import { compoundFixedProvider } from "basileus-agentkit-plugin/actions/compound";

// 1. Wallet
const wallet = await createAgentWallet(process.env.PRIVATE_KEY!, "base");

// 2. x402 tracking
installX402Tracker();

// 3. Action providers → tools
const providers = [compoundFixedProvider, createAlephActionProvider()];
const { tools, executeTool } = actionsToTools(providers, wallet);

// 4. Aleph publisher
const publisher = new AlephPublisher(process.env.PRIVATE_KEY!);
await publisher.init();

// 5. Run agent loop
const client = createLLMClient(process.env.BLOCKRUN_API_KEY!);
const result = await runAgentLoop(client, "What is my Compound portfolio?", tools, "You are a DeFi agent.", [], executeTool);

// 6. Publish activity
const txHashes = drainX402TxHashes();
await publisher.publish({ phase: "portfolio-check", response: result.response, toolExecutions: result.toolExecutions, txHashes });
```

## License

MIT

<div align="center">
  <h2>Made with ❤️ by</h2>
  <a href="https://github.com/RezaRahemtola">
    <img src="https://github.com/RezaRahemtola.png?size=85" width=85/>
    <br>
    <span>Reza Rahemtola</span>
  </a>
</div>
