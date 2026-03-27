// TODO: replace {NEW_PACKAGE_ID} after redeploy.
export const DEVNET_PACKAGE_ID = "0x788410411974bcec8a75ccfc959038478e8c42d6c54e6977b20b8d5a1d8f7c36";
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