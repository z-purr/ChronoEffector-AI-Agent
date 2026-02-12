from pathlib import Path

import typer
from rich import print as rprint
from rich.console import Console

from basileus.aleph import (
    DEFAULT_CRN,
    check_existing_resources,
    delete_existing_resources,
    get_aleph_account,
)
from basileus.commands.deploy import _run_step
from basileus.wallet import load_existing_wallet

console = Console()


async def stop_command(
    path: Path = typer.Argument(
        None,
        help="Path to agent directory (default: current working directory)",
    ),
) -> None:
    """Stop a running Basileus agent — tears down Aleph instance and closes payment flows."""

    if path is None:
        path = Path.cwd()
    path = path.resolve()

    console.rule("[bold red]Basileus Agent Stop")
    rprint()

    # Load wallet
    existing = load_existing_wallet(path)
    if not existing:
        rprint("[red]No wallet found in .env.prod or .env — nothing to stop.[/red]")
        raise typer.Exit(1)

    address, private_key = existing
    rprint(f"  Wallet: [cyan]{address}[/cyan]")

    account = get_aleph_account(private_key)
    crn = DEFAULT_CRN

    # Check existing resources
    resources = await _run_step(
        "Checking for existing Aleph resources",
        fn=lambda: check_existing_resources(account, crn),
    )

    if not resources.has_any:
        rprint()
        rprint("[green]No active resources found — nothing to stop.[/green]")
        raise typer.Exit(0)

    # Show what will be destroyed
    details = []
    if resources.instance_hashes:
        details.append(f"{len(resources.instance_hashes)} instance(s)")
    if resources.has_operator_flow:
        details.append("operator payment flow")
    if resources.has_community_flow:
        details.append("community payment flow")

    rprint()
    rprint(f"  [yellow]Will stop: {', '.join(details)}[/yellow]")
    rprint()

    confirm = typer.confirm("  Proceed with stopping the agent?", default=False)
    if not confirm:
        rprint("  [dim]Aborted.[/dim]")
        raise typer.Exit(0)

    rprint()

    await _run_step(
        "Deleting resources and closing payment flows",
        fn=lambda: delete_existing_resources(account, resources, crn),
    )

    rprint()
    console.rule("[bold green]Agent Stopped")
    rprint()
    rprint(f"  [green]All resources for {address} have been cleaned up.[/green]")
