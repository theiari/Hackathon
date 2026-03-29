export const DEVNET_PACKAGE_ID = "0x52bcff89c205d8f8b0ec62294f1baf7d6c9f52cce6437849d68d8557b6f7ed44";
export const PACKAGE_METADATA_ID = import.meta.env.VITE_PACKAGE_METADATA_ID ?? "0x4231e7cab5f8e276c0d2bb61c72bf2ab59ebf2903f58a38aaf885a6cf52678dd";
export const TESTNET_PACKAGE_ID = "0xTODO";
export const MAINNET_PACKAGE_ID = "0xTODO";
export type NotarizationMethod = "locked" | "dynamic";

export type PayloadStrategy = "raw" | "hash";

export type DeleteLockType = "none" | "unlockAt" | "untilDestroyed";
export type TransferLockType = "none" | "unlockAt" | "untilDestroyed";

export interface LockedOptions {
  deleteLock: DeleteLockType;
  deleteUnlockAt?: number;  // unix timestamp if deleteLock === "unlockAt"
}

export interface DynamicOptions {
  transferLock: TransferLockType;
  transferUnlockAt?: number; // unix timestamp if transferLock === "unlockAt"
  updatableMetadata?: string;
}

export interface NotarizationRecord {
  id: string;
  method: NotarizationMethod;
  stateVersion: number;
  immutableDescription?: string;
  stateMetadata?: string;
  updatableMetadata?: string;
  lastStateChangeAt: number; // unix seconds
}