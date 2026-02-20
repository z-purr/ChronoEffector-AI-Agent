# ERC-8021 builder code (Base)
BUILDER_CODE = "bc_kj26kx76"

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
FRONTEND_CONTENT_HASH = (
    "0xe301017012209304718dc62f041fb150fc5d6c067ebea5331aca06cb650724276e0727f423e6"
)

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

# ERC-8004 IdentityRegistry on Base
ERC8004_IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"

ERC8004_IDENTITY_REGISTRY_ABI = [
    {
        "inputs": [
            {"name": "agentURI", "type": "string"},
            {
                "name": "metadata",
                "type": "tuple[]",
                "components": [
                    {"name": "key", "type": "string"},
                    {"name": "value", "type": "bytes"},
                ],
            },
        ],
        "name": "register",
        "outputs": [{"name": "agentId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "index", "type": "uint256"},
        ],
        "name": "tokenOfOwnerByIndex",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "agentId", "type": "uint256"},
            {"indexed": False, "name": "agentURI", "type": "string"},
            {"indexed": True, "name": "owner", "type": "address"},
        ],
        "name": "Registered",
        "type": "event",
    },
]
