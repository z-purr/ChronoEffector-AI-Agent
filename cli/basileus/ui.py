import asyncio
from collections.abc import Callable
from typing import Any

import typer
from rich.console import Console
from rich.status import Status

console = Console()


def _fail(label: str, error: Exception) -> None:
    """Print a red X with error message and exit."""
    console.print(f"  [red]\u2718[/red] {label}")
    console.print(f"    [red]{type(error).__name__}: {error or repr(error)}[/red]")
    raise typer.Exit(1)


async def _run_step(
    label: str, fn: Callable[[], Any] | None = None, mock_duration: float = 2.0
) -> Any:
    """Run a deployment step with spinner, then show checkmark. Returns fn result if provided."""
    try:
        with Status(f"{label}...", console=console, spinner="dots"):
            if fn is not None:
                result = await fn()
            else:
                await asyncio.sleep(mock_duration)
                result = None
        console.print(f"  [green]\u2714[/green] {label}")
        return result
    except Exception as e:
        _fail(label, e)
