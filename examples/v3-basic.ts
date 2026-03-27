/**
 * TrustState V3 — SDK Usage Example
 *
 * The SDK is a thin HTTP client. It talks to the Trustgate API,
 * which runs the V3 compliance engine internally.
 *
 * SDK → Trustgate API → V3 BaaS
 */

import { TrustStateClient } from '../src';

async function main() {
  // The SDK talks to the Trustgate API, NOT to BaaS directly
  const client = new TrustStateClient({
    apiKey: process.env.TRUSTSTATE_API_KEY!,
    baseUrl: process.env.TRUSTSTATE_API_URL ?? 'http://localhost:3100',
  });

  // Single compliance check (Trustgate validates via V3 atoms internally)
  const result = await client.check('AgentResponse', {
    text: 'The compliance check passed successfully.',
    score: 0.92,
    model: 'gpt-4',
  });

  console.log('✅ Single check:');
  console.log('  passed:', result.passed);
  console.log('  recordId:', result.recordId);

  // Batch check
  const batch = await client.checkBatch([
    { entityType: 'AgentResponse', data: { text: 'Item 1', score: 0.85 } },
    { entityType: 'AgentResponse', data: { text: 'Item 2', score: 0.3 } },
    { entityType: 'AgentResponse', data: { text: 'Item 3', score: 0.95 } },
  ]);

  console.log(`\n📦 Batch: ${batch.accepted}/${batch.total} accepted`);
}

main().catch(console.error);
