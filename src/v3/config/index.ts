/**
 * TrustState V3 Configuration
 *
 * BaaS-native configuration — no Redis, no Postgres, no worker pool.
 * V3 BaaS is the only database.
 */

export interface TrustStateV3Config {
  /** Smart Host URL (V3 BaaS endpoint) */
  hostUrl: string;
  /** TrustState application ID (assigned after registration) */
  appId?: string;
  /** Application name for registration */
  appName: string;
  /** Blockchain chain for auth */
  chain: 'hedera' | 'xrpl' | 'polkadot' | 'solana';
  /** Wallet address for BaaS authentication */
  walletAddress: string;
  /** Public key (hex) for auth */
  publicKey: string;
  /** Signing function for challenge-response auth */
  signFn: (message: string) => string | Promise<string>;
  /** Allow HTTP (dev only) */
  allowInsecure?: boolean;
  /** Request timeout ms */
  timeout?: number;
}

/**
 * BaaS collection names — single source of truth.
 * Every collection is a BaaS collection (Merkle-proven, auto-anchored).
 */
export const COLLECTIONS = {
  /** Compliance record registry — all validated writes */
  REGISTRY: 'truststate-registry',
  /** Policy violations log */
  VIOLATIONS: 'truststate-violations',
  /** Entity state tracking (for WorkflowStateAtom) */
  ENTITY_STATE: 'truststate-entity-state',
  /** Schema definitions */
  SCHEMAS: 'truststate-schemas',
  /** Policy definitions */
  POLICIES: 'truststate-policies',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/**
 * Default V3 services required by TrustState
 */
export const REQUIRED_SERVICES = ['auth', 'database', 'messaging'] as const;
