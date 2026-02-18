import { Decimal } from "decimal.js";
import { type Address, formatUnits } from "viem";
import type { EvmWalletProvider, Network } from "@coinbase/agentkit";
import {
  ERC20_ABI,
  COMET_ABI,
  PRICE_FEED_ABI,
  COMET_ADDRESSES,
  ASSET_ADDRESSES,
} from "./constants.js";

export const getTokenDecimals = async (
  wallet: EvmWalletProvider,
  tokenAddress: Address,
): Promise<number> => {
  const decimals = await wallet.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "decimals",
  });
  return Number(decimals);
};

export const getTokenSymbol = async (
  wallet: EvmWalletProvider,
  tokenAddress: Address,
): Promise<string> => {
  return wallet.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "symbol",
  });
};

export const getTokenBalance = async (
  wallet: EvmWalletProvider,
  tokenAddress: Address,
): Promise<bigint> => {
  return wallet.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [wallet.getAddress() as `0x${string}`],
  });
};

export const getCollateralBalance = async (
  wallet: EvmWalletProvider,
  cometAddress: Address,
  tokenAddress: Address,
): Promise<bigint> => {
  return wallet.readContract({
    address: cometAddress,
    abi: COMET_ABI,
    functionName: "collateralBalanceOf",
    args: [(await wallet.getAddress()) as `0x${string}`, tokenAddress],
  });
};

export const getBaseAssetBalance = async (
  wallet: EvmWalletProvider,
  cometAddress: Address,
): Promise<bigint> => {
  return wallet.readContract({
    address: cometAddress,
    abi: COMET_ABI,
    functionName: "balanceOf",
    args: [(await wallet.getAddress()) as `0x${string}`],
  });
};

export const getHealthRatio = async (
  wallet: EvmWalletProvider,
  cometAddress: Address,
): Promise<Decimal> => {
  const borrowDetails = await getBorrowDetails(wallet, cometAddress);
  const supplyDetails = await getSupplyDetails(wallet, cometAddress);

  const borrowValue = borrowDetails.borrowAmount.mul(borrowDetails.price);
  let totalAdjustedCollateral = new Decimal(0);

  for (const supply of supplyDetails) {
    const collateralValue = supply.supplyAmount.mul(supply.price);
    const adjustedValue = collateralValue.mul(supply.collateralFactor);
    totalAdjustedCollateral = totalAdjustedCollateral.add(adjustedValue);
  }

  return borrowValue.eq(0) ? new Decimal(Infinity) : totalAdjustedCollateral.div(borrowValue);
};

export const getHealthRatioAfterWithdraw = async (
  wallet: EvmWalletProvider,
  cometAddress: Address,
  tokenAddress: Address,
  amount: bigint,
): Promise<Decimal> => {
  const borrowDetails = await getBorrowDetails(wallet, cometAddress);
  const supplyDetails = await getSupplyDetails(wallet, cometAddress);
  const borrowValue = borrowDetails.borrowAmount.mul(borrowDetails.price);
  let totalAdjustedCollateral = new Decimal(0);

  for (const supply of supplyDetails) {
    const supplyTokenSymbol = supply.tokenSymbol;
    const withdrawTokenSymbol = await getTokenSymbol(wallet, tokenAddress);

    if (supplyTokenSymbol === withdrawTokenSymbol) {
      const decimals = await getTokenDecimals(wallet, tokenAddress);
      const withdrawAmountHuman = new Decimal(formatUnits(amount, decimals));
      const newSupplyAmount = supply.supplyAmount.sub(withdrawAmountHuman);
      const assetValue = newSupplyAmount.mul(supply.price);
      totalAdjustedCollateral = totalAdjustedCollateral.add(
        assetValue.mul(supply.collateralFactor),
      );
    } else {
      totalAdjustedCollateral = totalAdjustedCollateral.add(
        supply.supplyAmount.mul(supply.price).mul(supply.collateralFactor),
      );
    }
  }

  return borrowValue.eq(0) ? new Decimal(Infinity) : totalAdjustedCollateral.div(borrowValue);
};

export const getHealthRatioAfterBorrow = async (
  wallet: EvmWalletProvider,
  cometAddress: Address,
  amount: bigint,
): Promise<Decimal> => {
  const borrowDetails = await getBorrowDetails(wallet, cometAddress);
  const supplyDetails = await getSupplyDetails(wallet, cometAddress);

  const baseToken = await getBaseTokenAddress(wallet, cometAddress);
  const baseDecimals = await getTokenDecimals(wallet, baseToken);

  const additionalBorrow = new Decimal(formatUnits(amount, baseDecimals));
  const newBorrow = borrowDetails.borrowAmount.add(additionalBorrow);
  const newBorrowValue = newBorrow.mul(borrowDetails.price);

  let totalAdjustedCollateral = new Decimal(0);
  for (const supply of supplyDetails) {
    totalAdjustedCollateral = totalAdjustedCollateral.add(
      supply.supplyAmount.mul(supply.price).mul(supply.collateralFactor),
    );
  }

  return newBorrowValue.eq(0) ? new Decimal(Infinity) : totalAdjustedCollateral.div(newBorrowValue);
};

export const getPortfolioDetailsMarkdown = async (
  wallet: EvmWalletProvider,
  cometAddress: Address,
): Promise<string> => {
  let markdownOutput = "# Portfolio Details\n\n";
  let totalSupplyValue = new Decimal(0);

  // Base asset supply (e.g. USDC) — tracked via Comet.balanceOf(), earns APY
  markdownOutput += "## Base Asset Supply\n\n";
  const baseAssetBalance = await getBaseAssetBalance(wallet, cometAddress);
  const baseToken = await getBaseTokenAddress(wallet, cometAddress);
  const baseDecimals = await getTokenDecimals(wallet, baseToken);
  const baseSymbol = await getTokenSymbol(wallet, baseToken);
  const basePriceFeed = await wallet.readContract({
    address: cometAddress,
    abi: COMET_ABI,
    functionName: "baseTokenPriceFeed",
    args: [],
  });
  const [basePriceRaw] = await getPriceFeedData(wallet, basePriceFeed);
  const basePrice = new Decimal(basePriceRaw).div(new Decimal(10).pow(8));
  const baseSupplyAmount = new Decimal(formatUnits(baseAssetBalance, baseDecimals));

  if (baseAssetBalance > BigInt(0)) {
    const baseValue = baseSupplyAmount.mul(basePrice);
    markdownOutput += `### ${baseSymbol} (Base Asset — earns supply APY)\n`;
    markdownOutput += `- **Supply Amount:** ${baseSupplyAmount.toFixed(baseDecimals)}\n`;
    markdownOutput += `- **Price:** $${basePrice.toFixed(2)}\n`;
    markdownOutput += `- **Asset Value:** $${baseValue.toFixed(2)}\n\n`;
    totalSupplyValue = totalSupplyValue.add(baseValue);
  } else {
    markdownOutput += "No base asset supplied.\n\n";
  }

  // Collateral assets — tracked via collateralBalanceOf(), used to back borrows
  markdownOutput += "## Collateral Details\n\n";
  const supplyDetails = await getSupplyDetails(wallet, cometAddress);

  if (supplyDetails.length > 0) {
    for (const supply of supplyDetails) {
      const assetValue = supply.supplyAmount.mul(supply.price);
      markdownOutput += `### ${supply.tokenSymbol}\n`;
      markdownOutput += `- **Supply Amount:** ${supply.supplyAmount.toFixed(supply.decimals)}\n`;
      markdownOutput += `- **Price:** $${supply.price.toFixed(2)}\n`;
      markdownOutput += `- **Collateral Factor:** ${supply.collateralFactor.toFixed(2)}\n`;
      markdownOutput += `- **Asset Value:** $${assetValue.toFixed(2)}\n\n`;
      totalSupplyValue = totalSupplyValue.add(assetValue);
    }
  } else {
    markdownOutput += "No collateral assets supplied.\n\n";
  }

  markdownOutput += `### Total Supply Value: $${totalSupplyValue.toFixed(2)}\n\n`;
  markdownOutput += "## Borrow Details\n\n";
  const borrowDetails = await getBorrowDetails(wallet, cometAddress);

  if (borrowDetails.borrowAmount.gt(0)) {
    const borrowValue = borrowDetails.borrowAmount.mul(borrowDetails.price);
    markdownOutput += `### ${borrowDetails.tokenSymbol}\n`;
    markdownOutput += `- **Borrow Amount:** ${borrowDetails.borrowAmount.toFixed(6)}\n`;
    markdownOutput += `- **Price:** $${borrowDetails.price.toFixed(2)}\n`;
    markdownOutput += `- **Borrow Value:** $${borrowValue.toFixed(2)}\n\n`;
  } else {
    markdownOutput += "No borrowed assets found in your Compound position.\n\n";
  }

  markdownOutput += "## Overall Health\n\n";
  const healthRatio = await getHealthRatio(wallet, cometAddress);
  markdownOutput += `- **Health Ratio:** ${healthRatio.toFixed(2)}\n`;

  return markdownOutput;
};

const getPriceFeedData = async (
  wallet: EvmWalletProvider,
  priceFeedAddress: Address,
): Promise<[string, number]> => {
  const latestData = await wallet.readContract({
    address: priceFeedAddress,
    abi: PRICE_FEED_ABI,
    functionName: "latestRoundData",
    args: [],
  });

  const answer = latestData[1].toString();
  const updatedAt = Number(latestData[3]);
  return [answer, updatedAt];
};

const getBorrowDetails = async (
  wallet: EvmWalletProvider,
  cometAddress: Address,
): Promise<{ tokenSymbol: string; borrowAmount: Decimal; price: Decimal }> => {
  const borrowAmountRaw = await wallet.readContract({
    address: cometAddress,
    abi: COMET_ABI,
    functionName: "borrowBalanceOf",
    args: [(await wallet.getAddress()) as `0x${string}`],
  });

  const baseToken = await getBaseTokenAddress(wallet, cometAddress);
  const baseDecimals = await getTokenDecimals(wallet, baseToken);
  const baseTokenSymbol = await getTokenSymbol(wallet, baseToken);

  const basePriceFeed = await wallet.readContract({
    address: cometAddress,
    abi: COMET_ABI,
    functionName: "baseTokenPriceFeed",
    args: [],
  });

  const [basePriceRaw] = await getPriceFeedData(wallet, basePriceFeed);
  const humanBorrowAmount = new Decimal(formatUnits(borrowAmountRaw, baseDecimals));
  const price = new Decimal(basePriceRaw).div(new Decimal(10).pow(8));

  return { tokenSymbol: baseTokenSymbol, borrowAmount: humanBorrowAmount, price };
};

const getSupplyDetails = async (
  wallet: EvmWalletProvider,
  cometAddress: Address,
): Promise<
  Array<{
    tokenSymbol: string;
    supplyAmount: Decimal;
    price: Decimal;
    collateralFactor: Decimal;
    decimals: number;
  }>
> => {
  const numAssets = await wallet.readContract({
    address: cometAddress,
    abi: COMET_ABI,
    functionName: "numAssets",
    args: [],
  });

  const supplyDetails: Array<{
    tokenSymbol: string;
    supplyAmount: Decimal;
    price: Decimal;
    collateralFactor: Decimal;
    decimals: number;
  }> = [];

  for (let i = 0; i < numAssets; i++) {
    const assetInfo = await wallet.readContract({
      address: cometAddress,
      abi: COMET_ABI,
      functionName: "getAssetInfo",
      args: [i],
    });

    const assetAddress = assetInfo.asset;
    const collateralBalance = await getCollateralBalance(wallet, cometAddress, assetAddress);

    if (collateralBalance > BigInt(0)) {
      const tokenSymbol = await getTokenSymbol(wallet, assetAddress);
      const decimals = await getTokenDecimals(wallet, assetAddress);
      const [priceRaw] = await getPriceFeedData(wallet, assetInfo.priceFeed);
      const humanSupplyAmount = new Decimal(formatUnits(collateralBalance, decimals));
      const price = new Decimal(priceRaw).div(new Decimal(10).pow(8));
      const collateralFactor = new Decimal(assetInfo.borrowCollateralFactor.toString()).div(
        new Decimal(10).pow(18),
      );

      supplyDetails.push({
        tokenSymbol,
        supplyAmount: humanSupplyAmount,
        price,
        collateralFactor,
        decimals,
      });
    }
  }

  return supplyDetails;
};

export const getCometAddress = (network: Network): Address => {
  if (!network.networkId) {
    throw new Error("Network ID is required");
  }
  if (network.networkId === "base-mainnet") {
    return COMET_ADDRESSES["base-mainnet"];
  } else if (network.networkId === "base-sepolia") {
    return COMET_ADDRESSES["base-sepolia"];
  }
  throw new Error(`Network ${network.networkId} not supported`);
};

export const getAssetAddress = (network: Network, assetId: string): Address => {
  if (!network.networkId) {
    throw new Error("Network ID is required");
  }
  const normalizedAssetId = assetId.toLowerCase();
  if (network.networkId === "base-mainnet") {
    const address = ASSET_ADDRESSES["base-mainnet"][normalizedAssetId];
    if (!address) throw new Error(`Asset ${assetId} not supported on Base Mainnet`);
    return address;
  } else if (network.networkId === "base-sepolia") {
    const address = ASSET_ADDRESSES["base-sepolia"][normalizedAssetId];
    if (!address) throw new Error(`Asset ${assetId} not supported on Base Sepolia`);
    return address;
  }
  throw new Error(`Network ${network.networkId} not supported`);
};

export const getBaseTokenAddress = async (
  wallet: EvmWalletProvider,
  cometAddress: Address,
): Promise<Address> => {
  return wallet.readContract({
    address: cometAddress,
    abi: COMET_ABI,
    functionName: "baseToken",
    args: [],
  });
};
