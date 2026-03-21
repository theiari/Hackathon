/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_NOTARIZATION_API_URL?: string;
	readonly VITE_IOTA_DEFAULT_NETWORK?: "devnet" | "testnet" | "mainnet";
	readonly VITE_IOTA_DEVNET_RPC_URL?: string;
	readonly VITE_IOTA_TESTNET_RPC_URL?: string;
	readonly VITE_IOTA_MAINNET_RPC_URL?: string;
	readonly VITE_IOTA_DEVNET_PACKAGE_ID?: string;
	readonly VITE_IOTA_TESTNET_PACKAGE_ID?: string;
	readonly VITE_IOTA_MAINNET_PACKAGE_ID?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
