import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

export const publicClient = createPublicClient({
  chain: base,
  transport: http("https://base-mainnet.infura.io/v3/d669d5aa548840aaae9e704167ac5947"),
});
