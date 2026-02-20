import asyncio
from pathlib import Path

import typer
from rich import print as rprint
from rich.console import Console
from web3 import Web3

from basileus.chain.constants import BASE_RPC_URL, FRONTEND_CONTENT_HASH
from basileus.chain.ens import (
    check_existing_subname,
    get_content_hash,
    set_content_hash,
)
from basileus.chain.wallet import load_existing_wallet
from basileus.ui import _fail, _run_step

console = Console()


async def set_content_hash_command(
    path: Path = typer.Argument(
        None,
        help="Path to agent directory (default: current working directory)",
    ),
) -> None:
    """Update the ENS content hash for an agent's subname."""

    if path is None:
        path = Path.cwd()
    path = path.resolve()

    console.rule("[bold blue]Set ENS Content Hash")
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

    # Check current content hash
    current = await _run_step(
        "Reading current content hash",
        fn=lambda: asyncio.to_thread(get_content_hash, w3, label),
    )

    if current == FRONTEND_CONTENT_HASH:
        rprint("  [green]Content hash already up to date[/green]")
        rprint()
        return

    if current:
        rprint(f"  [dim]Current: {current}[/dim]")
    rprint(f"  [dim]New:     {FRONTEND_CONTENT_HASH}[/dim]")

    # Set new content hash
    tx_hash = await _run_step(
        "Setting content hash",
        fn=lambda: asyncio.to_thread(
            set_content_hash, w3, private_key, label, FRONTEND_CONTENT_HASH
        ),
    )
    rprint(f"  [dim]Tx: [link=https://basescan.org/tx/{tx_hash}]{tx_hash}[/link][/dim]")
    rprint()
