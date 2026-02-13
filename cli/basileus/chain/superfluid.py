import asyncio
from dataclasses import dataclass
from decimal import Decimal

from aleph.sdk.chains.ethereum import ETHAccount
from aleph.sdk.client.authenticated_http import AuthenticatedAlephHttpClient
from aleph.sdk.evm_utils import FlowUpdate
from aleph_message.models import InstanceMessage

from basileus.infra.aleph import ALEPH_API_URL, COMMUNITY_RECEIVER, CRNInfo

COMMUNITY_FLOW_PERCENTAGE = Decimal("0.2")


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

    receipt = account._provider.eth.wait_for_transaction_receipt(  # type: ignore[union-attr]
        HexBytes(tx_hash), timeout=60
    )
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
