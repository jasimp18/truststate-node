/**
 * TrustState V3 — BaaS-Native Compliance Engine
 *
 * Architecture:
 * - NO Redis, NO Postgres, NO worker pool, NO custom retry
 * - V3 BaaS = only database (Merkle-proven, auto-anchored)
 * - @hsuite/smart-engines-sdk BaasClient = single integration point
 * - V3 atoms compose into compliance molecules for policy evaluation
 *
 * This module provides the programmatic API.
 * REST endpoints are in the server module (Phase 3).
 */

// Core client
export { TrustStateBaasClient } from './baas';

// Compliance pipeline
export {
  WriteHandler,
  ViolationService,
  EntityStateService,
  ComplianceMoleculeFactory,
} from './compliance';
export type { AtomResult, MoleculeResult } from './compliance';

// Schema management
export { SchemaService } from './schemas';

// Policy management
export { PolicyService } from './policies';

// Registry queries
export { RegistryService } from './registry';

// High-level facade
export { TrustStateV3 } from './truststate-v3';

// Policy library
export {
  LibraryService,
  ALL_TEMPLATES,
  ALL_PACKS,
  getTemplateById,
  getPackById,
  getTemplatesByPack,
  searchTemplates,
} from './library';
export type { PolicyTemplate, PolicyPack } from './library';

// REST API server
export { buildRoutes } from './server';
export type { Route, RouteHandler, ApiResponse } from './server';

// Configuration
export { TrustStateV3Config, COLLECTIONS, REQUIRED_SERVICES } from './config';

// Types
export type {
  WriteRequest,
  WriteResponse,
  BatchWriteRequest,
  BatchWriteResponse,
  SchemaDefinition,
  PolicyDefinition,
  AtomConfig,
  EntityState,
  StateTransitionRecord,
  ViolationRecord,
  EvidenceItem,
} from './types';
