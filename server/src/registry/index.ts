/**
 * Registry Service
 *
 * Manages compliance records in the BaaS registry collection.
 * Every validated write produces a Merkle-proven record.
 */

import type { BaasClient, BaasInsertResult, BaasFindResult } from '@hsuite/smart-engines-sdk';
import { COLLECTIONS } from '../config';
import type { WriteRequest, WriteResponse } from '../types';

export class RegistryService {
  constructor(private readonly baas: BaasClient) {}

  /**
   * Insert a validated compliance record into the registry.
   *
   * @returns BaaS insert result with Merkle proof + state transition.
   */
  async insertRecord(
    request: WriteRequest,
    entityId: string,
    requestId: string
  ): Promise<BaasInsertResult> {
    const record = {
      entityId,
      entityType: request.entityType,
      action: request.action ?? 'create',
      data: request.data,
      schemaVersion: request.schemaVersion ?? '1.0',
      actorId: request.actorId ?? 'anonymous',
      evidence: request.evidence ?? [],
      requestId,
      validatedAt: new Date().toISOString(),
    };

    return this.baas.dbInsert(COLLECTIONS.REGISTRY, record);
  }

  /**
   * Query registry records for an entity.
   */
  async findByEntityId(entityId: string, limit = 10): Promise<BaasFindResult> {
    return this.baas.dbFind(COLLECTIONS.REGISTRY, { 'data.entityId': entityId }, { limit });
  }

  /**
   * Query registry records by entity type.
   */
  async findByEntityType(entityType: string, limit = 50, skip = 0): Promise<BaasFindResult> {
    return this.baas.dbFind(
      COLLECTIONS.REGISTRY,
      { 'data.entityType': entityType },
      { limit, skip, sort: '-data.validatedAt' }
    );
  }

  /**
   * Get a specific record by its document ID.
   */
  async getById(documentId: string): Promise<BaasFindResult> {
    return this.baas.dbFind(COLLECTIONS.REGISTRY, { _id: documentId }, { limit: 1 });
  }
}
