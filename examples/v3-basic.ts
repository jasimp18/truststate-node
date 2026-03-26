/**
 * TrustState V3 — Basic Usage Example
 *
 * Demonstrates:
 * 1. BaaS initialization + auth
 * 2. Schema creation
 * 3. Policy creation with V3 atoms
 * 4. Compliance write with Merkle proof
 * 5. Batch write
 */

import { TrustStateV3 } from '../src/v3';
import { PrivateKey } from '@hashgraph/sdk';

async function main() {
  // Load your Hedera credentials from environment
  const privateKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY!);

  // Initialize TrustState V3
  const ts = new TrustStateV3({
    hostUrl: process.env.SMART_HOST_URL ?? 'https://host.smartengines.io',
    appName: 'truststate-example',
    chain: 'hedera',
    walletAddress: process.env.HEDERA_ACCOUNT_ID!,
    publicKey: privateKey.publicKey.toStringRaw(),
    signFn: (challenge) => {
      const sig = privateKey.sign(Buffer.from(challenge));
      return Buffer.from(sig).toString('hex');
    },
  });

  await ts.initialize();
  console.log('✅ TrustState V3 initialized, appId:', ts.getAppId());

  // --- Create a schema ---
  const schemaResult = await ts.schemas!.create({
    name: 'agent-response-v1',
    entityType: 'AgentResponse',
    version: '1.0',
    jsonSchema: {
      type: 'object',
      required: ['text', 'score'],
      properties: {
        text: { type: 'string', minLength: 1 },
        score: { type: 'number', minimum: 0, maximum: 1 },
        model: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
  });
  const schemaId = schemaResult.document._id;
  console.log('📋 Schema created:', schemaId);

  // Activate the schema
  await ts.schemas!.transitionStatus(schemaId, 'active');
  console.log('📋 Schema activated');

  // --- Create a policy with V3 atoms ---
  const policyResult = await ts.policies!.create({
    name: 'agent-response-quality',
    entityType: 'AgentResponse',
    enforcement: 'strict',
    priority: 1,
    atoms: [
      {
        type: 'field-values',
        config: {
          field: 'score',
          // This is a simplified example; real atom evaluators
          // would use the V3 rules engine for complex logic
        },
        required: true,
      },
      {
        type: 'limits',
        config: {
          field: 'score',
          min: 0.5,
          max: 1.0,
        },
        required: true,
      },
      {
        type: 'permission-list',
        config: {
          allowed: ['agent-1', 'agent-2', 'admin'],
        },
        required: true,
      },
    ],
  });
  const policyId = policyResult.document._id;
  console.log('📜 Policy created:', policyId);

  // Activate the policy
  await ts.policies!.transitionStatus(policyId, 'active');
  console.log('📜 Policy activated');

  // --- Single compliance write ---
  const writeResult = await ts.write({
    entityType: 'AgentResponse',
    data: {
      text: 'The compliance check passed successfully.',
      score: 0.92,
      model: 'gpt-4',
      timestamp: new Date().toISOString(),
    },
    actorId: 'agent-1',
    schemaVersion: '1.0',
  });

  console.log('\n📝 Write result:');
  console.log('  passed:', writeResult.passed);
  console.log('  recordId:', writeResult.recordId);
  console.log('  proof root:', writeResult.proof.root);
  console.log('  state root:', writeResult.stateTransition.stateRoot);

  // --- Batch write ---
  const batchResult = await ts.writeBatch({
    items: [
      {
        entityType: 'AgentResponse',
        data: { text: 'Item 1', score: 0.85 },
        actorId: 'agent-1',
      },
      {
        entityType: 'AgentResponse',
        data: { text: 'Item 2', score: 0.3 }, // Will fail limits (min 0.5)
        actorId: 'agent-2',
      },
      {
        entityType: 'AgentResponse',
        data: { text: 'Item 3', score: 0.95 },
        actorId: 'admin',
      },
    ],
    feedLabel: 'daily-batch',
  });

  console.log('\n📦 Batch result:');
  console.log(`  ${batchResult.accepted}/${batchResult.total} accepted`);
  for (const r of batchResult.results) {
    console.log(`  - ${r.entityId}: ${r.passed ? '✅' : '❌'} ${r.failReason ?? ''}`);
  }
}

main().catch(console.error);
