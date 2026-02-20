import { z } from "zod";
import { customActionProvider, EvmWalletProvider } from "@coinbase/agentkit";
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
} from "viem";
import { base } from "viem/chains";
import {
  USDC_ADDRESS,
  WETH_ADDRESS,
  UNISWAP_ROUTER,
  uniswapRouterAbi,
  uniswapRouterMulticallAbi,
  uniswapRouterUnwrapAbi,
} from "./constants.js";

const USDC_DECIMALS = 6;

export function createSwapActionProvider(rpcUrl?: string) {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  return customActionProvider<EvmWalletProvider>([
    {
      name: "swap_usdc_to_eth",
      description:
        "Swap USDC to ETH via Uniswap V3 to replenish gas. Handles approval, swap, and WETH unwrap in one transaction.",
      schema: z.object({
        usdcAmount: z.string().describe("Amount of USDC to swap, e.g. '1.5'"),
      }),
      invoke: async (walletProvider: EvmWalletProvider, args: { usdcAmount: string }) => {
        try {
          const address = walletProvider.getAddress() as `0x${string}`;
          const amountAtomic = parseUnits(args.usdcAmount, USDC_DECIMALS);

          // 1. Check balance
          const balance = await publicClient.readContract({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          });

          if (balance < amountAtomic) {
            return `Error: Insufficient USDC. Have ${formatUnits(balance, USDC_DECIMALS)}, need ${args.usdcAmount}`;
          }

          // 2. Check allowance and approve if needed
          const allowance = await publicClient.readContract({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, UNISWAP_ROUTER],
          });

          if (allowance < amountAtomic) {
            const approveData = encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [UNISWAP_ROUTER, amountAtomic],
            });
            const approveTx = await walletProvider.sendTransaction({
              to: USDC_ADDRESS,
              data: approveData,
            });
            await walletProvider.waitForTransactionReceipt(approveTx);
          }

          // 3. Build multicall: exactInputSingle(USDC→WETH) + unwrapWETH9
          const swapData = encodeFunctionData({
            abi: uniswapRouterAbi,
            functionName: "exactInputSingle",
            args: [
              {
                tokenIn: USDC_ADDRESS,
                tokenOut: WETH_ADDRESS,
                fee: 500,
                recipient: UNISWAP_ROUTER, // send WETH to router for unwrap
                amountIn: amountAtomic,
                amountOutMinimum: 0n,
                sqrtPriceLimitX96: 0n,
              },
            ],
          });

          const unwrapData = encodeFunctionData({
            abi: uniswapRouterUnwrapAbi,
            functionName: "unwrapWETH9",
            args: [0n, address],
          });

          const multicallData = encodeFunctionData({
            abi: uniswapRouterMulticallAbi,
            functionName: "multicall",
            args: [[swapData, unwrapData]],
          });

          const txHash = await walletProvider.sendTransaction({
            to: UNISWAP_ROUTER,
            data: multicallData,
          });

          return `Swapped ${args.usdcAmount} USDC to ETH. Tx: ${txHash}`;
        } catch (err) {
          return `Error swapping USDC to ETH: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
  ]);
}
