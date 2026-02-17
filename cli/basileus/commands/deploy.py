import asyncio
import os
from pathlib import Path

import typer
from web3 import Web3
from rich import print as rprint
from rich.console import Console
from rich.panel import Panel

import paramiko

from basileus.infra.ssh import (
    configure_service,
    deploy_code,
    install_deps,
    install_node,
    upload_agent,
    verify_service,
    wait_for_ssh,
)
from basileus.infra.aleph import (
    DEFAULT_CRN,
    check_aleph_balance,
    check_existing_resources,
    create_instance,
    delete_existing_resources,
    get_aleph_account,
    get_user_ssh_pubkey,
    notify_allocation,
    wait_for_instance,
)
from basileus.chain.superfluid import (
    compute_flow_rates,
    create_community_flow,
    create_operator_flow,
)
from basileus.chain.balance import wait_for_usdc_funding
from basileus.chain.wallet import generate_wallet, load_existing_wallet
from basileus.chain.constants import BASE_RPC_URL, BUILDER_CODE, FRONTEND_CONTENT_HASH
from basileus.chain.ens import (
    check_existing_subname,
    check_label_available,
    register_subname,
    set_content_hash,
)
from basileus.ui import _fail, _run_step

console = Console()


async def deploy_command(
    path: Path = typer.Argument(
        None,
        help="Path to agent directory (default: current working directory)",
    ),
    min_usdc: float = typer.Option(
        20.0,
        "--min-usdc",
        help="Minimum USDC balance to wait for before proceeding",
    ),
    ssh_pubkey_path: Path = typer.Option(
        None,
        "--ssh-key",
        help="Path to SSH public key file (default: auto-detect from ~/.ssh/)",
    ),
) -> None:
    """Deploy a new Basileus agent — generates wallet, funds it, and deploys to Aleph Cloud."""

    if path is None:
        path = Path.cwd()

    path = path.resolve()
    env_path = path / ".env.prod"

    console.rule("[bold blue]Basileus Agent Deployment")
    rprint()

    step = 0
    ssh_client: paramiko.SSHClient | None = None

    try:
        # Wallet
        step += 1
        rprint(f"[bold]Step {step}:[/bold] Setting up Base wallet...")
        try:
            existing = load_existing_wallet(path)
            if existing:
                address, private_key = existing
                rprint(f"  [green]Using existing wallet:[/green] {address}")
                env_vars = None
            else:
                address, private_key = generate_wallet()
                rprint(f"  [green]Wallet generated:[/green] {address}")
                env_vars = {
                    "WALLET_PRIVATE_KEY": private_key,
                    "BUILDER_CODE": BUILDER_CODE,
                }
        except Exception as e:
            _fail("Setting up Base wallet", e)

        w3 = Web3(Web3.HTTPProvider(BASE_RPC_URL))
        existing_label = check_existing_subname(w3, address)
        needs_ens = existing_label is None
        label = existing_label

        if existing_label:
            rprint(
                f"  [green]ENS:[/green] [bold cyan]{existing_label}.basileus-agent.eth[/bold cyan]"
            )
        rprint()

        # Write .env.prod (only if new wallet)
        if env_vars is not None:
            step += 1
            rprint(f"[bold]Step {step}:[/bold] Configuring agent environment...")
            try:
                env_content = "\n".join(f"{k}={v}" for k, v in env_vars.items()) + "\n"
                os.makedirs(path, exist_ok=True)
                with open(env_path, "w") as f:
                    f.write(env_content)
                rprint(f"  [green]Saved to {env_path}[/green]")
            except Exception as e:
                _fail("Configuring agent environment", e)
            rprint()

        # Check for existing Aleph resources
        account = get_aleph_account(private_key)
        crn = DEFAULT_CRN

        resources = await _run_step(
            "Checking for existing Aleph resources",
            fn=lambda: check_existing_resources(account, crn),
        )

        if resources.has_any:
            rprint(f"  [yellow]Found existing resources: {resources.summary}[/yellow]")
            delete = typer.confirm(
                "  Delete existing resources and proceed?",
                default=True,
            )
            if not delete:
                rprint(
                    "  [red]Cannot proceed with existing resources. Use a different wallet.[/red]"
                )
                raise typer.Exit(1)

            await _run_step(
                "Deleting existing resources",
                fn=lambda: delete_existing_resources(account, resources, crn),
            )
        rprint()

        # Fund wallet
        step += 1
        rprint(f"[bold]Step {step}:[/bold] Fund your agent wallet")
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

        balance = wait_for_usdc_funding(address, min_amount=min_usdc)
        rprint(f"  [green]Received {balance:.2f} USDC[/green]")
        rprint()

        # Register ENS subname (if needed)
        if needs_ens:
            step += 1
            rprint(f"[bold]Step {step}:[/bold] Register ENS subname")
            rprint(
                "  Choose a name for your agent (will become [cyan]<name>.basileus-agent.eth[/cyan])"
            )
            rprint("  [dim]Must be at least 3 characters[/dim]")
            rprint()

            while True:
                label = typer.prompt("  Enter subname").strip().lower()
                try:
                    is_available = check_label_available(w3, label)
                except Exception as e:
                    rprint(f"  [red]Error checking availability: {e}[/red]")
                    continue

                if is_available:
                    break
                rprint(
                    f"  [red]{label}.basileus-agent.eth is already taken, try another[/red]"
                )

            try:
                tx_hash = await _run_step(
                    f"Registering {label}.basileus-agent.eth",
                    fn=lambda: asyncio.to_thread(
                        register_subname, w3, private_key, label, address
                    ),
                )
                rprint(
                    f"  [dim]Tx: [link=https://basescan.org/tx/{tx_hash}]{tx_hash}[/link][/dim]"
                )
            except Exception as e:
                _fail("Registering ENS subname", e)

            await asyncio.sleep(2)

            try:
                content_tx = await _run_step(
                    f"Setting contentHash for {label}.basileus-agent.eth",
                    fn=lambda: asyncio.to_thread(
                        set_content_hash, w3, private_key, label, FRONTEND_CONTENT_HASH
                    ),
                )
                rprint(
                    f"  [dim]Tx: [link=https://basescan.org/tx/{content_tx}]{content_tx}[/link][/dim]"
                )
            except Exception as e:
                _fail("Setting contentHash", e)
            rprint()

        # Create Aleph Cloud instance
        step += 1
        rprint(f"[bold]Step {step}:[/bold] Create Aleph Cloud instance...")
        rprint()

        # Resolve SSH pubkey
        if ssh_pubkey_path is not None:
            ssh_pubkey = ssh_pubkey_path.expanduser().read_text().strip()
        else:
            ssh_pubkey = get_user_ssh_pubkey()

        # Skip swap — assume ALEPH tokens already available
        console.print("  [dim]Skipping ALEPH swap (assuming tokens available)[/dim]")

        try:
            aleph_balance = check_aleph_balance(account)
            console.print("  [green]\u2714[/green] Checked ALEPH balance")
            rprint(f"  [dim]ALEPH balance: {aleph_balance:.4f}[/dim]")
        except Exception as e:
            _fail("Checking ALEPH balance", e)

        instance_msg = await _run_step(
            "Creating Aleph instance message",
            fn=lambda: create_instance(account, crn, ssh_pubkey=ssh_pubkey),
        )
        instance_hash = instance_msg.item_hash
        explorer_url = f"https://explorer.aleph.cloud/address/ETH/{address}/message/INSTANCE/{instance_hash}"
        rprint(f"  [dim]Instance: [link={explorer_url}]{instance_hash}[/link][/dim]")

        flow_rates = await _run_step(
            "Computing flow rates",
            fn=lambda: compute_flow_rates(account, instance_hash),
        )

        op_tx = await _run_step(
            "Creating operator Superfluid flow",
            fn=lambda: create_operator_flow(account, crn, flow_rates.operator),
        )
        if op_tx:
            rprint(
                f"  [dim]Tx: [link=https://basescan.org/tx/0x{op_tx}]0x{op_tx}[/link][/dim]"
            )

        com_tx = await _run_step(
            "Creating community Superfluid flow",
            fn=lambda: create_community_flow(account, flow_rates.community),
        )
        if com_tx:
            rprint(
                f"  [dim]Tx: [link=https://basescan.org/tx/0x{com_tx}]0x{com_tx}[/link][/dim]"
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

        # Deploy agent code
        step += 1
        rprint()
        rprint(f"[bold]Step {step}:[/bold] Deploying agent code...")
        rprint()

        ssh_key_path = ssh_pubkey_path if ssh_pubkey_path is not None else None
        ssh_client = await _run_step(
            "Waiting for SSH",
            fn=lambda: asyncio.to_thread(wait_for_ssh, instance_ip, ssh_key_path),
        )
        assert ssh_client is not None
        client = ssh_client

        await _run_step(
            "Uploading agent code",
            fn=lambda: asyncio.to_thread(upload_agent, client, path),
        )

        await _run_step(
            "Installing Node.js",
            fn=lambda: asyncio.to_thread(install_node, client),
        )

        await _run_step(
            "Deploying agent code",
            fn=lambda: asyncio.to_thread(deploy_code, client),
        )

        await _run_step(
            "Installing dependencies",
            fn=lambda: asyncio.to_thread(install_deps, client),
        )

        await _run_step(
            "Configuring agent service",
            fn=lambda: asyncio.to_thread(configure_service, client),
        )

        is_active = await _run_step(
            "Verifying agent is running",
            fn=lambda: asyncio.to_thread(verify_service, client),
        )
        if not is_active:
            _fail(
                "Verifying agent is running",
                RuntimeError("basileus-agent service failed to start"),
            )

        ssh_client.close()
        ssh_client = None

        rprint()
        console.rule("[bold green]Deployment Complete")
        rprint()
        rprint(
            Panel(
                f"[bold]Agent Address:[/bold]    [cyan]{address}[/cyan]\n"
                f"[bold]ENS Name:[/bold]         [cyan]{label}.basileus-agent.eth[/cyan]\n"
                f"[bold]USDC Balance:[/bold]     {balance:.2f} USDC\n"
                f"[bold]Instance IP:[/bold]      {instance_ip}\n"
                f"[bold]Network:[/bold]          Base Mainnet\n"
                f"[bold]Service:[/bold]          [green]basileus-agent (active)[/green]\n"
                f"\n"
                f"[bold]Dashboard:[/bold]       [cyan][link=https://{label}.basileus-agent.eth.limo]https://{label}.basileus-agent.eth.limo[/link][/cyan]",
                title="[bold green]Basileus Agent[/bold green]",
                border_style="green",
            )
        )
    finally:
        if ssh_client is not None:
            ssh_client.close()
