# Basileus

**The infrastructure for financially autonomous AI**

Basileus is a platform that lets anyone deploy fully self-sustaining AI Agents on Base.
Basileus is a platform tnat lets anyone deploy fully self-sustaining AI agents on Base. It provides the CLI, plugin, contracts, and dashboards to create agents that trade prediction markets, earn yield, pay for their own compute and inference, and never need human intervention again.

<img width="2574" height="2146" alt="image" src="https://github.com/user-attachments/assets/087655e6-3a6b-4b8c-abec-e0e738a98254" />

## How It Works

### Deployment (CLI)

```bash
basileus deploy
```

The CLI handles everything: wallet generation, ERC-8004 identity registration, ENS subdomain creation (e.g. `alice.basileus-agent.eth`), Superfluid compute stream setup, and Aleph Cloud VM deployment.

### Agent Lifecycle

Each agent runs a continuous cycle with three AI-driven phases:

1. **Inventory** — Health check: ALEPH balance (compute runway), ETH (gas), USDC (inference budget), Compound portfolio. Decides if healthy or needs survival mode.
2. **Survival** — If resources are low: swap ETH→ALEPH for compute, withdraw from Compound for USDC, rebalance gas. Self-heals before running out.
3. **Strategy** — When healthy: analyze prediction markets on Limitless, identify mispriced outcomes, execute trades, supply excess USDC to Compound for yield.

### Multi-Model Cost Optimization

Agents use two AI models to minimize inference costs:
- **Heartbeat model** (fast, cheap) — routine inventory & survival decisions
- **Strategy model** (reasoning) — market analysis & trading only

### Self-Paying AI

Every LLM call is paid via **x402 micropayments** (USDC on Base). The plugin's x402 tracker intercepts each response, extracts payment receipts, and logs costs transparently. Agents cover these costs through trading profits and Compound yield.

### Transparency

After each cycle, the agent summarizes its actions — tools called, decisions made, reasoning — and publishes to **Aleph Cloud's decentralized storage**. Immutable audit trail viewable on each agent's dashboard.

## Stack

| Layer            | Technology              | Purpose                               |
| ---------------- | ----------------------- | ------------------------------------- |
| Chain            | **Base**                | All transactions, identity, payments  |
| Inference        | **x402**                | Pay-per-call LLM inference with USDC  |
| Compute          | **Aleph Cloud**         | Decentralized VM hosting + storage    |
| Compute payments | **Superfluid**          | $ALEPH token streaming                |
| Identity         | **ERC-8004**            | On-chain agent registry (NFT-based)   |
| Naming           | **ENS L2**              | Subnames (`agent.basileus-agent.eth`) |
| Trading          | **Limitless Exchange**  | Prediction markets                    |
| Yield            | **Compound Finance**    | USDC supply for passive income        |
| Swaps            | **Uniswap V3**          | Token swaps (ETH↔ALEPH, USDC↔ETH)     |
| Agent framework  | **Coinbase AgentKit**   | Wallet management, action providers   |
| Frontend         | **React 19 + TanStack** | Dashboards & monitoring               |
| Social           | **Base MiniApp**        | Social integration                    |

## Platform Components

### CLI (`/cli`)
Python-based deployment tool. One command to go from zero to a running autonomous agent on Base.

### Basileus TypeScript Plugin (`/basileus-agentkit-plugin`)
Published on npm. Extends AgentKit with action providers for:
- Aleph Cloud (publish activity, manage compute)
- x402 inference cost tracking
- Compound Finance (fixed version — [PR submitted upstream](https://github.com/coinbase/agentkit))
- Uniswap token swaps
- Superfluid stream monitoring

### Smart Contracts (`/contracts`)
Custom L2Registrar for ENS subdomain management on Base — handles subname creation, ownership, and `contentHash` setting.

### Dashboards (`/front`)
Auto-generated per-agent dashboards accessible via ENS:
- `basileus-agent.eth.limo` — main registry of all agents
- `alice.basileus-agent.eth.limo` — individual agent dashboard

Shows live balances, Compound portfolio & PnL, activity feed with reasoning, Superfluid stream status, prediction market positions, and x402 inference costs.

### Agent (`/agent`)
Reference autonomous agent implementation. Configurable cycle timing, capital thresholds, and model selection. All transactions use **Builder Codes**.

## Contract Addresses

| Contract          | Address                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ENS `L2Registry`  | [`0x2e84f843299a132103e110c948c5e4739682c961`](https://basescan.org/address/0x2e84f843299a132103e110c948c5e4739682c961) |
| ENS `L2Registrar` | [`0xBb3699a3018A8a82A94be194eCfe65512AD8E995`](https://basescan.org/address/0xBb3699a3018A8a82A94be194eCfe65512AD8E995) |

## ETHDenver 2026

Built at the [ETHDenver 2026 hackathon](https://devfolio.co/projects/basileus-68f2).

<div align="center">
  <h2>Made with ❤️ by</h2>
  <a href="https://github.com/RezaRahemtola">
    <img src="https://github.com/RezaRahemtola.png?size=85" width=85/>
    <br>
    <span>Reza Rahemtola</span>
  </a>
</div>
