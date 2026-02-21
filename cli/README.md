# Basileus CLI

Deploy and manage autonomous AI agents on Base — from zero to a running self-sustaining agent in one command.

## Install

```bash
pip install basileus
```

## Commands

### `basileus deploy`

Full end-to-end deployment of a new agent:

1. **Wallet setup** — generates a new Base wallet (or reuses existing from `.env.prod`)
2. **Funding** — prompts you to send ETH, then auto-swaps to ALEPH (compute) + USDC (inference)
3. **ENS subdomain** — registers `<name>.basileus-agent.eth` and sets `contentHash` for the dashboard
4. **ERC-8004 identity** — uploads metadata to IPFS and registers the agent on-chain
5. **Aleph Cloud VM** — creates a compute instance, sets up Superfluid payment streams (operator + community)
6. **Code deployment** — uploads agent code via SSH, installs Node.js + deps, configures systemd service

```bash
basileus deploy [PATH]
```

| Option      | Default     | Description                               |
| ----------- | ----------- | ----------------------------------------- |
| `PATH`      | `.`         | Path to agent directory                   |
| `--min-eth` | `0.02`      | Minimum ETH to wait for before proceeding |
| `--ssh-key` | auto-detect | Path to SSH public key                    |

### `basileus register`

Register an already-deployed agent on the ERC-8004 IdentityRegistry. Useful if deployment was interrupted after the VM was created but before on-chain registration completed.

```bash
basileus register [PATH]
```

Requires an existing wallet (`.env.prod`) and ENS subname.

### `basileus set-content-hash`

Update the ENS `contentHash` for an agent's subname. Used when the frontend IPFS hash changes and dashboards need to point to the new version.

```bash
basileus set-content-hash [PATH]
```

### `basileus stop`

Tear down a running agent — deletes Aleph Cloud instance and closes Superfluid payment streams.

```bash
basileus stop [PATH]
```

Prompts for confirmation before proceeding. Shows what resources will be deleted.

## What Happens Under the Hood

```
basileus deploy
│
├─ Wallet
│  ├─ Generate keypair (or load from .env.prod)
│  └─ Write WALLET_PRIVATE_KEY + BUILDER_CODE to .env.prod
│
├─ Funding
│  ├─ Wait for ETH deposit to agent address
│  ├─ Swap ETH → ALEPH (~10 tokens for compute)
│  ├─ Swap ETH → USDC (for x402 inference payments)
│  └─ Reserve 0.001 ETH for gas
│
├─ ENS
│  ├─ Register <name>.basileus-agent.eth via L2Registrar
│  └─ Set contentHash (IPFS pointer to dashboard frontend)
│
├─ ERC-8004
│  ├─ Build agent metadata (name, description, services)
│  ├─ Upload metadata to IPFS via Aleph
│  └─ Register on IdentityRegistry (mint agent NFT)
│
├─ Aleph Cloud
│  ├─ Create compute instance on CRN
│  ├─ Compute Superfluid flow rates
│  ├─ Create operator payment stream (ALEPH)
│  ├─ Create community payment stream (ALEPH)
│  ├─ Notify CRN for allocation
│  └─ Wait for instance to come up
│
└─ Code Deployment
   ├─ Wait for SSH access
   ├─ Upload agent source code
   ├─ Install Node.js runtime
   ├─ Install npm dependencies
   ├─ Configure systemd service
   └─ Verify service is running
```

## Dependencies

- [web3.py](https://github.com/ethereum/web3.py) — Ethereum interactions
- [aleph-sdk-python](https://github.com/aleph-im/aleph-sdk-python) — Aleph Cloud instance management + IPFS
- [paramiko](https://github.com/paramiko/paramiko) — SSH for VM deployment
- [typer](https://github.com/tiangolo/typer) + [rich](https://github.com/Textualize/rich) — CLI interface

## Development

```bash
cd cli
poetry install
poetry run basileus --help
```
