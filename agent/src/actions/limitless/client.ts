import { HttpClient, MarketFetcher, OrderClient, PortfolioFetcher } from "@limitless-exchange/sdk";
import { ethers } from "ethers";

export interface LimitlessClients {
  httpClient: HttpClient;
  marketFetcher: MarketFetcher;
  orderClient: OrderClient;
  portfolioFetcher: PortfolioFetcher;
  walletAddress: string;
}

export function createLimitlessClients(apiKey: string, privateKey: string): LimitlessClients {
  const httpClient = new HttpClient({ apiKey });
  const wallet = new ethers.Wallet(privateKey);
  const marketFetcher = new MarketFetcher(httpClient);
  // Cast wallet to satisfy SDK's CJS ethers.Wallet type expectation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderClient = new OrderClient({ httpClient, wallet: wallet as any, marketFetcher });
  const portfolioFetcher = new PortfolioFetcher(httpClient);
  return {
    httpClient,
    marketFetcher,
    orderClient,
    portfolioFetcher,
    walletAddress: wallet.address,
  };
}
