from eth_account import Account
from web3 import Web3

from basileus.chain.constants import (
    ALEPH_ADDRESS,
    ALEPH_DECIMALS,
    BASE_CHAIN_ID,
    ERC20_BALANCE_ABI,
    MIN_ETH_RESERVE,
    TARGET_ALEPH_TOKENS,
    UNISWAP_ALEPH_POOL,
    UNISWAP_FEE_ALEPH,
    UNISWAP_FEE_USDC,
    UNISWAP_POOL_ABI,
    UNISWAP_ROUTER,
    UNISWAP_ROUTER_ABI,
    USDC_ADDRESS,
    WETH_ADDRESS,
)


def get_aleph_price(w3: Web3) -> float:
    """Read ALEPH/ETH price from Uniswap V3 pool. Returns aleph_per_eth."""
    pool = w3.eth.contract(
        address=Web3.to_checksum_address(UNISWAP_ALEPH_POOL),
        abi=UNISWAP_POOL_ABI,
    )
    slot0 = pool.functions.slot0().call()
    sqrt_price_x96 = slot0[0]
    price = sqrt_price_x96 / (2**96)
    return price * price


def _send_swap(
    w3: Web3,
    private_key: str,
    token_out: str,
    fee: int,
    eth_amount: float,
) -> str:
    """Execute Uniswap V3 exactInputSingle swap from ETH. Returns tx hash."""
    account = Account.from_key(private_key)
    address = account.address
    amount_wei = w3.to_wei(eth_amount, "ether")

    router = w3.eth.contract(
        address=Web3.to_checksum_address(UNISWAP_ROUTER),
        abi=UNISWAP_ROUTER_ABI,
    )

    tx_data = router.functions.exactInputSingle(
        (
            Web3.to_checksum_address(WETH_ADDRESS),  # tokenIn
            Web3.to_checksum_address(token_out),  # tokenOut
            fee,  # fee
            Web3.to_checksum_address(address),  # recipient
            amount_wei,  # amountIn
            0,  # amountOutMinimum
            0,  # sqrtPriceLimitX96
        )
    ).build_transaction(
        {  # type: ignore[arg-type]
            "from": address,
            "value": amount_wei,
            "nonce": w3.eth.get_transaction_count(address),
            "gas": 500_000,
            "maxFeePerGas": w3.eth.gas_price * 2,
            "maxPriorityFeePerGas": w3.to_wei(0.001, "gwei"),
            "chainId": BASE_CHAIN_ID,
        }
    )

    signed = account.sign_transaction(tx_data)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    if receipt["status"] != 1:
        raise RuntimeError(f"Swap transaction reverted: 0x{tx_hash.hex()}")
    return tx_hash.hex()


def swap_eth_to_aleph(w3: Web3, private_key: str, eth_amount: float) -> str:
    """Swap ETH -> ALEPH via Uniswap V3. Returns tx hash."""
    return _send_swap(w3, private_key, ALEPH_ADDRESS, UNISWAP_FEE_ALEPH, eth_amount)


def swap_eth_to_usdc(w3: Web3, private_key: str, eth_amount: float) -> str:
    """Swap ETH -> USDC via Uniswap V3. Returns tx hash."""
    return _send_swap(w3, private_key, USDC_ADDRESS, UNISWAP_FEE_USDC, eth_amount)


def get_aleph_balance(w3: Web3, address: str) -> float:
    """Get ALEPH token balance for address. Returns human-readable float."""
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(ALEPH_ADDRESS),
        abi=ERC20_BALANCE_ABI,
    )
    raw = contract.functions.balanceOf(Web3.to_checksum_address(address)).call()
    return raw / (10**ALEPH_DECIMALS)


def compute_aleph_swap_eth(w3: Web3) -> float:
    """Compute ETH needed to get ~TARGET_ALEPH_TOKENS ALEPH. Returns ETH amount."""
    aleph_per_eth = get_aleph_price(w3)
    if aleph_per_eth <= 0:
        raise ValueError("Could not read ALEPH price from pool")
    eth_needed = TARGET_ALEPH_TOKENS / aleph_per_eth
    # Add 5% buffer for slippage
    return round(eth_needed * 1.05, 6)


def compute_usdc_swap_eth(eth_balance: float) -> float:
    """Compute ETH to swap to USDC = balance - gas reserve. Call after ALEPH swap."""
    remaining = eth_balance - MIN_ETH_RESERVE
    if remaining <= 0:
        return 0.0
    return round(remaining, 6)
