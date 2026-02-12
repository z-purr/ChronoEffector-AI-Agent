import asyncio
from dataclasses import dataclass
from decimal import Decimal
from ipaddress import IPv6Interface
from pathlib import Path

from aiohttp import ClientSession
from aleph.sdk.chains.ethereum import ETHAccount
from aleph.sdk.client.authenticated_http import AuthenticatedAlephHttpClient
from aleph.sdk.conf import settings
from aleph.sdk.evm_utils import FlowUpdate
from aleph_message.models import (
    Chain,
    InstanceMessage,
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

MIN_ALEPH_BALANCE = Decimal("1")


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


def get_aleph_account(private_key: str) -> ETHAccount:
    """Create ETHAccount from hex private key."""
    key_bytes = bytes.fromhex(private_key.removeprefix("0x"))
    return ETHAccount(key_bytes)


def get_user_ssh_pubkey() -> str | None:
    """Read user's SSH public key from ~/.ssh/. Returns content or None."""
    ssh_dir = Path.home() / ".ssh"
    for name in ["id_ed25519.pub", "id_rsa.pub", "id_ecdsa.pub"]:
        path = ssh_dir / name
        if path.exists():
            return path.read_text().strip()
    return None


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
                node=NodeRequirements(node_hash=crn.hash)
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


async def create_flows(
    account: ETHAccount, instance_hash: str, crn: CRNInfo
) -> None:
    """Create PAYG Superfluid flows (operator + community)."""
    async with AuthenticatedAlephHttpClient(
        account=account, api_server=ALEPH_API_URL
    ) as client:
        instance_msg = await client.get_message(instance_hash, with_status=False)
        if not isinstance(instance_msg, InstanceMessage):
            raise ValueError(f"{instance_hash} is not an instance")

        estimated = await client.get_estimated_price(content=instance_msg.content)
        total_flow = Decimal(estimated.required_tokens)
        community_flow = total_flow * COMMUNITY_FLOW_PERCENTAGE
        operator_flow = total_flow * (1 - COMMUNITY_FLOW_PERCENTAGE)

    # Create operator flow
    existing = await account.get_flow(crn.receiver_address)
    existing_rate = Decimal(existing["flowRate"] or 0)
    if existing_rate < operator_flow:
        await account.manage_flow(
            receiver=crn.receiver_address,
            flow=operator_flow - existing_rate,
            update_type=FlowUpdate.INCREASE,
        )

    await asyncio.sleep(10)

    # Create community flow
    existing = await account.get_flow(COMMUNITY_RECEIVER)
    existing_rate = Decimal(existing["flowRate"] or 0)
    if existing_rate < community_flow:
        await account.manage_flow(
            receiver=COMMUNITY_RECEIVER,
            flow=community_flow - existing_rate,
            update_type=FlowUpdate.INCREASE,
        )


async def notify_allocation(crn: CRNInfo, instance_hash: str) -> None:
    """Notify CRN to allocate the instance."""
    async with ClientSession() as session:
        async with session.post(
            f"{crn.url}{PATH_INSTANCE_NOTIFY}",
            json={"instance": instance_hash},
        ) as resp:
            if not resp.ok:
                error = await resp.text()
                raise ValueError(f"Allocation failed: {error}")


async def fetch_instance_ip(crn: CRNInfo, instance_hash: str) -> str:
    """Fetch IPv6 of instance from CRN. Returns empty string if not found."""
    async with ClientSession() as session:
        async with session.get(
            f"{crn.url}{PATH_EXECUTIONS_LIST}"
        ) as resp:
            resp.raise_for_status()
            executions = await resp.json()
            if instance_hash not in executions:
                return ""
            interface = IPv6Interface(
                executions[instance_hash]["networking"]["ipv6"]
            )
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


async def deploy_instance(
    private_key: str,
    vcpus: int = 2,
    memory: int = 4096,
) -> tuple[str, str]:
    """
    Full deployment flow:
    1. Check ALEPH balance >= 1
    2. Read user SSH pubkey
    3. Create instance message
    4. Create Superfluid flows
    5. Notify CRN
    6. Wait for IP

    Returns (instance_hash, ipv6_address).
    """
    account = get_aleph_account(private_key)
    crn = DEFAULT_CRN

    # Check ALEPH balance
    balance = account.get_token_balance()
    if balance < MIN_ALEPH_BALANCE:
        raise ValueError(
            f"ALEPH balance is {balance}, need at least {MIN_ALEPH_BALANCE}. "
            f"Fund {account.get_address()} with ALEPH tokens on Base."
        )

    # Read SSH pubkey
    ssh_pubkey = get_user_ssh_pubkey()

    # 1. Create instance
    instance_msg = await create_instance(
        account, crn, vcpus=vcpus, memory=memory, ssh_pubkey=ssh_pubkey,
    )
    instance_hash = instance_msg.item_hash

    # 2. Create PAYG flows
    await create_flows(account, instance_hash, crn)

    # 3. Notify CRN
    await notify_allocation(crn, instance_hash)

    # 4. Wait for instance to be up
    ip = await wait_for_instance(crn, instance_hash)

    return instance_hash, ip
