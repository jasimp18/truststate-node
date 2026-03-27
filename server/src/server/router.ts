/**
 * TrustState V3 REST API Router
 *
 * Pure HTTP router — no Express/Koa/Fastify dependency.
 * Returns handler functions that can be wired into any framework.
 *
 * Endpoints:
 *
 * Compliance:
 *   POST   /v1/write              — Single compliance write
 *   POST   /v1/write/batch        — Batch compliance write
 *
 * Registry:
 *   GET    /v1/registry/:entityId — Query registry by entity
 *   GET    /v1/registry           — Query registry by type (?entityType=X)
 *
 * Violations:
 *   GET    /v1/violations          — List violations (?entityType=X&entityId=Y&policy=Z)
 *
 * Schemas:
 *   POST   /v1/schemas            — Create schema
 *   GET    /v1/schemas             — List schemas (?entityType=X)
 *   PATCH  /v1/schemas/:id/status — Transition schema status
 *
 * Policies:
 *   POST   /v1/policies           — Create policy
 *   GET    /v1/policies            — List policies (?entityType=X)
 *   GET    /v1/policies/:id       — Get policy by ID
 *   PATCH  /v1/policies/:id/status — Transition policy status
 *
 * Library:
 *   GET    /v1/library/packs               — List all packs
 *   GET    /v1/library/packs/:packId       — Get pack details + templates
 *   GET    /v1/library/templates           — List/search templates (?q=X)
 *   GET    /v1/library/templates/:id       — Get template details
 *   POST   /v1/library/templates/:id/clone — Clone template into policy
 *   POST   /v1/library/templates/:id/preview — Dry-run template
 *
 * Playground:
 *   POST   /v1/playground/validate         — Validate data against inline atoms
 *   POST   /v1/playground/explain          — Explain policy evaluation
 */

import type { BaasClient } from '@hsuite/smart-engines-sdk';
import { WriteHandler } from '../compliance/write-handler';
import { RegistryService } from '../registry';
import { SchemaService } from '../schemas';
import { PolicyService } from '../policies';
import { ViolationService } from '../compliance/violations';
import { LibraryService } from '../library';
import { ComplianceMoleculeFactory } from '../compliance/molecule-factory';
import type {
  WriteRequest,
  BatchWriteRequest,
  SchemaDefinition,
  PolicyDefinition,
} from '../types';

/**
 * Standard API response envelope.
 */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}

/**
 * Route handler function type.
 */
export type RouteHandler = (
  body: Record<string, unknown>,
  params: Record<string, string>,
  query: Record<string, string>
) => Promise<ApiResponse>;

/**
 * Route definition.
 */
export interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  handler: RouteHandler;
}

/**
 * Build all V3 REST API routes.
 */
export function buildRoutes(baas: BaasClient): Route[] {
  const writeHandler = new WriteHandler(baas);
  const registry = new RegistryService(baas);
  const schemas = new SchemaService(baas);
  const policies = new PolicyService(baas);
  const violations = new ViolationService(baas);
  const library = new LibraryService(baas);
  const moleculeFactory = new ComplianceMoleculeFactory(baas);

  return [
    // =========================================================================
    // Compliance
    // =========================================================================
    {
      method: 'POST',
      path: '/v1/write',
      handler: async (body) => {
        const result = await writeHandler.write(body as unknown as WriteRequest);
        return { ok: result.passed, data: result };
      },
    },
    {
      method: 'POST',
      path: '/v1/write/batch',
      handler: async (body) => {
        const result = await writeHandler.writeBatch(body as unknown as BatchWriteRequest);
        return { ok: true, data: result };
      },
    },

    // =========================================================================
    // Registry
    // =========================================================================
    {
      method: 'GET',
      path: '/v1/registry/:entityId',
      handler: async (_body, params) => {
        const result = await registry.findByEntityId(params.entityId);
        return { ok: true, data: result };
      },
    },
    {
      method: 'GET',
      path: '/v1/registry',
      handler: async (_body, _params, query) => {
        const entityType = query.entityType;
        const limit = parseInt(query.limit ?? '50', 10);
        const skip = parseInt(query.skip ?? '0', 10);
        if (!entityType) {
          return { ok: false, error: 'entityType query parameter is required' };
        }
        const result = await registry.findByEntityType(entityType, limit, skip);
        return { ok: true, data: result, meta: { entityType, limit, skip } };
      },
    },

    // =========================================================================
    // Violations
    // =========================================================================
    {
      method: 'GET',
      path: '/v1/violations',
      handler: async (_body, _params, query) => {
        const limit = parseInt(query.limit ?? '50', 10);
        const skip = parseInt(query.skip ?? '0', 10);

        if (query.entityId) {
          const result = await violations.findByEntityId(query.entityId, limit);
          return { ok: true, data: result };
        }
        if (query.policy) {
          const result = await violations.findByPolicy(query.policy, limit);
          return { ok: true, data: result };
        }
        if (query.entityType) {
          const result = await violations.findByEntityType(query.entityType, limit, skip);
          return { ok: true, data: result };
        }

        return { ok: false, error: 'Provide entityId, entityType, or policy query parameter' };
      },
    },

    // =========================================================================
    // Schemas
    // =========================================================================
    {
      method: 'POST',
      path: '/v1/schemas',
      handler: async (body) => {
        const result = await schemas.create(
          body as unknown as Omit<SchemaDefinition, 'status' | 'createdAt' | 'updatedAt'>
        );
        return { ok: true, data: result };
      },
    },
    {
      method: 'GET',
      path: '/v1/schemas',
      handler: async (_body, _params, query) => {
        if (!query.entityType) {
          return { ok: false, error: 'entityType query parameter is required' };
        }
        const result = await schemas.findByEntityType(query.entityType);
        return { ok: true, data: result };
      },
    },
    {
      method: 'PATCH',
      path: '/v1/schemas/:id/status',
      handler: async (body, params) => {
        const newStatus = body.status as SchemaDefinition['status'];
        if (!newStatus) {
          return { ok: false, error: 'status field is required' };
        }
        await schemas.transitionStatus(params.id, newStatus);
        return { ok: true, data: { id: params.id, status: newStatus } };
      },
    },

    // =========================================================================
    // Policies
    // =========================================================================
    {
      method: 'POST',
      path: '/v1/policies',
      handler: async (body) => {
        const result = await policies.create(
          body as unknown as Omit<PolicyDefinition, 'status' | 'createdAt' | 'updatedAt'>
        );
        return { ok: true, data: result };
      },
    },
    {
      method: 'GET',
      path: '/v1/policies',
      handler: async (_body, _params, query) => {
        if (!query.entityType) {
          return { ok: false, error: 'entityType query parameter is required' };
        }
        const result = await policies.findByEntityType(query.entityType);
        return { ok: true, data: result };
      },
    },
    {
      method: 'GET',
      path: '/v1/policies/:id',
      handler: async (_body, params) => {
        const result = await policies.getById(params.id);
        if (result.documents.length === 0) {
          return { ok: false, error: `Policy ${params.id} not found` };
        }
        return { ok: true, data: result.documents[0] };
      },
    },
    {
      method: 'PATCH',
      path: '/v1/policies/:id/status',
      handler: async (body, params) => {
        const newStatus = body.status as PolicyDefinition['status'];
        if (!newStatus) {
          return { ok: false, error: 'status field is required' };
        }
        await policies.transitionStatus(params.id, newStatus);
        return { ok: true, data: { id: params.id, status: newStatus } };
      },
    },

    // =========================================================================
    // Library
    // =========================================================================
    {
      method: 'GET',
      path: '/v1/library/packs',
      handler: async () => {
        return { ok: true, data: library.listPacks() };
      },
    },
    {
      method: 'GET',
      path: '/v1/library/packs/:packId',
      handler: async (_body, params) => {
        const pack = library.getPack(params.packId);
        if (!pack) {
          return { ok: false, error: `Pack '${params.packId}' not found` };
        }
        const templates = library.getPackTemplates(params.packId);
        return { ok: true, data: { pack, templates } };
      },
    },
    {
      method: 'GET',
      path: '/v1/library/templates',
      handler: async (_body, _params, query) => {
        if (query.q) {
          return { ok: true, data: library.search(query.q) };
        }
        return { ok: true, data: library.listTemplates() };
      },
    },
    {
      method: 'GET',
      path: '/v1/library/templates/:id',
      handler: async (_body, params) => {
        const template = library.getTemplate(params.id);
        if (!template) {
          return { ok: false, error: `Template '${params.id}' not found` };
        }
        return { ok: true, data: template };
      },
    },
    {
      method: 'POST',
      path: '/v1/library/templates/:id/clone',
      handler: async (body, params) => {
        const result = await library.cloneTemplate(params.id, body as any);
        return { ok: true, data: result };
      },
    },
    {
      method: 'POST',
      path: '/v1/library/templates/:id/preview',
      handler: async (body, params) => {
        const result = await library.preview(params.id, body as unknown as WriteRequest);
        return { ok: true, data: result };
      },
    },

    // =========================================================================
    // Playground
    // =========================================================================
    {
      method: 'POST',
      path: '/v1/playground/validate',
      handler: async (body) => {
        // Validate data against inline atom configs (no stored policy needed)
        const { data, entityType, atoms, entityId } = body as {
          data: Record<string, unknown>;
          entityType: string;
          atoms: any[];
          entityId?: string;
        };

        if (!data || !entityType || !atoms) {
          return { ok: false, error: 'data, entityType, and atoms are required' };
        }

        const tempPolicy: PolicyDefinition = {
          name: 'playground-policy',
          entityType,
          atoms,
          status: 'active',
          enforcement: 'strict',
          priority: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const result = await moleculeFactory.evaluate(
          tempPolicy,
          { entityType, data, entityId },
          entityId ?? `playground-${Date.now()}`
        );

        return { ok: result.passed, data: result };
      },
    },
    {
      method: 'POST',
      path: '/v1/playground/explain',
      handler: async (body) => {
        // Detailed explanation of how a policy evaluates
        const { data, entityType, policyId, entityId } = body as {
          data: Record<string, unknown>;
          entityType: string;
          policyId: string;
          entityId?: string;
        };

        if (!data || !policyId) {
          return { ok: false, error: 'data and policyId are required' };
        }

        const policyResult = await policies.getById(policyId);
        if (policyResult.documents.length === 0) {
          return { ok: false, error: `Policy '${policyId}' not found` };
        }

        const policy = policyResult.documents[0].data as unknown as PolicyDefinition;
        const eid = entityId ?? `explain-${Date.now()}`;
        const result = await moleculeFactory.evaluate(
          policy,
          { entityType: entityType ?? policy.entityType, data, entityId: eid },
          eid
        );

        return {
          ok: result.passed,
          data: {
            policy: { name: policy.name, entityType: policy.entityType, enforcement: policy.enforcement },
            evaluation: result,
            atomDetails: result.atomResults.map(ar => ({
              type: ar.type,
              passed: ar.passed,
              reason: ar.reason,
              metadata: ar.metadata,
            })),
          },
        };
      },
    },
  ];
}
