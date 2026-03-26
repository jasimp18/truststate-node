/**
 * Schema Service
 *
 * CRUD + status machine for schema definitions in BaaS.
 * Schemas define the structure that data must conform to before policy evaluation.
 */

import type { BaasClient, BaasFindResult, BaasInsertResult } from '@hsuite/smart-engines-sdk';
import { COLLECTIONS } from '../config';
import type { SchemaDefinition } from '../types';

/** Valid schema status transitions */
const SCHEMA_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'archived'],
  active: ['deprecated'],
  deprecated: ['archived', 'active'],
  archived: [],
};

export class SchemaService {
  constructor(private readonly baas: BaasClient) {}

  /**
   * Create a new schema definition (starts in 'draft' status).
   */
  async create(
    schema: Omit<SchemaDefinition, 'status' | 'createdAt' | 'updatedAt'>
  ): Promise<BaasInsertResult> {
    const now = new Date().toISOString();
    return this.baas.dbInsert(COLLECTIONS.SCHEMAS, {
      ...schema,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Find schema by entity type and version.
   */
  async findByTypeAndVersion(
    entityType: string,
    version: string
  ): Promise<BaasFindResult> {
    return this.baas.dbFind(
      COLLECTIONS.SCHEMAS,
      {
        'data.entityType': entityType,
        'data.version': version,
        'data.status': 'active',
      },
      { limit: 1 }
    );
  }

  /**
   * Find all schemas for an entity type.
   */
  async findByEntityType(entityType: string): Promise<BaasFindResult> {
    return this.baas.dbFind(
      COLLECTIONS.SCHEMAS,
      { 'data.entityType': entityType },
      { sort: '-data.version', limit: 50 }
    );
  }

  /**
   * Transition schema status (validates allowed transitions).
   */
  async transitionStatus(
    documentId: string,
    newStatus: SchemaDefinition['status']
  ): Promise<void> {
    // Fetch current schema
    const result = await this.baas.dbFind(COLLECTIONS.SCHEMAS, { _id: documentId }, { limit: 1 });
    if (result.documents.length === 0) {
      throw new Error(`Schema ${documentId} not found`);
    }

    const current = result.documents[0].data as unknown as SchemaDefinition;
    const allowed = SCHEMA_TRANSITIONS[current.status];

    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(
        `Invalid schema transition: ${current.status} → ${newStatus}. ` +
          `Allowed: ${allowed?.join(', ') ?? 'none'}`
      );
    }

    await this.baas.dbUpdate(COLLECTIONS.SCHEMAS, documentId, {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Update schema JSON schema definition (only allowed in draft).
   */
  async updateJsonSchema(
    documentId: string,
    jsonSchema: Record<string, unknown>
  ): Promise<void> {
    const result = await this.baas.dbFind(COLLECTIONS.SCHEMAS, { _id: documentId }, { limit: 1 });
    if (result.documents.length === 0) {
      throw new Error(`Schema ${documentId} not found`);
    }

    const current = result.documents[0].data as unknown as SchemaDefinition;
    if (current.status !== 'draft') {
      throw new Error(`Cannot update JSON schema — schema is ${current.status}, must be draft`);
    }

    await this.baas.dbUpdate(COLLECTIONS.SCHEMAS, documentId, {
      jsonSchema,
      updatedAt: new Date().toISOString(),
    });
  }
}
