/**
 * Write Handler
 *
 * Core compliance pipeline: validate → store → Merkle proof response.
 *
 * Pipeline:
 * 1. Schema validation (against BaaS-stored schemas)
 * 2. Policy evaluation (via V3 atoms → molecule)
 * 3. Store in BaaS registry (Merkle-proven)
 * 4. Track entity state if applicable
 * 5. Record violations if any
 * 6. Return proof
 */

import type { BaasClient } from '@hsuite/smart-engines-sdk';
import { RegistryService } from '../registry';
import { SchemaService } from '../schemas';
import { PolicyService } from '../policies';
import { ViolationService } from './violations';
import { EntityStateService } from './entity-state';
import { ComplianceMoleculeFactory } from './molecule-factory';
import type {
  WriteRequest,
  WriteResponse,
  BatchWriteRequest,
  BatchWriteResponse,
  PolicyDefinition,
} from '../types';

export class WriteHandler {
  private readonly registry: RegistryService;
  private readonly schemas: SchemaService;
  private readonly policies: PolicyService;
  private readonly violations: ViolationService;
  private readonly entityState: EntityStateService;
  private readonly moleculeFactory: ComplianceMoleculeFactory;

  constructor(private readonly baas: BaasClient) {
    this.registry = new RegistryService(baas);
    this.schemas = new SchemaService(baas);
    this.policies = new PolicyService(baas);
    this.violations = new ViolationService(baas);
    this.entityState = new EntityStateService(baas);
    this.moleculeFactory = new ComplianceMoleculeFactory(baas, this.entityState);
  }

  /**
   * POST /v1/write — Single compliance write.
   *
   * Validate with V3 molecule → store in BaaS → Merkle proof response.
   */
  async write(request: WriteRequest): Promise<WriteResponse> {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entityId = request.entityId ?? `ent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Step 1: Schema validation
    const schemaResult = await this.validateSchema(request);
    if (!schemaResult.valid) {
      return this.buildFailResponse(requestId, entityId, 8, schemaResult.reason!, request);
    }

    // Step 2: Policy evaluation
    const policyResult = await this.evaluatePolicies(request, entityId);
    if (!policyResult.passed && policyResult.enforcement === 'strict') {
      // Record violation(s)
      const violationIds = await this.recordViolations(
        request,
        entityId,
        policyResult.failedPolicies,
        'rejected'
      );
      return this.buildFailResponse(requestId, entityId, 9, policyResult.reason!, request, violationIds);
    }

    // Step 2b: Warn-mode violations (record but don't reject)
    let warnViolationIds: string[] = [];
    if (!policyResult.passed && policyResult.enforcement === 'warn') {
      warnViolationIds = await this.recordViolations(
        request,
        entityId,
        policyResult.failedPolicies,
        'warned'
      );
    }

    // Step 3: Store in BaaS registry (Merkle-proven)
    const insertResult = await this.registry.insertRecord(request, entityId, requestId);

    // Step 4: Track entity state if workflow-state atoms are involved
    if (request.action === 'update' || request.action === 'create') {
      await this.updateEntityStateIfNeeded(request, entityId);
    }

    // Step 5: Build success response with Merkle proof
    return {
      passed: true,
      recordId: insertResult.document._id,
      requestId,
      entityId,
      proof: {
        root: insertResult.stateTransition.proof.root,
        leaf: insertResult.stateTransition.proof.leaf,
        siblings: insertResult.stateTransition.proof.siblings,
        path: insertResult.stateTransition.proof.path,
      },
      stateTransition: {
        transitionId: insertResult.stateTransition.transitionId,
        previousHash: insertResult.stateTransition.previousHash,
        newHash: insertResult.stateTransition.newHash,
        stateRoot: insertResult.stateTransition.stateRoot,
        timestamp: insertResult.stateTransition.timestamp,
      },
      violationIds: warnViolationIds.length > 0 ? warnViolationIds : undefined,
    };
  }

  /**
   * POST /v1/write/batch — Batch compliance write.
   *
   * Processes each item independently. Partial success allowed.
   */
  async writeBatch(request: BatchWriteRequest): Promise<BatchWriteResponse> {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const results: WriteResponse[] = [];

    for (const item of request.items) {
      try {
        const result = await this.write(item);
        results.push(result);
      } catch (error) {
        // Individual item failure doesn't break the batch
        const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const entityId = item.entityId ?? `ent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        results.push(
          this.buildErrorResponse(requestId, entityId, error instanceof Error ? error.message : 'Unknown error')
        );
      }
    }

    const accepted = results.filter((r) => r.passed).length;

    return {
      batchId,
      total: results.length,
      accepted,
      rejected: results.length - accepted,
      results,
      feedLabel: request.feedLabel,
    };
  }

  // ---------------------------------------------------------------------------
  // Schema validation
  // ---------------------------------------------------------------------------

  private async validateSchema(
    request: WriteRequest
  ): Promise<{ valid: boolean; reason?: string }> {
    const version = request.schemaVersion ?? '1.0';
    const schemaResult = await this.schemas.findByTypeAndVersion(request.entityType, version);

    // No schema defined = pass (schema validation is opt-in)
    if (schemaResult.documents.length === 0) {
      return { valid: true };
    }

    const schema = schemaResult.documents[0].data as unknown as { jsonSchema: Record<string, unknown> };

    // Basic JSON Schema validation
    // In production, use ajv or similar. For now, validate required fields.
    if (schema.jsonSchema.required && Array.isArray(schema.jsonSchema.required)) {
      for (const field of schema.jsonSchema.required as string[]) {
        if (!(field in request.data)) {
          return { valid: false, reason: `Missing required field: ${field}` };
        }
      }
    }

    return { valid: true };
  }

  // ---------------------------------------------------------------------------
  // Policy evaluation (via ComplianceMoleculeFactory)
  // ---------------------------------------------------------------------------

  private async evaluatePolicies(
    request: WriteRequest,
    entityId: string
  ): Promise<{
    passed: boolean;
    enforcement: 'strict' | 'warn' | 'log';
    reason?: string;
    failedPolicies: Array<{ name: string; atoms: string[] }>;
  }> {
    const policiesResult = await this.policies.findActiveByEntityType(request.entityType);

    // No active policies = pass
    if (policiesResult.documents.length === 0) {
      return { passed: true, enforcement: 'log', failedPolicies: [] };
    }

    const failedPolicies: Array<{ name: string; atoms: string[] }> = [];
    let strictestEnforcement: 'strict' | 'warn' | 'log' = 'log';

    for (const doc of policiesResult.documents) {
      const policy = doc.data as unknown as PolicyDefinition;

      // Evaluate all atoms via ComplianceMoleculeFactory
      const moleculeResult = await this.moleculeFactory.evaluate(policy, request, entityId);

      if (!moleculeResult.passed) {
        failedPolicies.push({ name: policy.name, atoms: moleculeResult.failedAtoms });

        // Track strictest enforcement
        if (policy.enforcement === 'strict') strictestEnforcement = 'strict';
        else if (policy.enforcement === 'warn' && strictestEnforcement !== 'strict')
          strictestEnforcement = 'warn';
      }
    }

    if (failedPolicies.length === 0) {
      return { passed: true, enforcement: 'log', failedPolicies: [] };
    }

    const reason = failedPolicies
      .map((fp) => `Policy "${fp.name}" failed atoms: ${fp.atoms.join(', ')}`)
      .join('; ');

    return {
      passed: false,
      enforcement: strictestEnforcement,
      reason,
      failedPolicies,
    };
  }

  // ---------------------------------------------------------------------------
  // Violation recording
  // ---------------------------------------------------------------------------

  private async recordViolations(
    request: WriteRequest,
    entityId: string,
    failedPolicies: Array<{ name: string; atoms: string[] }>,
    enforcement: 'rejected' | 'warned' | 'logged'
  ): Promise<string[]> {
    const ids: string[] = [];

    for (const fp of failedPolicies) {
      const result = await this.violations.record({
        entityId,
        entityType: request.entityType,
        policyName: fp.name,
        failedAtoms: fp.atoms,
        reason: `Policy "${fp.name}" failed on atoms: ${fp.atoms.join(', ')}`,
        data: request.data,
        actorId: request.actorId ?? 'anonymous',
        enforcement,
      });
      ids.push(result.document._id);
    }

    return ids;
  }

  // ---------------------------------------------------------------------------
  // Entity state management
  // ---------------------------------------------------------------------------

  private async updateEntityStateIfNeeded(
    request: WriteRequest,
    entityId: string
  ): Promise<void> {
    // Only track state if the data includes a state/status field
    const state = request.data.state ?? request.data.status;
    if (typeof state !== 'string') return;

    const existing = await this.entityState.getState(entityId, request.entityType);
    const actorId = request.actorId ?? 'anonymous';

    if (!existing) {
      await this.entityState.createState(entityId, request.entityType, state, actorId);
    } else if (existing.currentState !== state) {
      await this.entityState.transitionState(entityId, request.entityType, state, actorId);
    }
  }

  // ---------------------------------------------------------------------------
  // Response builders
  // ---------------------------------------------------------------------------

  private buildFailResponse(
    requestId: string,
    entityId: string,
    failedStep: number,
    failReason: string,
    request: WriteRequest,
    violationIds?: string[]
  ): WriteResponse {
    return {
      passed: false,
      recordId: '',
      requestId,
      entityId,
      proof: { root: '', leaf: '', siblings: [], path: [] },
      stateTransition: {
        transitionId: '',
        previousHash: '',
        newHash: '',
        stateRoot: '',
        timestamp: Date.now(),
      },
      failReason,
      failedStep,
      violationIds,
    };
  }

  private buildErrorResponse(
    requestId: string,
    entityId: string,
    errorMessage: string
  ): WriteResponse {
    return {
      passed: false,
      recordId: '',
      requestId,
      entityId,
      proof: { root: '', leaf: '', siblings: [], path: [] },
      stateTransition: {
        transitionId: '',
        previousHash: '',
        newHash: '',
        stateRoot: '',
        timestamp: Date.now(),
      },
      failReason: `Internal error: ${errorMessage}`,
      failedStep: 0,
    };
  }
}
