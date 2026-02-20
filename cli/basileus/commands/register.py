import asyncio
from pathlib import Path

import typer
from rich import print as rprint
from rich.console import Console
from web3 import Web3

from basileus.chain.constants import BASE_RPC_URL
from basileus.chain.ens import check_existing_subname
from basileus.chain.erc8004 import (
    build_agent_metadata,
    check_existing_registration,
    register_agent,
    upload_metadata_to_ipfs,
)
from basileus.chain.wallet import load_existing_wallet
from basileus.infra.aleph import get_aleph_account
from basileus.ui import _fail, _run_step

console = Console()


async def register_command(
    path: Path = typer.Argument(
        None,
        help="Path to agent directory (default: current working directory)",
    ),
) -> None:
    """Register an existing Basileus agent on the ERC-8004 IdentityRegistry."""

    if path is None:
        path = Path.cwd()
    path = path.resolve()

    console.rule("[bold blue]ERC-8004 Agent Registration")
    rprint()

    # Load wallet
    existing = load_existing_wallet(path)
    if not existing:
        _fail("Loading wallet", RuntimeError("No wallet found in .env.prod or .env"))
    assert existing is not None
    address, private_key = existing
    rprint(f"  [green]Wallet:[/green] {address}")

    w3 = Web3(Web3.HTTPProvider(BASE_RPC_URL))

    # Check ENS
    label = check_existing_subname(w3, address)
    if not label:
        _fail(
            "Checking ENS",
            RuntimeError("No ENS subname found. Run `basileus deploy` first."),
        )
    assert label is not None
    ens_name = f"{label}.basileus-agent.eth"
    rprint(f"  [green]ENS:[/green] {ens_name}")

    # Check existing registration
    existing_id = check_existing_registration(w3, address)
    if existing_id is not None:
        rprint(f"  [green]Already registered:[/green] agentId = {existing_id}")
        rprint()
        return

    # Register
    account = get_aleph_account(private_key)
    metadata = build_agent_metadata(label)

    agent_uri = await _run_step(
        "Uploading metadata to IPFS",
        fn=lambda: upload_metadata_to_ipfs(account, metadata),
    )
    rprint(f"  [dim]URI: {agent_uri}[/dim]")

    agent_id, reg_tx = await _run_step(
        "Registering agent on-chain",
        fn=lambda: asyncio.to_thread(
            register_agent, w3, private_key, agent_uri, ens_name
        ),
    )
    rprint(f"  [green]Registered:[/green] agentId = {agent_id}")
    rprint(f"  [dim]Tx: [link=https://basescan.org/tx/{reg_tx}]{reg_tx}[/link][/dim]")
    rprint()
