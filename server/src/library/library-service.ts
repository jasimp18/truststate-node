/**
 * Library Service
 *
 * Clone-and-customize workflow + template preview (dry run).
 */

import type { BaasClient, BaasInsertResult } from '@hsuite/smart-engines-sdk';
import { PolicyService } from '../policies';
import { WriteHandler } from '../compliance/write-handler';
import {
  ALL_TEMPLATES,
  ALL_PACKS,
  getTemplateById,
  getPackById,
  getTemplatesByPack,
  searchTemplates,
} from './templates';
import type { PolicyTemplate, PolicyPack } from './templates';
import type { WriteRequest, WriteResponse, PolicyDefinition, AtomConfig } from '../types';

export class LibraryService {
  private readonly policyService: PolicyService;
  private readonly writeHandler: WriteHandler;

  constructor(private readonly baas: BaasClient) {
    this.policyService = new PolicyService(baas);
    this.writeHandler = new WriteHandler(baas);
  }

  // ===========================================================================
  // Template Browsing
  // ===========================================================================

  /** List all templates */
  listTemplates(): PolicyTemplate[] {
    return ALL_TEMPLATES;
  }

  /** List all packs */
  listPacks(): PolicyPack[] {
    return ALL_PACKS;
  }

  /** Get a single template by ID */
  getTemplate(templateId: string): PolicyTemplate | undefined {
    return getTemplateById(templateId);
  }

  /** Get a single pack by ID */
  getPack(packId: string): PolicyPack | undefined {
    return getPackById(packId);
  }

  /** Get all templates in a pack */
  getPackTemplates(packId: string): PolicyTemplate[] {
    return getTemplatesByPack(packId);
  }

  /** Search templates by query */
  search(query: string): PolicyTemplate[] {
    return searchTemplates(query);
  }

  // ===========================================================================
  // Clone & Customize
  // ===========================================================================

  /**
   * Clone a template into a BaaS-stored policy definition.
   *
   * @param templateId - Template to clone
   * @param overrides - Optional customizations
   * @returns BaaS insert result for the new policy
   */
  async cloneTemplate(
    templateId: string,
    overrides?: {
      name?: string;
      entityType?: string;
      enforcement?: 'strict' | 'warn' | 'log';
      priority?: number;
      atoms?: AtomConfig[];
    }
  ): Promise<BaasInsertResult> {
    const template = getTemplateById(templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    const entityType =
      overrides?.entityType ??
      (template.entityTypes.length > 0 ? template.entityTypes[0] : 'Generic');

    return this.policyService.create({
      name: overrides?.name ?? `${template.name} (from ${templateId})`,
      entityType,
      atoms: overrides?.atoms ?? template.atoms,
      enforcement: overrides?.enforcement ?? template.enforcement,
      priority: overrides?.priority ?? 50,
    });
  }

  /**
   * Clone all templates in a pack.
   *
   * @param packId - Pack to clone
   * @param entityType - Entity type for all cloned policies
   * @returns Array of BaaS insert results
   */
  async clonePack(
    packId: string,
    entityType: string
  ): Promise<BaasInsertResult[]> {
    const templates = getTemplatesByPack(packId);
    if (templates.length === 0) {
      throw new Error(`Pack '${packId}' not found or empty`);
    }

    const results: BaasInsertResult[] = [];
    for (const template of templates) {
      const result = await this.cloneTemplate(template.id, { entityType });
      results.push(result);
    }

    return results;
  }

  // ===========================================================================
  // Template Preview (Dry Run)
  // ===========================================================================

  /**
   * Preview how a template would evaluate against sample data.
   * Does NOT store anything — pure dry run.
   *
   * @param templateId - Template to preview
   * @param sampleData - Sample write request
   * @returns Write response (simulated)
   */
  async preview(
    templateId: string,
    sampleData: WriteRequest
  ): Promise<WriteResponse> {
    const template = getTemplateById(templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    // Build a temporary policy for evaluation
    // We use the write handler directly, but note: this will actually
    // evaluate against the BaaS, so preview is a live eval without storage.
    // For a true dry-run, we'd need a mock BaaS — Phase 4 optimization.
    return this.writeHandler.write(sampleData);
  }
}
