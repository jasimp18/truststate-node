/**
 * Violation Service
 *
 * Records policy violations in BaaS.
 * Every rejected or warned write produces a violation record.
 */

import type { BaasClient, BaasInsertResult, BaasFindResult } from '@hsuite/smart-engines-sdk';
import { COLLECTIONS } from '../config';
import type { ViolationRecord } from '../types';

export class ViolationService {
  constructor(private readonly baas: BaasClient) {}

  /**
   * Record a policy violation.
   */
  async record(
    violation: Omit<ViolationRecord, 'violationId' | 'createdAt'>
  ): Promise<BaasInsertResult> {
    const violationId = `viol-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return this.baas.dbInsert(COLLECTIONS.VIOLATIONS, {
      ...violation,
      violationId,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Find violations for an entity.
   */
  async findByEntityId(entityId: string, limit = 50): Promise<BaasFindResult> {
    return this.baas.dbFind(
      COLLECTIONS.VIOLATIONS,
      { 'data.entityId': entityId },
      { limit, sort: '-data.createdAt' }
    );
  }

  /**
   * Find violations by policy name.
   */
  async findByPolicy(policyName: string, limit = 50): Promise<BaasFindResult> {
    return this.baas.dbFind(
      COLLECTIONS.VIOLATIONS,
      { 'data.policyName': policyName },
      { limit, sort: '-data.createdAt' }
    );
  }

  /**
   * Find violations by entity type.
   */
  async findByEntityType(entityType: string, limit = 50, skip = 0): Promise<BaasFindResult> {
    return this.baas.dbFind(
      COLLECTIONS.VIOLATIONS,
      { 'data.entityType': entityType },
      { limit, skip, sort: '-data.createdAt' }
    );
  }
}
