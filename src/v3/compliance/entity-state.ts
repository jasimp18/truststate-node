/**
 * Entity State Service
 *
 * Tracks entity workflow states in BaaS for WorkflowStateAtom.
 * Enables state-machine transition enforcement.
 */

import type { BaasClient, BaasFindResult, BaasInsertResult } from '@hsuite/smart-engines-sdk';
import { COLLECTIONS } from '../config';
import type { EntityState, StateTransitionRecord } from '../types';

/** Maximum history entries per entity */
const MAX_HISTORY = 50;

export class EntityStateService {
  constructor(private readonly baas: BaasClient) {}

  /**
   * Get the current state of an entity.
   * Returns null if the entity has no state record yet.
   */
  async getState(entityId: string, entityType: string): Promise<EntityState | null> {
    const result = await this.baas.dbFind(
      COLLECTIONS.ENTITY_STATE,
      {
        'data.entityId': entityId,
        'data.entityType': entityType,
      },
      { limit: 1 }
    );

    if (result.documents.length === 0) return null;
    return result.documents[0].data as unknown as EntityState;
  }

  /**
   * Get the BaaS document ID for an entity's state record.
   */
  async getDocumentId(entityId: string, entityType: string): Promise<string | null> {
    const result = await this.baas.dbFind(
      COLLECTIONS.ENTITY_STATE,
      {
        'data.entityId': entityId,
        'data.entityType': entityType,
      },
      { limit: 1 }
    );

    return result.documents.length > 0 ? result.documents[0]._id : null;
  }

  /**
   * Create initial state for an entity.
   */
  async createState(
    entityId: string,
    entityType: string,
    initialState: string,
    actorId: string
  ): Promise<BaasInsertResult> {
    const now = new Date().toISOString();
    const transition: StateTransitionRecord = {
      from: null,
      to: initialState,
      actorId,
      timestamp: now,
      transitionId: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    return this.baas.dbInsert(COLLECTIONS.ENTITY_STATE, {
      entityId,
      entityType,
      currentState: initialState,
      previousState: null,
      history: [transition],
      updatedAt: now,
    });
  }

  /**
   * Transition entity to a new state.
   * Does NOT validate the transition — that's the WorkflowStateAtom's job.
   * This just records the result after the atom approves.
   */
  async transitionState(
    entityId: string,
    entityType: string,
    newState: string,
    actorId: string
  ): Promise<void> {
    const currentState = await this.getState(entityId, entityType);
    if (!currentState) {
      throw new Error(`Entity ${entityId} (${entityType}) has no state record`);
    }

    const docId = await this.getDocumentId(entityId, entityType);
    if (!docId) {
      throw new Error(`Entity ${entityId} (${entityType}) document not found`);
    }

    const now = new Date().toISOString();
    const transition: StateTransitionRecord = {
      from: currentState.currentState,
      to: newState,
      actorId,
      timestamp: now,
      transitionId: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    // Keep history bounded
    const history = [...currentState.history, transition].slice(-MAX_HISTORY);

    await this.baas.dbUpdate(COLLECTIONS.ENTITY_STATE, docId, {
      currentState: newState,
      previousState: currentState.currentState,
      history,
      updatedAt: now,
    });
  }
}
