from pathlib import Path

from dotenv import dotenv_values
from eth_account import Account


def generate_wallet() -> tuple[str, str]:
    """Generate a new Ethereum wallet. Returns (address, private_key_hex)."""
    account = Account.create()
    return account.address, f"0x{account.key.hex()}"


def load_existing_wallet(agent_dir: Path) -> tuple[str, str] | None:
    """Try loading wallet from .env.prod or .env. Returns (address, private_key) or None."""
    for env_file in [".env.prod", ".env"]:
        env_path = agent_dir / env_file
        if not env_path.exists():
            continue
        values = dotenv_values(env_path)
        pk = values.get("WALLET_PRIVATE_KEY")
        if pk:
            address = Account.from_key(pk).address
            return address, pk
    return None
