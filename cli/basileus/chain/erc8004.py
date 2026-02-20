"""ERC-8004 IdentityRegistry interactions for registering Basileus agents on Base."""

import json

import eth_abi
from aleph.sdk.chains.ethereum import ETHAccount
from aleph.sdk.client.authenticated_http import AuthenticatedAlephHttpClient
from aleph.sdk.types import StorageEnum
from eth_account import Account
from web3 import Web3

from basileus.chain.builder_code import builder_code_suffix
from basileus.chain.constants import (
    BUILDER_CODE,
    ERC8004_IDENTITY_REGISTRY,
    ERC8004_IDENTITY_REGISTRY_ABI,
)
from basileus.infra.aleph import ALEPH_API_URL, ALEPH_CHANNEL


def _get_registry(w3: Web3):
    return w3.eth.contract(
        address=Web3.to_checksum_address(ERC8004_IDENTITY_REGISTRY),
        abi=ERC8004_IDENTITY_REGISTRY_ABI,
    )


def build_agent_metadata(label: str) -> dict:
    """Build ERC-8004 registration JSON for a Basileus agent."""
    return {
        "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        "name": f"{label}.basileus-agent.eth",
        "description": "Autonomous prediction market trading agent on Base",
        "image": "",
        "services": [],
        "x402Support": True,
        "active": True,
        "registrations": [],
        "supportedTrust": [],
    }


async def upload_metadata_to_ipfs(aleph_account: ETHAccount, metadata: dict) -> str:
    """Upload agent metadata JSON to IPFS via Aleph. Returns ipfs:// URI."""
    content_bytes = json.dumps(metadata, indent=2).encode("utf-8")

    async with AuthenticatedAlephHttpClient(
        account=aleph_account, api_server=ALEPH_API_URL
    ) as client:
        result, _status = await client.create_store(
            file_content=content_bytes,
            storage_engine=StorageEnum.ipfs,
            channel=ALEPH_CHANNEL,
            guess_mime_type=True,
        )

    cid = result.content.item_hash
    return f"ipfs://{cid}"


def check_existing_registration(w3: Web3, address: str) -> int | None:
    """Check if address owns an identity NFT. Returns agentId or None."""
    contract = _get_registry(w3)
    checksummed = Web3.to_checksum_address(address)

    try:
        balance = contract.functions.balanceOf(checksummed).call()
        if balance == 0:
            return None
        agent_id = contract.functions.tokenOfOwnerByIndex(checksummed, 0).call()
        return agent_id
    except Exception:
        return None


def register_agent(
    w3: Web3, private_key: str, agent_uri: str, ens_name: str
) -> tuple[int, str]:
    """Register agent on-chain via ERC-8004 IdentityRegistry.

    Returns (agentId, tx_hash).
    """
    contract = _get_registry(w3)
    account = Account.from_key(private_key)

    # Encode ENS name as metadata entry: (key, abi-encoded value)
    ens_value = eth_abi.encode(["string"], [ens_name])
    metadata_entries = [("ens", ens_value)]

    call = contract.functions.register(agent_uri, metadata_entries)
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

    # Extract agentId from Registered event
    registered_events = contract.events.Registered().process_receipt(receipt)
    if not registered_events:
        raise RuntimeError(f"No Registered event found in tx 0x{tx_hash.hex()}")
    agent_id = registered_events[0]["args"]["agentId"]

    return (agent_id, f"0x{tx_hash.hex()}")
