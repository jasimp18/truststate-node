/**
 * Policy Service
 *
 * CRUD + lifecycle for policy definitions in BaaS.
 * Policies reference V3 atoms that compose into compliance molecules.
 */

import type { BaasClient, BaasFindResult, BaasInsertResult } from '@hsuite/smart-engines-sdk';
import { COLLECTIONS } from '../config';
import type { PolicyDefinition } from '../types';

/** Valid policy status transitions */
const POLICY_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'archived'],
  active: ['disabled', 'archived'],
  disabled: ['active', 'archived'],
  archived: [],
};

export class PolicyService {
  constructor(private readonly baas: BaasClient) {}

  /**
   * Create a new policy definition (starts in 'draft' status).
   */
  async create(
    policy: Omit<PolicyDefinition, 'status' | 'createdAt' | 'updatedAt'>
  ): Promise<BaasInsertResult> {
    const now = new Date().toISOString();
    return this.baas.dbInsert(COLLECTIONS.POLICIES, {
      ...policy,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Find active policies for an entity type (ordered by priority).
   */
  async findActiveByEntityType(entityType: string): Promise<BaasFindResult> {
    return this.baas.dbFind(
      COLLECTIONS.POLICIES,
      {
        'data.entityType': entityType,
        'data.status': 'active',
      },
      { sort: 'data.priority', limit: 100 }
    );
  }

  /**
   * Find all policies (any status) for an entity type.
   */
  async findByEntityType(entityType: string): Promise<BaasFindResult> {
    return this.baas.dbFind(
      COLLECTIONS.POLICIES,
      { 'data.entityType': entityType },
      { sort: 'data.priority', limit: 100 }
    );
  }

  /**
   * Transition policy status (validates allowed transitions).
   */
  async transitionStatus(
    documentId: string,
    newStatus: PolicyDefinition['status']
  ): Promise<void> {
    const result = await this.baas.dbFind(COLLECTIONS.POLICIES, { _id: documentId }, { limit: 1 });
    if (result.documents.length === 0) {
      throw new Error(`Policy ${documentId} not found`);
    }

    const current = result.documents[0].data as unknown as PolicyDefinition;
    const allowed = POLICY_TRANSITIONS[current.status];

    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(
        `Invalid policy transition: ${current.status} → ${newStatus}. ` +
          `Allowed: ${allowed?.join(', ') ?? 'none'}`
      );
    }

    await this.baas.dbUpdate(COLLECTIONS.POLICIES, documentId, {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Update policy atom configuration (only in draft).
   */
  async updateAtoms(
    documentId: string,
    atoms: PolicyDefinition['atoms']
  ): Promise<void> {
    const result = await this.baas.dbFind(COLLECTIONS.POLICIES, { _id: documentId }, { limit: 1 });
    if (result.documents.length === 0) {
      throw new Error(`Policy ${documentId} not found`);
    }

    const current = result.documents[0].data as unknown as PolicyDefinition;
    if (current.status !== 'draft') {
      throw new Error(`Cannot update atoms — policy is ${current.status}, must be draft`);
    }

    await this.baas.dbUpdate(COLLECTIONS.POLICIES, documentId, {
      atoms,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Get a single policy by document ID.
   */
  async getById(documentId: string): Promise<BaasFindResult> {
    return this.baas.dbFind(COLLECTIONS.POLICIES, { _id: documentId }, { limit: 1 });
  }
}
