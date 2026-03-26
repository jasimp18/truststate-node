/**
 * TrustState V3 BaaS Client Wrapper
 *
 * Thin wrapper over @hsuite/smart-engines-sdk BaasClient.
 * Handles initialization, app registration, auth, and collection bootstrapping.
 *
 * Architecture decision: single BaasClient instance, no connection pooling.
 * V3 BaaS handles concurrency internally.
 */

import { BaasClient } from '@hsuite/smart-engines-sdk';
import type { BaasRegisterResponse, BaasSessionInfo } from '@hsuite/smart-engines-sdk';
import { TrustStateV3Config, COLLECTIONS, REQUIRED_SERVICES } from '../config';

export class TrustStateBaasClient {
  private client: BaasClient | null = null;
  private config: TrustStateV3Config;
  private appId: string | null = null;
  private initialized = false;

  constructor(config: TrustStateV3Config) {
    this.config = config;
    this.appId = config.appId ?? null;
  }

  /**
   * Initialize: authenticate + register app (if needed) + bootstrap collections.
   *
   * Idempotent — safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 1. Create BaasClient
    this.client = new BaasClient({
      hostUrl: this.config.hostUrl,
      appId: this.appId ?? undefined,
      appName: this.config.appName,
      timeout: this.config.timeout ?? 30_000,
      allowInsecure: this.config.allowInsecure ?? false,
    });

    // 2. Authenticate with chain wallet
    await this.client.authenticate({
      chain: this.config.chain,
      walletAddress: this.config.walletAddress,
      publicKey: this.config.publicKey,
      signFn: this.config.signFn,
    });

    // 3. Register app if no appId was provided
    if (!this.appId) {
      const registration = await this.registerApp();
      this.appId = registration.appId;
    }

    // 4. Bootstrap collections (idempotent — BaaS creates on first write)
    // No explicit collection creation needed; BaaS auto-creates on first insert.
    // We document the expected collections here for clarity.

    this.initialized = true;
  }

  /**
   * Register a new TrustState V3 application on BaaS.
   */
  private async registerApp(): Promise<BaasRegisterResponse> {
    this.requireClient();
    return this.client!.register({
      name: this.config.appName,
      services: [...REQUIRED_SERVICES],
    });
  }

  /**
   * Validate the current session is still active.
   */
  async validateSession(): Promise<BaasSessionInfo> {
    this.requireClient();
    return this.client!.validateSession();
  }

  /**
   * Get the underlying BaasClient for direct operations.
   * Throws if not initialized.
   */
  getClient(): BaasClient {
    this.requireInitialized();
    return this.client!;
  }

  /**
   * Get the registered app ID.
   */
  getAppId(): string {
    if (!this.appId) {
      throw new Error('TrustState V3: App not registered yet. Call initialize() first.');
    }
    return this.appId;
  }

  /**
   * Check if the client is initialized and authenticated.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get collection names (convenience accessor).
   */
  get collections() {
    return COLLECTIONS;
  }

  private requireClient(): void {
    if (!this.client) {
      throw new Error('TrustState V3: BaasClient not created. Call initialize() first.');
    }
  }

  private requireInitialized(): void {
    if (!this.initialized) {
      throw new Error('TrustState V3: Not initialized. Call initialize() first.');
    }
  }
}
