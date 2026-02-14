# Base mainnet
BASE_RPC_URL = "https://mainnet.base.org"
BASE_CHAIN_ID = 8453

# USDC on Base
USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
USDC_DECIMALS = 6

# Minimal ERC20 ABI for balanceOf
ERC20_BALANCE_ABI = [
    {
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    }
]

# L2Registrar on Base (ENS subnames for basileus-agent.eth)
L2_REGISTRAR_ADDRESS = "0xBb3699a3018A8a82A94be194eCfe65512AD8E995"

L2_REGISTRAR_ABI = [
    {
        "inputs": [{"name": "owner", "type": "address"}],
        "name": "reverseNames",
        "outputs": [{"name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "label", "type": "string"}],
        "name": "available",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "label", "type": "string"},
            {"name": "owner", "type": "address"},
        ],
        "name": "register",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]

# IPFS content hash (EIP-1577 encoded) — output of `npm run deploy:ipfs` in frontend/
FRONTEND_CONTENT_HASH = "0xe30101701220976a1c290e6518d21e420f284ad14b6008c08517d266a02e18f349bbf5ff0484"

# L2Registry on Base (ENS resolver for subnames)
L2_REGISTRY_ADDRESS = "0x2e84f843299a132103e110c948c5e4739682c961"

L2_REGISTRY_ABI = [
    {
        "inputs": [],
        "name": "baseNode",
        "outputs": [{"name": "", "type": "bytes32"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "parentNode", "type": "bytes32"},
            {"name": "label", "type": "string"},
        ],
        "name": "makeNode",
        "outputs": [{"name": "", "type": "bytes32"}],
        "stateMutability": "pure",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "node", "type": "bytes32"},
            {"name": "hash", "type": "bytes"},
        ],
        "name": "setContenthash",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "node", "type": "bytes32"}],
        "name": "contenthash",
        "outputs": [{"name": "", "type": "bytes"}],
        "stateMutability": "view",
        "type": "function",
    },
]
