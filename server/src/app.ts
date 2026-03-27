/**
 * TrustState Trustgate API Server
 *
 * The V3 compliance engine runs HERE — not in the SDK.
 *
 * Architecture:
 *   SDK (thin client) → Trustgate API → V3 BaaS
 *
 * The SDK never talks to BaaS directly. Every write, query, and
 * validation flows through this API server, which:
 * - Validates compliance via ComplianceMoleculeFactory
 * - Stores records in BaaS (Merkle-proven)
 * - Tracks violations, entity state, schemas, policies
 * - Powers the dashboard, AI layer, analytics
 * - Enforces tenant isolation
 *
 * This server uses Node.js native HTTP — zero framework dependency.
 * For production, wire the router into Express/Fastify/NestJS.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { TrustStateBaasClient } from './baas';
import { buildRoutes } from './server/router';
import type { Route, ApiResponse } from './server/router';
import type { TrustStateV3Config } from './config';

/**
 * Parse JSON body from request.
 */
function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Parse URL query parameters.
 */
function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const params: Record<string, string> = {};
  const qs = url.slice(idx + 1);
  for (const pair of qs.split('&')) {
    const [k, v] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return params;
}

/**
 * Match a route path pattern against an actual URL path.
 * Supports :param segments.
 */
function matchRoute(
  pattern: string,
  actual: string
): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const actualPath = actual.split('?')[0];
  const actualParts = actualPath.split('/');

  if (patternParts.length !== actualParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = actualParts[i];
    } else if (patternParts[i] !== actualParts[i]) {
      return null;
    }
  }
  return params;
}

/**
 * Start the Trustgate API server.
 */
export async function startServer(
  config: TrustStateV3Config,
  port = 3100
): Promise<void> {
  // Initialize BaaS connection
  const baasClient = new TrustStateBaasClient(config);
  await baasClient.initialize();

  console.log(`✅ BaaS initialized (app: ${baasClient.getAppId()})`);

  // Build routes
  const routes = buildRoutes(baasClient.getClient());

  // Create HTTP server
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method?.toUpperCase() ?? 'GET';
    const url = req.url ?? '/';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (url === '/health' || url === '/v1/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: '3.0.0', engine: 'trustgate' }));
      return;
    }

    // Match route
    let matchedRoute: Route | undefined;
    let params: Record<string, string> = {};

    for (const route of routes) {
      if (route.method !== method) continue;
      const match = matchRoute(route.path, url);
      if (match !== null) {
        matchedRoute = route;
        params = match;
        break;
      }
    }

    if (!matchedRoute) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      return;
    }

    try {
      const body = method === 'GET' ? {} : await parseBody(req);
      const query = parseQuery(url);
      const result: ApiResponse = await matchedRoute.handler(body, params, query);

      const statusCode = result.ok ? 200 : 400;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  });

  server.listen(port, () => {
    console.log(`🔒 Trustgate API server listening on port ${port}`);
    console.log(`   Health: http://localhost:${port}/health`);
    console.log(`   Write:  POST http://localhost:${port}/v1/write`);
    console.log(`   Library: GET http://localhost:${port}/v1/library/packs`);
  });
}

// CLI entry point
if (require.main === module) {
  const config: TrustStateV3Config = {
    hostUrl: process.env.SMART_HOST_URL ?? 'https://host.smartengines.io',
    appName: process.env.TRUSTSTATE_APP_NAME ?? 'truststate',
    appId: process.env.TRUSTSTATE_APP_ID,
    chain: (process.env.TRUSTSTATE_CHAIN as any) ?? 'hedera',
    walletAddress: process.env.TRUSTSTATE_WALLET_ADDRESS ?? '',
    publicKey: process.env.TRUSTSTATE_PUBLIC_KEY ?? '',
    signFn: async () => {
      throw new Error('Configure signFn for production');
    },
    allowInsecure: process.env.NODE_ENV === 'development',
  };

  const port = parseInt(process.env.PORT ?? '3100', 10);
  startServer(config, port).catch((err) => {
    console.error('Failed to start Trustgate:', err);
    process.exit(1);
  });
}
