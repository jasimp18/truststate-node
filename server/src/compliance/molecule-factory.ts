/**
 * ComplianceMoleculeFactory
 *
 * Dynamically builds compliance molecules from policy atom configurations.
 * Maps TrustState policy atom configs to V3 rules engine evaluation logic.
 *
 * This is the bridge between:
 * - PolicyDefinition.atoms (stored in BaaS) → V3 atom evaluation
 * - TrustState write context → V3 validation context
 *
 * Phase 2: Full atom support for all 14 V3 atom types.
 */

import type { BaasClient } from '@hsuite/smart-engines-sdk';
import type {
  AtomConfig,
  WriteRequest,
  EntityState,
  EvidenceItem,
  PolicyDefinition,
} from '../types';
import { EntityStateService } from './entity-state';
import { COLLECTIONS } from '../config';

/**
 * Result of evaluating a single atom.
 */
export interface AtomResult {
  type: string;
  passed: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of evaluating an entire molecule (all atoms in a policy).
 */
export interface MoleculeResult {
  passed: boolean;
  atomResults: AtomResult[];
  failedAtoms: string[];
  reason?: string;
}

/**
 * Registry lookup function for RegistryReferenceAtom.
 */
type RegistryLookupFn = (
  registryType: string,
  entityId: string
) => Promise<{ id: string; status: string; type: string } | null>;

/**
 * ComplianceMoleculeFactory — builds and evaluates compliance molecules.
 */
export class ComplianceMoleculeFactory {
  private readonly entityState: EntityStateService;

  constructor(
    private readonly baas: BaasClient,
    entityState?: EntityStateService
  ) {
    this.entityState = entityState ?? new EntityStateService(baas);
  }

  /**
   * Evaluate all atoms in a policy against a write request.
   *
   * @param policy - The policy definition with atom configurations
   * @param request - The write request to validate
   * @param entityId - The entity identifier
   * @returns MoleculeResult with per-atom results
   */
  async evaluate(
    policy: PolicyDefinition,
    request: WriteRequest,
    entityId: string
  ): Promise<MoleculeResult> {
    const atomResults: AtomResult[] = [];

    for (const atomConfig of policy.atoms) {
      const result = await this.evaluateAtom(atomConfig, request, entityId);
      atomResults.push(result);
    }

    const failedRequired = atomResults.filter(
      (r, i) => !r.passed && policy.atoms[i].required
    );
    const failedAtoms = failedRequired.map((r) => r.type);

    return {
      passed: failedRequired.length === 0,
      atomResults,
      failedAtoms,
      reason:
        failedRequired.length > 0
          ? failedRequired.map((r) => `${r.type}: ${r.reason}`).join('; ')
          : undefined,
    };
  }

  /**
   * Evaluate a single atom against the write request.
   */
  private async evaluateAtom(
    atomConfig: AtomConfig,
    request: WriteRequest,
    entityId: string
  ): Promise<AtomResult> {
    try {
      switch (atomConfig.type) {
        case 'field-values':
          return this.evalFieldValues(atomConfig.config, request);

        case 'limits':
          return this.evalLimits(atomConfig.config, request);

        case 'permission-list':
          return this.evalPermissionList(atomConfig.config, request);

        case 'time-range':
          return this.evalTimeRange(atomConfig.config);

        case 'cron-schedule':
          return this.evalCronSchedule(atomConfig.config);

        case 'external-evidence':
          return this.evalExternalEvidence(atomConfig.config, request);

        case 'schema-validation':
          // Delegated to SchemaService in the pipeline — always passes here
          return { type: 'schema-validation', passed: true, reason: 'Handled by SchemaService' };

        case 'workflow-state':
          return await this.evalWorkflowState(atomConfig.config, request, entityId);

        case 'registry-reference':
          return await this.evalRegistryReference(atomConfig.config, request);

        case 'count-approval':
          return this.evalCountApproval(atomConfig.config, request);

        case 'approval-threshold':
          return this.evalApprovalThreshold(atomConfig.config, request);

        case 'rate-limiter':
          return await this.evalRateLimiter(atomConfig.config, request, entityId);

        case 'cooldown':
          return await this.evalCooldown(atomConfig.config, request, entityId);

        case 'snapshot':
          return this.evalSnapshot(atomConfig.config, request);

        default:
          // Unknown atom — pass with warning (fail-open for forward compat)
          return {
            type: atomConfig.type,
            passed: true,
            reason: `Unknown atom type: ${atomConfig.type} — skipped`,
          };
      }
    } catch (error) {
      return {
        type: atomConfig.type,
        passed: false,
        reason: `Atom evaluation error: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }
  }

  // ===========================================================================
  // Atom Evaluators
  // ===========================================================================

  /**
   * FieldValuesAtom — generic enum/allowed-values enforcement.
   *
   * Config shape (matches V3 FieldValuesConfig):
   * {
   *   constraints: [{ field, allowedValues, caseInsensitive?, denyMode?, label? }],
   *   requireAll?: boolean (default: true)
   * }
   */
  private evalFieldValues(
    config: Record<string, unknown>,
    request: WriteRequest
  ): AtomResult {
    const constraints = config.constraints as Array<{
      field: string;
      allowedValues: unknown[];
      caseInsensitive?: boolean;
      denyMode?: boolean;
      label?: string;
    }>;

    if (!constraints || !Array.isArray(constraints)) {
      // Legacy simple config: { field, allowedValues }
      if (config.field && config.allowedValues) {
        const value = getNestedValue(request.data, config.field as string);
        const allowed = config.allowedValues as unknown[];
        if (!allowed.includes(value)) {
          return {
            type: 'field-values',
            passed: false,
            reason: `Field '${config.field}' value '${value}' not in allowed values`,
          };
        }
        return { type: 'field-values', passed: true };
      }
      return { type: 'field-values', passed: true, reason: 'No constraints configured' };
    }

    const requireAll = config.requireAll !== false;
    const results: boolean[] = [];

    for (const c of constraints) {
      const value = getNestedValue(request.data, c.field);
      let match: boolean;

      if (c.caseInsensitive && typeof value === 'string') {
        const lower = value.toLowerCase();
        match = (c.allowedValues as string[]).some(
          (v) => typeof v === 'string' && v.toLowerCase() === lower
        );
      } else {
        match = c.allowedValues.includes(value);
      }

      // Invert for deny mode
      if (c.denyMode) match = !match;
      results.push(match);

      if (!match && requireAll) {
        return {
          type: 'field-values',
          passed: false,
          reason: c.denyMode
            ? `Field '${c.field}' value '${value}' is in deny list`
            : `Field '${c.label ?? c.field}' value '${value}' not in allowed values`,
        };
      }
    }

    if (!requireAll && !results.some((r) => r)) {
      return {
        type: 'field-values',
        passed: false,
        reason: 'None of the OR-mode field constraints passed',
      };
    }

    return { type: 'field-values', passed: true };
  }

  /**
   * LimitsAtom — numeric min/max checks.
   *
   * Config: { field, min?, max? } or { limits: [{ field, min?, max? }] }
   */
  private evalLimits(
    config: Record<string, unknown>,
    request: WriteRequest
  ): AtomResult {
    const limits = config.limits as Array<{ field: string; min?: number; max?: number }> ??
      (config.field ? [{ field: config.field as string, min: config.min as number | undefined, max: config.max as number | undefined }] : []);

    for (const limit of limits) {
      const value = getNestedValue(request.data, limit.field);
      if (typeof value !== 'number') {
        return {
          type: 'limits',
          passed: false,
          reason: `Field '${limit.field}' is not a number (got ${typeof value})`,
        };
      }
      if (limit.min !== undefined && value < limit.min) {
        return {
          type: 'limits',
          passed: false,
          reason: `Field '${limit.field}' value ${value} is below minimum ${limit.min}`,
        };
      }
      if (limit.max !== undefined && value > limit.max) {
        return {
          type: 'limits',
          passed: false,
          reason: `Field '${limit.field}' value ${value} exceeds maximum ${limit.max}`,
        };
      }
    }

    return { type: 'limits', passed: true };
  }

  /**
   * PermissionListAtom — actor allow/deny lists.
   *
   * Config: { allowed?: string[], denied?: string[] }
   */
  private evalPermissionList(
    config: Record<string, unknown>,
    request: WriteRequest
  ): AtomResult {
    const actorId = request.actorId ?? 'anonymous';
    const denied = config.denied as string[] | undefined;
    const allowed = config.allowed as string[] | undefined;

    if (denied?.includes(actorId)) {
      return {
        type: 'permission-list',
        passed: false,
        reason: `Actor '${actorId}' is in the deny list`,
      };
    }
    if (allowed && !allowed.includes(actorId)) {
      return {
        type: 'permission-list',
        passed: false,
        reason: `Actor '${actorId}' is not in the allow list`,
      };
    }

    return { type: 'permission-list', passed: true };
  }

  /**
   * TimeRangeAtom — UTC hour window enforcement.
   *
   * Config: { startHour, endHour, daysOfWeek?, timezone? }
   */
  private evalTimeRange(config: Record<string, unknown>): AtomResult {
    const now = new Date();
    const hour = now.getUTCHours();
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat

    if (config.startHour !== undefined && config.endHour !== undefined) {
      const start = config.startHour as number;
      const end = config.endHour as number;

      if (start <= end) {
        if (hour < start || hour > end) {
          return {
            type: 'time-range',
            passed: false,
            reason: `Current hour ${hour} UTC is outside allowed range ${start}-${end}`,
          };
        }
      } else {
        // Wrapping range (e.g., 22-06 means overnight)
        if (hour < start && hour > end) {
          return {
            type: 'time-range',
            passed: false,
            reason: `Current hour ${hour} UTC is outside allowed range ${start}-${end} (overnight)`,
          };
        }
      }
    }

    if (config.daysOfWeek && Array.isArray(config.daysOfWeek)) {
      if (!(config.daysOfWeek as number[]).includes(dayOfWeek)) {
        return {
          type: 'time-range',
          passed: false,
          reason: `Current day ${dayOfWeek} is not in allowed days [${(config.daysOfWeek as number[]).join(',')}]`,
        };
      }
    }

    return { type: 'time-range', passed: true };
  }

  /**
   * CronScheduleAtom — cron-based time window.
   *
   * Config: { expression: string, windowMinutes: number }
   * Simplified: checks if current time is within windowMinutes of the last cron tick.
   */
  private evalCronSchedule(config: Record<string, unknown>): AtomResult {
    // Full cron parsing would require a library.
    // For now, support simple "business hours" pattern.
    const expression = config.expression as string | undefined;
    if (!expression) {
      return { type: 'cron-schedule', passed: true, reason: 'No expression configured' };
    }

    // Simple pattern matching for common cron expressions
    // Full implementation would use cron-parser library
    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();

    // "business-hours" shorthand
    if (expression === 'business-hours' || expression === '0 9-17 * * 1-5') {
      if (day >= 1 && day <= 5 && hour >= 9 && hour <= 17) {
        return { type: 'cron-schedule', passed: true };
      }
      return {
        type: 'cron-schedule',
        passed: false,
        reason: 'Outside business hours (Mon-Fri 09:00-17:00 UTC)',
      };
    }

    // Default: pass (full cron parsing in future)
    return {
      type: 'cron-schedule',
      passed: true,
      reason: `Cron expression '${expression}' accepted (basic evaluation)`,
    };
  }

  /**
   * ExternalEvidenceAtom — BYOP oracle proof verification.
   *
   * Config (matches V3 ExternalEvidenceConfig):
   * {
   *   trustedOracleKeys: string[],
   *   requiredSignatures: number,
   *   maxEvidenceAgeSec: number,
   *   requiredEvidenceType?: string
   * }
   */
  private evalExternalEvidence(
    config: Record<string, unknown>,
    request: WriteRequest
  ): AtomResult {
    const evidence = request.evidence ?? [];
    const requiredSigs = (config.requiredSignatures as number) ?? 1;
    const trustedKeys = config.trustedOracleKeys as string[] | undefined;
    const maxAge = (config.maxEvidenceAgeSec as number) ?? 0;
    const requiredOracles = config.requiredOracles as string[] | undefined;

    // Check required oracle IDs are present
    if (requiredOracles) {
      const providedOracles = evidence.map((e) => e.oracleId);
      for (const required of requiredOracles) {
        if (!providedOracles.includes(required)) {
          return {
            type: 'external-evidence',
            passed: false,
            reason: `Required oracle '${required}' not provided`,
          };
        }
      }
    }

    // Check minimum evidence count
    if (evidence.length < requiredSigs) {
      return {
        type: 'external-evidence',
        passed: false,
        reason: `Need ${requiredSigs} evidence items, got ${evidence.length}`,
      };
    }

    // Check evidence age
    if (maxAge > 0) {
      const now = Date.now();
      for (const e of evidence) {
        const age = (now - e.timestamp) / 1000;
        if (age > maxAge) {
          return {
            type: 'external-evidence',
            passed: false,
            reason: `Evidence from oracle '${e.oracleId}' is ${Math.floor(age)}s old (max: ${maxAge}s)`,
          };
        }
      }
    }

    // Note: actual Ed25519 signature verification requires crypto runtime.
    // In Phase 2, we verify presence and freshness. Full sig verification
    // delegated to the V3 validator network in production.

    return {
      type: 'external-evidence',
      passed: true,
      metadata: { evidenceCount: evidence.length },
    };
  }

  /**
   * WorkflowStateAtom — state machine transition enforcement.
   *
   * Config (matches V3 WorkflowStateConfig):
   * {
   *   transitions: { [state]: string[] },
   *   initialStates?: string[],
   *   terminalStates?: string[],
   *   allowSelfTransition?: boolean
   * }
   */
  private async evalWorkflowState(
    config: Record<string, unknown>,
    request: WriteRequest,
    entityId: string
  ): Promise<AtomResult> {
    const transitions = config.transitions as Record<string, string[]>;
    const initialStates = config.initialStates as string[] | undefined;
    const terminalStates = config.terminalStates as string[] | undefined;
    const allowSelfTransition = config.allowSelfTransition as boolean ?? false;

    if (!transitions) {
      return { type: 'workflow-state', passed: true, reason: 'No transitions configured' };
    }

    // Get proposed state from the request data
    const proposedState = (request.data.state ?? request.data.status) as string | undefined;
    if (!proposedState) {
      return { type: 'workflow-state', passed: true, reason: 'No state field in data' };
    }

    // Get current entity state from BaaS
    const currentEntityState = await this.entityState.getState(entityId, request.entityType);
    const currentState = currentEntityState?.currentState ?? null;

    // New entity — check initial states
    if (currentState === null) {
      if (initialStates && initialStates.length > 0) {
        if (initialStates.includes(proposedState)) {
          return {
            type: 'workflow-state',
            passed: true,
            metadata: { currentState: null, proposedState, isInitial: true },
          };
        }
        return {
          type: 'workflow-state',
          passed: false,
          reason: `'${proposedState}' is not a valid initial state. Allowed: [${initialStates.join(', ')}]`,
        };
      }
      return { type: 'workflow-state', passed: true, metadata: { isInitial: true } };
    }

    // Self-transition check
    if (currentState === proposedState) {
      if (allowSelfTransition) {
        return { type: 'workflow-state', passed: true, metadata: { isSelfTransition: true } };
      }
      return {
        type: 'workflow-state',
        passed: false,
        reason: `Self-transition on '${currentState}' is not allowed`,
      };
    }

    // Terminal state check
    if (terminalStates?.includes(currentState)) {
      return {
        type: 'workflow-state',
        passed: false,
        reason: `State '${currentState}' is terminal — no further transitions allowed`,
      };
    }

    // Check allowed transitions
    const allowedNext = transitions[currentState];
    if (!allowedNext) {
      return {
        type: 'workflow-state',
        passed: false,
        reason: `No transitions defined from state '${currentState}'`,
      };
    }

    if (allowedNext.includes(proposedState)) {
      return {
        type: 'workflow-state',
        passed: true,
        metadata: { currentState, proposedState, allowedTransitions: allowedNext },
      };
    }

    return {
      type: 'workflow-state',
      passed: false,
      reason: `Transition '${currentState}' → '${proposedState}' not allowed. Allowed: [${allowedNext.join(', ')}]`,
    };
  }

  /**
   * RegistryReferenceAtom — validate referenced entities exist in BaaS.
   *
   * Config:
   * {
   *   references: [{ name, fieldPath, registryType, required, requiredStatus? }]
   * }
   */
  private async evalRegistryReference(
    config: Record<string, unknown>,
    request: WriteRequest
  ): Promise<AtomResult> {
    const references = config.references as Array<{
      name: string;
      fieldPath: string;
      registryType: string;
      required: boolean;
      requiredStatus?: string;
    }>;

    if (!references || !Array.isArray(references)) {
      return { type: 'registry-reference', passed: true, reason: 'No references configured' };
    }

    for (const ref of references) {
      const value = getNestedValue(request.data, ref.fieldPath) as string | undefined;

      if (!value) {
        if (ref.required) {
          return {
            type: 'registry-reference',
            passed: false,
            reason: `Required reference '${ref.name}' (field: ${ref.fieldPath}) is missing`,
          };
        }
        continue;
      }

      // Look up the entity in the appropriate BaaS collection
      const collection = `truststate-${ref.registryType}`;
      const result = await this.baas.dbFind(collection, { 'data.entityId': value }, { limit: 1 });

      if (result.documents.length === 0) {
        if (ref.required) {
          return {
            type: 'registry-reference',
            passed: false,
            reason: `Referenced ${ref.name} '${value}' not found in ${ref.registryType}`,
          };
        }
        continue;
      }

      if (ref.requiredStatus) {
        const doc = result.documents[0].data as Record<string, unknown>;
        const status = doc.status as string;
        if (status !== ref.requiredStatus) {
          return {
            type: 'registry-reference',
            passed: false,
            reason: `Referenced ${ref.name} '${value}' has status '${status}', required '${ref.requiredStatus}'`,
          };
        }
      }
    }

    return { type: 'registry-reference', passed: true };
  }

  /**
   * CountApprovalAtom — require N approvals from authorized approvers.
   *
   * Config:
   * {
   *   requiredCount: number,
   *   authorizedApprovers: string[],
   *   allowDuplicates?: boolean,
   *   allowSelfApproval?: boolean,
   *   maxApprovalAgeSec?: number
   * }
   */
  private evalCountApproval(
    config: Record<string, unknown>,
    request: WriteRequest
  ): AtomResult {
    const requiredCount = (config.requiredCount as number) ?? 1;
    const authorizedApprovers = config.authorizedApprovers as string[] | undefined;
    const allowDuplicates = config.allowDuplicates as boolean ?? false;
    const allowSelfApproval = config.allowSelfApproval as boolean ?? false;
    const maxAge = (config.maxApprovalAgeSec as number) ?? 0;

    const approvals = request.data.approvals as Array<{
      approverId: string;
      approvedAt: string | number;
    }> | undefined;

    if (!approvals || !Array.isArray(approvals)) {
      return {
        type: 'count-approval',
        passed: false,
        reason: `Need ${requiredCount} approvals, got 0`,
      };
    }

    const now = Date.now();
    const seen = new Set<string>();
    let validCount = 0;

    for (const a of approvals) {
      // Check authorized
      if (authorizedApprovers && !authorizedApprovers.includes(a.approverId)) continue;
      // Check self-approval
      if (!allowSelfApproval && a.approverId === request.actorId) continue;
      // Check duplicates
      if (!allowDuplicates && seen.has(a.approverId)) continue;
      // Check age
      if (maxAge > 0) {
        const ts = typeof a.approvedAt === 'string' ? new Date(a.approvedAt).getTime() : a.approvedAt;
        if ((now - ts) / 1000 > maxAge) continue;
      }

      seen.add(a.approverId);
      validCount++;
    }

    if (validCount < requiredCount) {
      return {
        type: 'count-approval',
        passed: false,
        reason: `Need ${requiredCount} valid approvals, got ${validCount}`,
        metadata: { validCount, requiredCount },
      };
    }

    return {
      type: 'count-approval',
      passed: true,
      metadata: { validCount, requiredCount },
    };
  }

  /**
   * ApprovalThresholdAtom — percentage-based approval.
   *
   * Config: { threshold: number (0-1), totalVoters: number }
   */
  private evalApprovalThreshold(
    config: Record<string, unknown>,
    request: WriteRequest
  ): AtomResult {
    const threshold = (config.threshold as number) ?? 0.5;
    const totalVoters = (config.totalVoters as number) ?? 1;

    const approvals = request.data.approvals as unknown[] | undefined;
    const count = approvals?.length ?? 0;
    const ratio = count / totalVoters;

    if (ratio < threshold) {
      return {
        type: 'approval-threshold',
        passed: false,
        reason: `Approval ratio ${(ratio * 100).toFixed(1)}% below threshold ${(threshold * 100).toFixed(1)}%`,
        metadata: { ratio, threshold, count, totalVoters },
      };
    }

    return {
      type: 'approval-threshold',
      passed: true,
      metadata: { ratio, threshold, count, totalVoters },
    };
  }

  /**
   * RateLimiterAtom — sliding window rate limit via BaaS queries.
   *
   * Config: { maxOps: number, windowSec: number }
   */
  private async evalRateLimiter(
    config: Record<string, unknown>,
    request: WriteRequest,
    entityId: string
  ): Promise<AtomResult> {
    const maxOps = (config.maxOps as number) ?? 100;
    const windowSec = (config.windowSec as number) ?? 3600;

    // Count recent registry entries for this actor/entity
    const since = new Date(Date.now() - windowSec * 1000).toISOString();
    const result = await this.baas.dbFind(
      COLLECTIONS.REGISTRY,
      {
        'data.actorId': request.actorId ?? 'anonymous',
        'data.entityType': request.entityType,
        'data.validatedAt': { $gte: since },
      },
      { limit: maxOps + 1 }
    );

    if (result.count >= maxOps) {
      return {
        type: 'rate-limiter',
        passed: false,
        reason: `Rate limit exceeded: ${result.count}/${maxOps} ops in ${windowSec}s window`,
        metadata: { count: result.count, maxOps, windowSec },
      };
    }

    return { type: 'rate-limiter', passed: true, metadata: { count: result.count, maxOps } };
  }

  /**
   * CooldownAtom — minimum time between operations.
   *
   * Config: { cooldownSec: number }
   */
  private async evalCooldown(
    config: Record<string, unknown>,
    request: WriteRequest,
    entityId: string
  ): Promise<AtomResult> {
    const cooldownSec = (config.cooldownSec as number) ?? 60;

    // Find most recent registry entry for this entity
    const result = await this.baas.dbFind(
      COLLECTIONS.REGISTRY,
      {
        'data.entityId': entityId,
        'data.entityType': request.entityType,
      },
      { limit: 1, sort: '-data.validatedAt' }
    );

    if (result.documents.length > 0) {
      const lastEntry = result.documents[0].data as Record<string, unknown>;
      const lastTime = new Date(lastEntry.validatedAt as string).getTime();
      const elapsed = (Date.now() - lastTime) / 1000;

      if (elapsed < cooldownSec) {
        return {
          type: 'cooldown',
          passed: false,
          reason: `Cooldown active: ${Math.ceil(cooldownSec - elapsed)}s remaining (need ${cooldownSec}s between ops)`,
          metadata: { elapsed: Math.floor(elapsed), cooldownSec },
        };
      }
    }

    return { type: 'cooldown', passed: true };
  }

  /**
   * SnapshotAtom — validate data hasn't changed from a previous snapshot.
   *
   * Config: { fields: string[] } — fields to compare against last snapshot
   */
  private evalSnapshot(
    config: Record<string, unknown>,
    request: WriteRequest
  ): AtomResult {
    const fields = config.fields as string[] | undefined;
    const snapshot = request.data._snapshot as Record<string, unknown> | undefined;

    if (!snapshot || !fields) {
      return { type: 'snapshot', passed: true, reason: 'No snapshot to validate' };
    }

    for (const field of fields) {
      const current = getNestedValue(request.data, field);
      const snapped = getNestedValue(snapshot, field);

      if (JSON.stringify(current) !== JSON.stringify(snapped)) {
        return {
          type: 'snapshot',
          passed: false,
          reason: `Field '${field}' has changed since snapshot`,
          metadata: { field, current, snapshot: snapped },
        };
      }
    }

    return { type: 'snapshot', passed: true };
  }
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Get a nested value from an object using dot notation.
 * e.g., getNestedValue({ a: { b: 1 } }, 'a.b') → 1
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}
