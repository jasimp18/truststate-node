/**
 * TrustState V3 Core Types
 *
 * All types for the V3 BaaS-native compliance engine.
 */

// Re-export BaaS types consumers need
export type {
  BaasDocument,
  BaasInsertResult,
  BaasMerkleProof,
  BaasStateTransition,
  BaasFindResult,
} from '@hsuite/smart-engines-sdk';

/**
 * Compliance write request — the core input to TrustState V3.
 */
export interface WriteRequest {
  /** Entity type/category (e.g. "AgentResponse", "Transaction") */
  entityType: string;
  /** The data payload to validate */
  data: Record<string, unknown>;
  /** Optional entity identifier (auto-generated if omitted) */
  entityId?: string;
  /** Schema version to validate against */
  schemaVersion?: string;
  /** Actor performing the write */
  actorId?: string;
  /** Optional action type (default: "create") */
  action?: 'create' | 'update' | 'delete';
  /** Evidence items (for ExternalEvidenceAtom / BYOP) */
  evidence?: EvidenceItem[];
}

/**
 * Compliance write response — Merkle-proven compliance record.
 */
export interface WriteResponse {
  /** Whether all compliance checks passed */
  passed: boolean;
  /** Unique record ID in BaaS registry */
  recordId: string;
  /** API request identifier */
  requestId: string;
  /** Entity identifier */
  entityId: string;
  /** Merkle proof for the registry entry */
  proof: {
    root: string;
    leaf: string;
    siblings: string[];
    path: ('left' | 'right')[];
  };
  /** State transition details */
  stateTransition: {
    transitionId: string;
    previousHash: string;
    newHash: string;
    stateRoot: string;
    timestamp: number;
  };
  /** Human-readable failure reason (only when passed=false) */
  failReason?: string;
  /** Numeric step that failed */
  failedStep?: number;
  /** Violation IDs if any policies were violated */
  violationIds?: string[];
}

/**
 * Evidence item for BYOP (Bring Your Own Proof) via ExternalEvidenceAtom.
 */
export interface EvidenceItem {
  /** Oracle/source identifier */
  oracleId: string;
  /** Evidence payload (will be hashed for verification) */
  payload: string;
  /** Ed25519 signature of the payload hash */
  signature: string;
  /** Timestamp of the evidence (Unix ms) */
  timestamp: number;
}

/**
 * Schema definition stored in BaaS.
 */
export interface SchemaDefinition {
  /** Schema name (unique per entity type + version) */
  name: string;
  /** Entity type this schema applies to */
  entityType: string;
  /** Schema version */
  version: string;
  /** JSON Schema for data validation */
  jsonSchema: Record<string, unknown>;
  /** Status lifecycle */
  status: 'draft' | 'active' | 'deprecated' | 'archived';
  /** Created timestamp (ISO) */
  createdAt: string;
  /** Updated timestamp (ISO) */
  updatedAt: string;
}

/**
 * Policy definition stored in BaaS.
 */
export interface PolicyDefinition {
  /** Policy name */
  name: string;
  /** Entity type this policy applies to */
  entityType: string;
  /** V3 atom configurations that compose this policy's molecule */
  atoms: AtomConfig[];
  /** Policy status lifecycle */
  status: 'draft' | 'active' | 'disabled' | 'archived';
  /** Enforcement mode */
  enforcement: 'strict' | 'warn' | 'log';
  /** Priority (lower = evaluated first) */
  priority: number;
  /** Created timestamp (ISO) */
  createdAt: string;
  /** Updated timestamp (ISO) */
  updatedAt: string;
}

/**
 * Configuration for a single V3 atom within a policy molecule.
 */
export interface AtomConfig {
  /** Atom type from V3 rules engine */
  type:
    | 'time-range'
    | 'cron-schedule'
    | 'limits'
    | 'rate-limiter'
    | 'permission-list'
    | 'snapshot'
    | 'workflow-state'
    | 'external-evidence'
    | 'schema-validation'
    | 'field-values'
    | 'registry-reference'
    | 'count-approval'
    | 'approval-threshold'
    | 'cooldown';
  /** Atom-specific configuration */
  config: Record<string, unknown>;
  /** Whether this atom is required (fail-closed) or advisory (fail-open) */
  required: boolean;
}

/**
 * Entity state record for WorkflowStateAtom tracking.
 */
export interface EntityState {
  /** Entity identifier */
  entityId: string;
  /** Entity type */
  entityType: string;
  /** Current workflow state */
  currentState: string;
  /** Previous state (null if initial) */
  previousState: string | null;
  /** State transition history (last N) */
  history: StateTransitionRecord[];
  /** Last updated timestamp (ISO) */
  updatedAt: string;
}

/**
 * A single state transition record.
 */
export interface StateTransitionRecord {
  from: string | null;
  to: string;
  actorId: string;
  timestamp: string;
  transitionId: string;
}

/**
 * Violation record stored in BaaS.
 */
export interface ViolationRecord {
  /** Violation ID */
  violationId: string;
  /** Entity that violated the policy */
  entityId: string;
  /** Entity type */
  entityType: string;
  /** Policy that was violated */
  policyName: string;
  /** Which atom(s) failed */
  failedAtoms: string[];
  /** Human-readable explanation */
  reason: string;
  /** Original data that triggered the violation */
  data: Record<string, unknown>;
  /** Actor who submitted */
  actorId: string;
  /** Enforcement action taken */
  enforcement: 'rejected' | 'warned' | 'logged';
  /** Timestamp (ISO) */
  createdAt: string;
}

/**
 * Batch write request.
 */
export interface BatchWriteRequest {
  /** Items to validate and write */
  items: WriteRequest[];
  /** Optional feed label */
  feedLabel?: string;
}

/**
 * Batch write response.
 */
export interface BatchWriteResponse {
  /** Unique batch ID */
  batchId: string;
  /** Total items submitted */
  total: number;
  /** Items that passed */
  accepted: number;
  /** Items that failed */
  rejected: number;
  /** Per-item results */
  results: WriteResponse[];
  /** Feed label echo */
  feedLabel?: string;
}
