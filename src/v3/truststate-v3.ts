/**
 * TrustStateV3 — High-Level Facade
 *
 * Single entry point that wires up all V3 services.
 * This is the public API for TrustState V3.
 *
 * @example
 * ```typescript
 * import { TrustStateV3 } from '@truststate/sdk/v3';
 *
 * const ts = new TrustStateV3({
 *   hostUrl: 'https://host.smartengines.io',
 *   appName: 'truststate-prod',
 *   chain: 'hedera',
 *   walletAddress: '0.0.12345',
 *   publicKey: 'your-hex-pubkey',
 *   signFn: (msg) => wallet.sign(msg),
 * });
 *
 * await ts.initialize();
 *
 * // Single compliance write
 * const result = await ts.write({
 *   entityType: 'AgentResponse',
 *   data: { text: 'Hello!', score: 0.95 },
 * });
 * console.log(result.passed, result.proof.root);
 *
 * // Batch write
 * const batch = await ts.writeBatch({
 *   items: [
 *     { entityType: 'Transaction', data: { amount: 100, currency: 'USD' } },
 *     { entityType: 'Transaction', data: { amount: 200, currency: 'EUR' } },
 *   ],
 * });
 * console.log(`${batch.accepted}/${batch.total} passed`);
 * ```
 */

import { TrustStateBaasClient } from './baas';
import { WriteHandler } from './compliance';
import { SchemaService } from './schemas';
import { PolicyService } from './policies';
import { RegistryService } from './registry';
import { ViolationService, EntityStateService } from './compliance';
import type { TrustStateV3Config } from './config';
import type {
  WriteRequest,
  WriteResponse,
  BatchWriteRequest,
  BatchWriteResponse,
} from './types';

export class TrustStateV3 {
  private readonly baasClient: TrustStateBaasClient;
  private writeHandler: WriteHandler | null = null;

  /** Schema management */
  public schemas: SchemaService | null = null;
  /** Policy management */
  public policies: PolicyService | null = null;
  /** Registry queries */
  public registry: RegistryService | null = null;
  /** Violation queries */
  public violations: ViolationService | null = null;
  /** Entity state management */
  public entityState: EntityStateService | null = null;

  constructor(config: TrustStateV3Config) {
    this.baasClient = new TrustStateBaasClient(config);
  }

  /**
   * Initialize the V3 engine.
   * Must be called before any operations.
   */
  async initialize(): Promise<void> {
    await this.baasClient.initialize();
    const baas = this.baasClient.getClient();

    this.writeHandler = new WriteHandler(baas);
    this.schemas = new SchemaService(baas);
    this.policies = new PolicyService(baas);
    this.registry = new RegistryService(baas);
    this.violations = new ViolationService(baas);
    this.entityState = new EntityStateService(baas);
  }

  /**
   * Single compliance write — POST /v1/write equivalent.
   */
  async write(request: WriteRequest): Promise<WriteResponse> {
    this.requireInitialized();
    return this.writeHandler!.write(request);
  }

  /**
   * Batch compliance write — POST /v1/write/batch equivalent.
   */
  async writeBatch(request: BatchWriteRequest): Promise<BatchWriteResponse> {
    this.requireInitialized();
    return this.writeHandler!.writeBatch(request);
  }

  /**
   * Check if initialized.
   */
  isReady(): boolean {
    return this.baasClient.isInitialized();
  }

  /**
   * Get the registered BaaS app ID.
   */
  getAppId(): string {
    return this.baasClient.getAppId();
  }

  private requireInitialized(): void {
    if (!this.writeHandler) {
      throw new Error('TrustStateV3 not initialized. Call initialize() first.');
    }
  }
}
