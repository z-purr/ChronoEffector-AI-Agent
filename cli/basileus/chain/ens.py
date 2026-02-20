from web3 import Web3
from eth_account import Account

from basileus.chain.constants import (
    BUILDER_CODE,
    L2_REGISTRAR_ADDRESS,
    L2_REGISTRAR_ABI,
    L2_REGISTRY_ADDRESS,
    L2_REGISTRY_ABI,
)
from basileus.chain.builder_code import builder_code_suffix


def _get_registrar(w3: Web3):
    return w3.eth.contract(
        address=Web3.to_checksum_address(L2_REGISTRAR_ADDRESS),
        abi=L2_REGISTRAR_ABI,
    )


def check_existing_subname(w3: Web3, address: str) -> str | None:
    """Call reverseNames(address). Returns label or None if no subname."""
    try:
        contract = _get_registrar(w3)
        label = contract.functions.reverseNames(
            Web3.to_checksum_address(address)
        ).call()
        return label if label else None
    except Exception:
        return None


def check_label_available(w3: Web3, label: str) -> bool:
    """Call available(label). Returns True if label can be registered."""
    contract = _get_registrar(w3)
    return contract.functions.available(label).call()


def register_subname(w3: Web3, private_key: str, label: str, owner: str) -> str:
    """Call register(label, owner). Signs and sends tx. Returns tx hash hex.
    Raises on failure."""
    contract = _get_registrar(w3)
    account = Account.from_key(private_key)
    owner_checksummed = Web3.to_checksum_address(owner)

    call = contract.functions.register(label, owner_checksummed)
    tx = call.build_transaction(
        {
            "from": account.address,
            "nonce": w3.eth.get_transaction_count(account.address, "pending"),
            "gas": call.estimate_gas({"from": account.address}),
        }
    )

    if BUILDER_CODE:
        suffix = builder_code_suffix(BUILDER_CODE)
        tx["data"] += suffix.hex()
        tx["gas"] += len(suffix) * 16

    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

    if receipt["status"] != 1:
        raise RuntimeError(f"Transaction reverted: 0x{tx_hash.hex()}")

    return f"0x{tx_hash.hex()}"


def _get_registry(w3: Web3):
    return w3.eth.contract(
        address=Web3.to_checksum_address(L2_REGISTRY_ADDRESS),
        abi=L2_REGISTRY_ABI,
    )


def get_content_hash(w3: Web3, label: str) -> str | None:
    """Read current contentHash from L2Registry for a subname. Returns hex string or None."""
    registry = _get_registry(w3)
    base_node = registry.functions.baseNode().call()
    node = registry.functions.makeNode(base_node, label).call()
    raw = registry.functions.contenthash(node).call()
    if not raw:
        return None
    return f"0x{raw.hex()}"


def set_content_hash(
    w3: Web3, private_key: str, label: str, content_hash_hex: str
) -> str:
    """Set contentHash on L2Registry for a subname.

    content_hash_hex: EIP-1577 encoded hex from the frontend deploy script (0x...).
    Returns tx hash hex.
    """
    registry = _get_registry(w3)
    account = Account.from_key(private_key)

    base_node = registry.functions.baseNode().call()
    node = registry.functions.makeNode(base_node, label).call()

    content_hash = bytes.fromhex(content_hash_hex.removeprefix("0x"))

    call = registry.functions.setContenthash(node, content_hash)
    tx = call.build_transaction(
        {
            "from": account.address,
            "nonce": w3.eth.get_transaction_count(account.address, "pending"),
            "gas": call.estimate_gas({"from": account.address}),
        }
    )

    if BUILDER_CODE:
        suffix = builder_code_suffix(BUILDER_CODE)
        tx["data"] += suffix.hex()
        tx["gas"] += len(suffix) * 16

    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

    if receipt["status"] != 1:
        raise RuntimeError(f"Transaction reverted: 0x{tx_hash.hex()}")

    return f"0x{tx_hash.hex()}"
