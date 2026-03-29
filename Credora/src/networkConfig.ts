import { getFullnodeUrl } from "@iota/iota-sdk/client";
import {
  DEVNET_PACKAGE_ID,
  TESTNET_PACKAGE_ID,
  MAINNET_PACKAGE_ID,
} from "./constants.ts";
import { createNetworkConfig } from "@iota/dapp-kit";

const envPackageByNetwork: Record<"devnet" | "testnet" | "mainnet", string | undefined> = {
  devnet: import.meta.env.VITE_IOTA_DEVNET_PACKAGE_ID,
  testnet: import.meta.env.VITE_IOTA_TESTNET_PACKAGE_ID,
  mainnet: import.meta.env.VITE_IOTA_MAINNET_PACKAGE_ID,
};

const envRpcByNetwork: Record<"devnet" | "testnet" | "mainnet", string | undefined> = {
  devnet: import.meta.env.VITE_IOTA_DEVNET_RPC_URL,
  testnet: import.meta.env.VITE_IOTA_TESTNET_RPC_URL,
  mainnet: import.meta.env.VITE_IOTA_MAINNET_RPC_URL,
};

const configuredDefaultNetwork = import.meta.env.VITE_IOTA_DEFAULT_NETWORK;
export const DEFAULT_NETWORK: "devnet" | "testnet" | "mainnet" =
  configuredDefaultNetwork === "testnet" || configuredDefaultNetwork === "mainnet"
    ? configuredDefaultNetwork
    : "devnet";

const { networkConfig, useNetworkVariable, useNetworkVariables } =
  createNetworkConfig({
    devnet: {
      url: envRpcByNetwork.devnet || getFullnodeUrl("devnet"),
      variables: {
        packageId: envPackageByNetwork.devnet || DEVNET_PACKAGE_ID,
      },
    },
    testnet: {
      url: envRpcByNetwork.testnet || getFullnodeUrl("testnet"),
      variables: {
        packageId: envPackageByNetwork.testnet || TESTNET_PACKAGE_ID,
      },
    },
    mainnet: {
      url: envRpcByNetwork.mainnet || getFullnodeUrl("mainnet"),
      variables: {
        packageId: envPackageByNetwork.mainnet || MAINNET_PACKAGE_ID,
      },
    },
  });

export { useNetworkVariable, useNetworkVariables, networkConfig };
