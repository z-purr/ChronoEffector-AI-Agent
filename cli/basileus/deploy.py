import asyncio
import os
from collections.abc import Callable
from pathlib import Path
from typing import Any

import typer
from rich import print as rprint
from rich.console import Console
from rich.panel import Panel
from rich.status import Status

from basileus.aleph import (
    DEFAULT_CRN,
    check_aleph_balance,
    create_flows,
    create_instance,
    get_aleph_account,
    get_user_ssh_pubkey,
    notify_allocation,
    wait_for_instance,
)
from basileus.balance import wait_for_usdc_funding
from basileus.wallet import generate_wallet, load_existing_wallet

console = Console()


async def _run_step(
    label: str, fn: Callable[[], Any] | None = None, mock_duration: float = 2.0
) -> Any:
    """Run a deployment step with spinner, then show checkmark. Returns fn result if provided."""
    with Status(f"{label}...", console=console, spinner="dots"):
        if fn is not None:
            result = await fn()
        else:
            await asyncio.sleep(mock_duration)
            result = None
    console.print(f"  [green]\u2714[/green] {label}")
    return result


async def deploy_command(
    agent_dir: Path = typer.Option(
        None,
        "--agent-dir",
        "-d",
        help="Path to agent directory (default: current working directory)",
    ),
    min_usdc: float = typer.Option(
        20.0,
        "--min-usdc",
        help="Minimum USDC balance to wait for before proceeding",
    ),
) -> None:
    """Deploy a new Basileus agent — generates wallet, funds it, and deploys to Aleph Cloud."""

    if agent_dir is None:
        agent_dir = Path.cwd()

    agent_dir = agent_dir.resolve()
    env_path = agent_dir / ".env.prod"

    console.rule("[bold blue]Basileus Agent Deployment")
    rprint()

    # Step 1: Wallet
    rprint("[bold]Step 1:[/bold] Setting up Base wallet...")
    existing = load_existing_wallet(agent_dir)
    if existing:
        address, private_key = existing
        rprint(f"  [green]Using existing wallet:[/green] {address}")
        env_vars = None
    else:
        address, private_key = generate_wallet()
        rprint(f"  [green]Wallet generated:[/green] {address}")
        env_vars = {
            "BASE_CHAIN_WALLET_KEY": private_key,
            "NETWORK": "base",
            "CYCLE_INTERVAL_MS": "60000",
            "LLM_MODEL": "anthropic/claude-sonnet-4",
        }
    rprint()

    # Step 2: Write .env.prod (only if new wallet)
    if env_vars is not None:
        rprint("[bold]Step 2:[/bold] Configuring agent environment...")
        env_content = "\n".join(f"{k}={v}" for k, v in env_vars.items()) + "\n"
        os.makedirs(agent_dir, exist_ok=True)
        with open(env_path, "w") as f:
            f.write(env_content)
        rprint(f"  [green]Saved to {env_path}[/green]")
        rprint()

    # Step 3: Fund wallet
    rprint("[bold]Step 3:[/bold] Fund your agent wallet")
    rprint()
    rprint(
        Panel(
            f"[bold]Send USDC (Base) to:[/bold]\n\n"
            f"  [cyan]{address}[/cyan]\n\n"
            f"This USDC will be the agent's starting funds for:\n"
            f"  - AI inference costs (BlockRun x402)\n"
            f"  - Prediction market trading (Limitless)\n"
            f"  - Compute costs (Aleph Cloud)\n\n"
            f"[dim]Minimum required: {min_usdc} USDC[/dim]",
            title="[bold yellow]Fund Agent Wallet[/bold yellow]",
            border_style="yellow",
        )
    )
    rprint()

    # Step 4: Poll for balance
    balance = wait_for_usdc_funding(address, min_amount=min_usdc)
    rprint(f"  [green]Received {balance:.2f} USDC[/green]")
    rprint()

    # Step 4: Deploy to Aleph Cloud
    rprint("[bold]Step 4:[/bold] Deploying to Aleph Cloud...")
    rprint()

    account = get_aleph_account(private_key)
    crn = DEFAULT_CRN
    ssh_pubkey = get_user_ssh_pubkey()

    # Skip swap — assume ALEPH tokens already available
    console.print("  [dim]Skipping ALEPH swap (assuming tokens available)[/dim]")

    aleph_balance = check_aleph_balance(account)
    console.print("  [green]\u2714[/green] Checked ALEPH balance")
    rprint(f"  [dim]ALEPH balance: {aleph_balance:.4f}[/dim]")

    instance_msg = await _run_step(
        "Creating Aleph instance message (2 vCPUs, 4GB RAM, PAYG)",
        fn=lambda: create_instance(account, crn, ssh_pubkey=ssh_pubkey),
    )
    instance_hash = instance_msg.item_hash
    rprint(f"  [dim]Instance hash: {instance_hash}[/dim]")

    await _run_step(
        "Creating Superfluid payment flows (operator + community)",
        fn=lambda: create_flows(account, instance_hash, crn),
    )

    await _run_step(
        "Waiting for flows to confirm on-chain",
        fn=lambda: asyncio.sleep(15),
    )

    await _run_step(
        "Notifying CRN for allocation",
        fn=lambda: notify_allocation(crn, instance_hash),
    )

    instance_ip = await _run_step(
        "Waiting for instance to come up",
        fn=lambda: wait_for_instance(crn, instance_hash),
    )
    rprint(f"  [dim]Instance IP: {instance_ip}[/dim]")

    rprint()
    console.rule("[bold green]Deployment Complete")
    rprint()
    rprint(
        Panel(
            f"[bold]Agent Address:[/bold]    [cyan]{address}[/cyan]\n"
            f"[bold]USDC Balance:[/bold]     {balance:.2f} USDC\n"
            f"[bold]Instance Hash:[/bold]    {instance_hash}\n"
            f"[bold]Instance IP:[/bold]      {instance_ip}\n"
            f"[bold]Network:[/bold]          Base Mainnet\n"
            f"[bold]Status:[/bold]           [green]Running[/green]\n"
            f"\n"
            f"[dim]Dashboard: coming soon[/dim]",
            title="[bold green]Basileus Agent[/bold green]",
            border_style="green",
        )
    )
