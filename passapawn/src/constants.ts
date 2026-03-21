export const DEVNET_PACKAGE_ID = "0xbc6b8d122ab9b277e9ba4d1173bc62fdbdd07f2f4935f6f55327f983833b9afb";
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