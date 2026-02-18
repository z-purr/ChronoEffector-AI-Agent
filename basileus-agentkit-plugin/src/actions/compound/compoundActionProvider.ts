/**
 * Fixed Compound action provider — local copy with base asset fixes.
 *
 * Fixes from upstream @coinbase/agentkit:
 * - get_portfolio: reads base asset supply via Comet.balanceOf() (was missing)
 * - withdraw: for base asset (USDC), checks balanceOf instead of collateralBalanceOf
 *
 * Uses customActionProvider (no decorators) so tsx/esbuild can run it.
 * TODO: Remove this directory once agentkit merges the fix.
 */
import { z } from "zod";
import { encodeFunctionData, formatUnits, parseUnits, erc20Abi } from "viem";
import { customActionProvider, EvmWalletProvider } from "@coinbase/agentkit";
import { COMET_ABI } from "./constants.js";
import {
  CompoundSupplySchema,
  CompoundWithdrawSchema,
  CompoundPortfolioSchema,
} from "./schemas.js";
import {
  getBaseAssetBalance,
  getCollateralBalance,
  getHealthRatio,
  getHealthRatioAfterWithdraw,
  getTokenBalance,
  getTokenDecimals,
  getTokenSymbol,
  getPortfolioDetailsMarkdown,
  getCometAddress,
  getAssetAddress,
  getBaseTokenAddress,
} from "./utils.js";

async function approve(
  wallet: EvmWalletProvider,
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
): Promise<string> {
  try {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spenderAddress as `0x${string}`, amount],
    });
    const txHash = await wallet.sendTransaction({
      to: tokenAddress as `0x${string}`,
      data,
    });
    await wallet.waitForTransactionReceipt(txHash);
    return `Successfully approved ${spenderAddress} to spend ${amount} tokens`;
  } catch (error) {
    return `Error approving tokens: ${error}`;
  }
}

export const compoundFixedProvider = customActionProvider<EvmWalletProvider>([
  {
    name: "compound_supply",
    description:
      "Supply assets to Compound. assetId: 'weth', 'cbeth', 'cbbtc', 'wsteth', or 'usdc'. amount: human-readable.",
    schema: CompoundSupplySchema,
    invoke: async (wallet, args) => {
      try {
        const network = wallet.getNetwork();
        const cometAddress = getCometAddress(network);
        const tokenAddress = getAssetAddress(network, args.assetId);

        const decimals = await getTokenDecimals(wallet, tokenAddress);
        const amountAtomic = parseUnits(args.amount, decimals);

        const walletBalance = await getTokenBalance(wallet, tokenAddress);
        if (walletBalance < amountAtomic) {
          const humanBalance = formatUnits(walletBalance, decimals);
          return `Error: Insufficient balance. You have ${humanBalance}, but trying to supply ${args.amount}`;
        }

        const approvalResult = await approve(wallet, tokenAddress, cometAddress, amountAtomic);
        if (approvalResult.startsWith("Error")) {
          return `Error approving token: ${approvalResult}`;
        }

        const data = encodeFunctionData({
          abi: COMET_ABI,
          functionName: "supply",
          args: [tokenAddress, amountAtomic],
        });
        const txHash = await wallet.sendTransaction({ to: cometAddress, data });
        await wallet.waitForTransactionReceipt(txHash);

        const sym = await getTokenSymbol(wallet, tokenAddress);
        return `Supplied ${args.amount} ${sym} to Compound.\nTransaction hash: ${txHash}`;
      } catch (err) {
        return `Error supplying to Compound: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    name: "compound_withdraw",
    description:
      "Withdraw assets from Compound. assetId: 'weth', 'cbeth', 'cbbtc', 'wsteth', or 'usdc'. amount: human-readable.",
    schema: CompoundWithdrawSchema,
    invoke: async (wallet, args) => {
      try {
        const cometAddress = getCometAddress(wallet.getNetwork());
        const tokenAddress = getAssetAddress(wallet.getNetwork(), args.assetId);

        const decimals = await getTokenDecimals(wallet, tokenAddress);
        const amountAtomic = parseUnits(args.amount, decimals);

        const baseTokenAddress = await getBaseTokenAddress(wallet, cometAddress);
        const isBaseAsset = tokenAddress.toLowerCase() === baseTokenAddress.toLowerCase();

        if (isBaseAsset) {
          const baseBalance = await getBaseAssetBalance(wallet, cometAddress);
          if (amountAtomic > baseBalance) {
            return `Error: Insufficient balance. Trying to withdraw ${args.amount}, but only have ${formatUnits(baseBalance, decimals)} supplied`;
          }
        } else {
          const collateralBalance = await getCollateralBalance(wallet, cometAddress, tokenAddress);
          if (amountAtomic > collateralBalance) {
            return `Error: Insufficient balance. Trying to withdraw ${args.amount}, but only have ${formatUnits(collateralBalance, decimals)} supplied`;
          }

          const projectedHealth = await getHealthRatioAfterWithdraw(
            wallet,
            cometAddress,
            tokenAddress,
            amountAtomic,
          );
          if (projectedHealth.lessThan(1)) {
            return `Error: Withdrawing ${args.amount} would result in unhealthy position. Health ratio would be ${projectedHealth.toFixed(2)}`;
          }
        }

        const data = encodeFunctionData({
          abi: COMET_ABI,
          functionName: "withdraw",
          args: [tokenAddress, amountAtomic],
        });
        const txHash = await wallet.sendTransaction({ to: cometAddress, data });
        await wallet.waitForTransactionReceipt(txHash);

        const sym = await getTokenSymbol(wallet, tokenAddress);
        const health = await getHealthRatio(wallet, cometAddress);
        return `Withdrawn ${args.amount} ${sym} from Compound.\nTransaction hash: ${txHash}\nHealth ratio: ${health.toFixed(2)}`;
      } catch (err) {
        return `Error withdrawing from Compound: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    name: "compound_get_portfolio",
    description:
      "Get Compound portfolio: base asset supply (earns APY), collateral balances, borrow positions.",
    schema: CompoundPortfolioSchema,
    // NOTE: must have 2 params so customActionProvider passes wallet as first arg
    invoke: async (wallet, _args) => {
      try {
        const cometAddress = getCometAddress(wallet.getNetwork());
        return await getPortfolioDetailsMarkdown(wallet, cometAddress);
      } catch (err) {
        return `Error getting portfolio: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
]);
