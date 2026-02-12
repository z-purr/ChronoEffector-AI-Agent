import asyncio
from dataclasses import dataclass
from decimal import Decimal
from ipaddress import IPv6Interface
from pathlib import Path
from typing import Any

from aiohttp import ClientSession
from aleph.sdk.chains.ethereum import ETHAccount
from aleph.sdk.client.authenticated_http import (
    AlephHttpClient,
    AuthenticatedAlephHttpClient,
)
from aleph.sdk.conf import settings
from aleph.sdk.evm_utils import FlowUpdate
from aleph.sdk.query.filters import MessageFilter
from aleph_message.models import (
    Chain,
    InstanceMessage,
    ItemHash,
    MessageType,
    Payment,
    PaymentType,
    StoreMessage,
)
from aleph_message.models.execution.environment import (
    HostRequirements,
    HypervisorType,
    NodeRequirements,
)

ALEPH_API_URL = "https://api3.aleph.im"
ALEPH_CHANNEL = "basileus"
COMMUNITY_RECEIVER = "0x5aBd3258C5492fD378EBC2e0017416E199e5Da56"
COMMUNITY_FLOW_PERCENTAGE = Decimal("0.2")

PATH_EXECUTIONS_LIST = "/about/executions/list"
PATH_INSTANCE_NOTIFY = "/control/allocation/notify"

ALEPH_DECIMALS = 18
MIN_ALEPH_BALANCE = Decimal(10**ALEPH_DECIMALS)  # 1 ALEPH in wei


@dataclass
class CRNInfo:
    url: str
    hash: str
    receiver_address: str


DEFAULT_CRN = CRNInfo(
    url="https://crn10.leviathan.so",
    hash="dc3d1d194a990b5c54380c3c0439562fefa42f5a46807cba1c500ec3affecf04",
    receiver_address="0xf0c0ddf11a0dCE6618B5DF8d9fAE3D95e72E04a9",
)


def _patch_aleph_sdk() -> None:
    """Patch Aleph SDK for Base L2 compatibility.

    1. Skip can_transact — its balance check uses inflated maxFeePerGas.
    2. Fix nonce — SDK uses 'latest' which can be stale between consecutive
       txs on fast L2s. Wrap original method to use 'pending' instead.
    """
    from aleph.sdk.chains.ethereum import ETHAccount
    from aleph.sdk.connectors.superfluid import Superfluid
    from web3 import Web3

    ETHAccount.can_transact = lambda self, tx=None, block=True: True  # type: ignore[assignment,misc]

    _original_get_tx = Superfluid._get_populated_transaction_request

    def _patched_get_tx(self: Superfluid, operation: Any, rpc: str) -> Any:
        tx = _original_get_tx(self, operation, rpc)
        w3 = Web3(Web3.HTTPProvider(rpc))
        tx["nonce"] = w3.eth.get_transaction_count(
            w3.to_checksum_address(self.normalized_address), "pending"
        )
        return tx

    Superfluid._get_populated_transaction_request = _patched_get_tx  # type: ignore[assignment]


_patch_aleph_sdk()


def get_aleph_account(private_key: str) -> ETHAccount:
    """Create ETHAccount from hex private key on Base chain."""
    key_bytes = bytes.fromhex(private_key.removeprefix("0x"))
    return ETHAccount(key_bytes, chain=Chain.BASE)


def get_user_ssh_pubkey() -> str | None:
    """Read user's SSH public key from ~/.ssh/. Returns content or None."""
    ssh_dir = Path.home() / ".ssh"
    for name in ["id_ed25519.pub", "id_rsa.pub", "id_ecdsa.pub"]:
        path = ssh_dir / name
        if path.exists():
            return path.read_text().strip()
    return None


@dataclass
class ExistingResources:
    """Existing Aleph resources for an address."""

    instance_hashes: list[str]
    has_operator_flow: bool
    has_community_flow: bool

    @property
    def has_any(self) -> bool:
        return (
            bool(self.instance_hashes)
            or self.has_operator_flow
            or self.has_community_flow
        )


async def check_existing_resources(
    account: ETHAccount, crn: CRNInfo
) -> ExistingResources:
    """Check if address already has instance messages or Superfluid flows."""
    # Check existing instance messages
    async with AlephHttpClient(api_server=ALEPH_API_URL) as client:
        msgs = await client.get_messages(
            message_filter=MessageFilter(
                message_types=[MessageType.instance],
                addresses=[account.get_address()],
                channels=[ALEPH_CHANNEL],
            )
        )
        instance_hashes = [m.item_hash for m in msgs.messages]

    # Check existing flows
    operator_flow: dict[str, Any] = await account.get_flow(crn.receiver_address)
    community_flow: dict[str, Any] = await account.get_flow(COMMUNITY_RECEIVER)

    return ExistingResources(
        instance_hashes=instance_hashes,
        has_operator_flow=Decimal(operator_flow["flowRate"] or 0) > 0,
        has_community_flow=Decimal(community_flow["flowRate"] or 0) > 0,
    )


async def delete_existing_resources(
    account: ETHAccount, resources: ExistingResources, crn: CRNInfo
) -> None:
    """Delete existing instance messages and close Superfluid flows."""
    # Close flows first (on-chain txs that can conflict on nonce)
    if resources.has_operator_flow:
        flow_info = await account.get_flow(crn.receiver_address)
        flow_rate = Decimal(flow_info["flowRate"] or 0)
        if flow_rate > 0:
            tx_hash = await account.manage_flow(
                receiver=crn.receiver_address,
                flow=flow_rate,
                update_type=FlowUpdate.REDUCE,
            )
            _check_tx(account, tx_hash, "Delete operator flow")
            await asyncio.sleep(5)

    if resources.has_community_flow:
        flow_info = await account.get_flow(COMMUNITY_RECEIVER)
        flow_rate = Decimal(flow_info["flowRate"] or 0)
        if flow_rate > 0:
            tx_hash = await account.manage_flow(
                receiver=COMMUNITY_RECEIVER,
                flow=flow_rate,
                update_type=FlowUpdate.REDUCE,
            )
            _check_tx(account, tx_hash, "Delete community flow")

    if resources.has_operator_flow or resources.has_community_flow:
        await asyncio.sleep(5)

    # Forget instance messages (off-chain, no nonce issues)
    if resources.instance_hashes:
        async with AuthenticatedAlephHttpClient(
            account=account, api_server=ALEPH_API_URL
        ) as client:
            for h in resources.instance_hashes:
                await client.forget(
                    hashes=[h],
                    reason="Cleanup before redeployment",
                    channel=ALEPH_CHANNEL,
                )


async def create_instance(
    account: ETHAccount,
    crn: CRNInfo,
    vcpus: int = 2,
    memory: int = 4096,
    ssh_pubkey: str | None = None,
) -> InstanceMessage:
    """Create an Aleph PAYG instance. Returns the InstanceMessage."""
    async with AuthenticatedAlephHttpClient(
        account=account, api_server=ALEPH_API_URL
    ) as client:
        rootfs = settings.UBUNTU_24_QEMU_ROOTFS_ID
        rootfs_message: StoreMessage = await client.get_message(
            item_hash=rootfs, message_type=StoreMessage
        )
        rootfs_size = (
            rootfs_message.content.size
            if rootfs_message.content.size is not None
            else settings.DEFAULT_ROOTFS_SIZE
        )

        ssh_keys = [ssh_pubkey] if ssh_pubkey else []

        instance_message, _status = await client.create_instance(
            rootfs=rootfs,
            rootfs_size=rootfs_size,
            hypervisor=HypervisorType.qemu,
            payment=Payment(
                chain=Chain.BASE,
                type=PaymentType.superfluid,
                receiver=crn.receiver_address,
            ),
            requirements=HostRequirements(
                node=NodeRequirements(node_hash=ItemHash(crn.hash))
            ),
            channel=ALEPH_CHANNEL,
            address=account.get_address(),
            ssh_keys=ssh_keys,
            metadata={"name": "basileus-agent"},
            vcpus=vcpus,
            memory=memory,
            sync=True,
        )
        return instance_message


@dataclass
class FlowRates:
    """Computed flow rates for operator and community."""

    operator: Decimal
    community: Decimal


async def compute_flow_rates(
    account: ETHAccount,
    instance_hash: str,
) -> FlowRates:
    """Compute required Superfluid flow rates from instance pricing."""
    async with AuthenticatedAlephHttpClient(
        account=account, api_server=ALEPH_API_URL
    ) as client:
        instance_msg = await client.get_message(instance_hash, with_status=False)
        if not isinstance(instance_msg, InstanceMessage):
            raise ValueError(f"{instance_hash} is not an instance")

        estimated = await client.get_estimated_price(content=instance_msg.content)
        total_flow = Decimal(estimated.required_tokens)
        return FlowRates(
            operator=total_flow * (1 - COMMUNITY_FLOW_PERCENTAGE),
            community=total_flow * COMMUNITY_FLOW_PERCENTAGE,
        )


def _check_tx(account: ETHAccount, tx_hash: str | None, label: str) -> None:
    """Check that a tx succeeded on-chain. Raises if reverted."""
    if tx_hash is None:
        raise ValueError(f"{label}: no tx hash returned")
    from hexbytes import HexBytes

    receipt = account._provider.eth.get_transaction_receipt(HexBytes(tx_hash))  # type: ignore[union-attr]
    if receipt["status"] != 1:
        raise ValueError(f"{label}: tx {tx_hash} reverted on-chain")


async def create_operator_flow(
    account: ETHAccount,
    crn: CRNInfo,
    flow_rate: Decimal,
) -> str | None:
    """Create operator Superfluid flow. Checks tx receipt. Returns tx hash."""
    existing = await account.get_flow(crn.receiver_address)
    existing_rate = Decimal(existing["flowRate"] or 0)
    if existing_rate < flow_rate:
        tx_hash = await account.manage_flow(
            receiver=crn.receiver_address,
            flow=flow_rate - existing_rate,
            update_type=FlowUpdate.INCREASE,
        )
        _check_tx(account, tx_hash, "Operator flow")
        return tx_hash
    return None


async def create_community_flow(
    account: ETHAccount,
    flow_rate: Decimal,
) -> str | None:
    """Create community Superfluid flow. Checks tx receipt. Returns tx hash."""
    await asyncio.sleep(5)
    existing = await account.get_flow(COMMUNITY_RECEIVER)
    existing_rate = Decimal(existing["flowRate"] or 0)
    if existing_rate < flow_rate:
        tx_hash = await account.manage_flow(
            receiver=COMMUNITY_RECEIVER,
            flow=flow_rate - existing_rate,
            update_type=FlowUpdate.INCREASE,
        )
        _check_tx(account, tx_hash, "Community flow")
        return tx_hash
    return None


async def notify_allocation(
    crn: CRNInfo, instance_hash: str, max_retries: int = 5, retry_delay: int = 3
) -> None:
    """Notify CRN to allocate the instance. Retries on flow-related errors."""
    for attempt in range(max_retries):
        async with ClientSession() as session:
            async with session.post(
                f"{crn.url}{PATH_INSTANCE_NOTIFY}",
                json={"instance": instance_hash},
            ) as resp:
                if resp.ok:
                    return
                error = await resp.text()
                if (
                    "payment stream" in error.lower() or "402" in error
                ) and attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    continue
                raise ValueError(f"Allocation failed: {error}")


async def fetch_instance_ip(crn: CRNInfo, instance_hash: str) -> str:
    """Fetch IPv6 of instance from CRN. Returns empty string if not found."""
    async with ClientSession() as session:
        async with session.get(f"{crn.url}{PATH_EXECUTIONS_LIST}") as resp:
            resp.raise_for_status()
            executions = await resp.json()
            if instance_hash not in executions:
                return ""
            interface = IPv6Interface(executions[instance_hash]["networking"]["ipv6"])
            return str(interface.ip + 1)


async def wait_for_instance(
    crn: CRNInfo, instance_hash: str, max_attempts: int = 30, interval: int = 10
) -> str:
    """Wait for instance to get an IP. Returns IPv6 address."""
    for attempt in range(max_attempts):
        ip = await fetch_instance_ip(crn, instance_hash)
        if ip:
            return ip
        if attempt < max_attempts - 1:
            await asyncio.sleep(interval)
    raise TimeoutError(
        f"Instance {instance_hash} did not get an IP after {max_attempts} attempts"
    )


def check_aleph_balance(account: ETHAccount) -> Decimal:
    """Check ALEPH balance, raise if < 1. Returns balance in ALEPH."""
    balance_raw = account.get_token_balance()
    balance_aleph = balance_raw / Decimal(10**ALEPH_DECIMALS)
    if balance_raw < MIN_ALEPH_BALANCE:
        raise ValueError(
            f"ALEPH balance is {balance_aleph:.4f}, need at least 1. "
            f"Fund {account.get_address()} with ALEPH tokens on Base."
        )
    return balance_aleph
