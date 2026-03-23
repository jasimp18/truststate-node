# TrustState JavaScript / TypeScript SDK

[![npm](https://img.shields.io/badge/npm-%40truststate%2Fsdk-red)](https://github.com/jasimp18/truststate-js)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TrustState API](https://img.shields.io/badge/TrustState-API%20v1-green)](https://truststate-api.apps.trustchainlabs.com)

TypeScript/JavaScript SDK for **[TrustState](https://trustchainlabs.com)** — real-time compliance validation, policy enforcement, and immutable audit trails for AI agents, financial systems, and automated workflows.

**Zero runtime dependencies.** Uses native `fetch` and `crypto` (Node 18+, all modern browsers).

---

## What is TrustState?

TrustState is a compliance infrastructure platform. It lets you define **schemas** (what your data must look like) and **policies** (what rules it must follow), then validate any event or decision against them in real time — with cryptographic proof of every check.

Use it to:
- Ensure AI agent outputs comply with your SOPs before delivery
- Validate financial transactions against regulatory rules
- Prove that every decision in an automated workflow was checked and logged

---

## Installation

```bash
# Install from GitHub (npm package coming soon)
npm install github:jasimp18/truststate-js

# Or with yarn
yarn add github:jasimp18/truststate-js
```

Or clone and use locally:
```bash
git clone https://github.com/jasimp18/truststate-js.git
cd truststate-js
npm install
npm run build
```

**Requirements:** Node 18+ (for native fetch and crypto.randomUUID)

---

## Getting an API Key

1. Log in to your TrustState dashboard at [tstate.apps.trustchainlabs.com](https://tstate.apps.trustchainlabs.com)
2. Go to **Settings → API Keys**
3. Click **New API Key**, give it a label (e.g. `"My AI Agent"`)
4. Copy the key — it is shown **only once**

---

## Quick Start

```typescript
import { TrustStateClient } from '@truststate/sdk';

const ts = new TrustStateClient({ apiKey: 'ts_your_key_here' });

const result = await ts.check('AgentResponse', {
  responseText: 'Your loan application is under review.',
  confidenceScore: 0.92,
  disclaimer: 'This is not financial advice.',
  language: 'en'
});

if (result.passed) {
  console.log('✅ Compliant — Record ID:', result.recordId);
} else {
  console.log('❌ Blocked —', result.failReason);
}
```

**CommonJS:**
```javascript
const { TrustStateClient } = require('@truststate/sdk');
```

---

## Core Concepts

Before using the SDK, set up your schema and policy in the TrustState dashboard:

| Concept | What it is | Example |
|---|---|---|
| **Entity Type** | The name for the type of data you're validating | `AgentResponse`, `Transaction` |
| **Schema** | Defines the required fields and their types | `confidenceScore` must be a number |
| **Policy** | Defines the business rules | `confidenceScore` must be ≥ 0.7 |
| **Record** | A passed validation — cryptographically signed | Stored in Registry |
| **Violation** | A failed validation | Stored in Violations log |

---

## Usage

### 1. Single check

```typescript
import { TrustStateClient } from '@truststate/sdk';

const ts = new TrustStateClient({
  apiKey: 'ts_your_key_here',
  baseUrl: 'https://truststate-api.apps.trustchainlabs.com',  // default
  defaultSchemaVersion: '1.0',
  defaultActorId: 'agent-001',
  timeoutMs: 30000,
});

const result = await ts.check(
  'AgentResponse',
  {
    responseText: 'Here is your account summary.',
    confidenceScore: 0.88,
    disclaimer: 'For informational purposes only.',
    language: 'en'
  },
  {
    action: 'CREATE',                   // optional, defaults to CREATE
    entityId: 'session-abc-turn-1',    // optional, auto-generated if omitted
    schemaVersion: '1.0',               // optional, uses defaultSchemaVersion
    actorId: 'agent-001',              // optional, uses defaultActorId
  }
);

console.log(result.passed);      // true / false
console.log(result.recordId);   // "3fa85f64-..." (if passed)
console.log(result.failReason); // "Policy: min-confidence violated" (if failed)
console.log(result.failedStep); // 8 (schema) or 9 (policy)
```

### 2. Batch check

Submit multiple items in a single call — efficient for high-volume agents or transaction feeds.

```typescript
const batch = await ts.checkBatch(
  [
    {
      entityType: 'AgentResponse',
      data: { responseText: '...', confidenceScore: 0.9, disclaimer: '...', language: 'en' },
      entityId: 'session-001-turn-1'
    },
    {
      entityType: 'AgentResponse',
      data: { responseText: '...', confidenceScore: 0.4, disclaimer: '...', language: 'en' },
      entityId: 'session-002-turn-1'
    }
  ],
  {
    defaultSchemaVersion: '1.0',
    defaultActorId: 'agent-batch'
  }
);

console.log(`Batch: ${batch.accepted}/${batch.total} passed`);

for (const r of batch.results) {
  const icon = r.passed ? '✅' : '❌';
  console.log(`  ${icon} ${r.entityId} — ${r.failReason ?? r.recordId}`);
}
```

### 3. Verify a past record

Retrieve and verify a previously submitted record by its ID:

```typescript
const proof = await ts.verify(
  '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  'your_jwt_bearer_token'
);
console.log(proof);
```

---

## Express Middleware

Automatically validate request bodies against TrustState before they reach your route handler.

```typescript
import express from 'express';
import { TrustStateClient, trustStateMiddleware } from '@truststate/sdk';

const app = express();
const ts = new TrustStateClient({ apiKey: 'ts_your_key_here' });

app.use(express.json());

// Apply to a specific route
app.post(
  '/agent/respond',
  trustStateMiddleware(ts, {
    entityType: 'AgentResponse',
    action: 'CREATE',
    onFail: 'block',  // returns 422 if compliance fails
  }),
  (req, res) => {
    // TrustState has already validated req.body
    // complianceResult is attached to req.truststate
    const { recordId } = req.truststate;
    res.json({ status: 'ok', recordId });
  }
);
```

**`onFail` options:**

| Value | Behaviour |
|---|---|
| `"block"` (default) | Returns HTTP 422 with violation details |
| `"warn"` | Logs a warning, continues to route handler |
| `"pass"` | Silently continues regardless of result |

---

## Next.js Route Handler Wrapper

```typescript
// app/api/agent/respond/route.ts  (Next.js 13+ App Router)
import { TrustStateClient, withCompliance } from '@truststate/sdk';
import { NextRequest, NextResponse } from 'next/server';

const ts = new TrustStateClient({ apiKey: process.env.TRUSTSTATE_API_KEY! });

export const POST = withCompliance(ts, 'AgentResponse', async (req: NextRequest) => {
  const body = await req.json();
  // Compliance already validated — body is safe to use
  return NextResponse.json({ status: 'ok' });
});
```

**Pages Router (`/pages/api`):**
```typescript
import { withComplianceLegacy } from '@truststate/sdk';

export default withComplianceLegacy(ts, 'AgentResponse', async (req, res) => {
  res.json({ status: 'ok' });
});
```

---

## Mock Mode

Develop and test without connecting to the TrustState API. Zero network calls.

```typescript
const ts = new TrustStateClient({
  apiKey: '',
  mock: true,
  mockPassRate: 1.0   // 1.0 = always pass, 0.0 = always fail, 0.8 = 80% pass
});

const result = await ts.check('AgentResponse', { responseText: 'Test' });
console.log(result.passed); // true
console.log(result.mock);   // true
```

**Auto-mock in tests:**
```typescript
const ts = new TrustStateClient({
  apiKey: process.env.TRUSTSTATE_API_KEY ?? '',
  mock: !process.env.TRUSTSTATE_API_KEY,  // mock if no key set
  mockPassRate: 1.0
});
```

---

## Error Handling

```typescript
import { TrustStateClient, TrustStateError } from '@truststate/sdk';

const ts = new TrustStateClient({ apiKey: 'ts_your_key_here' });

try {
  const result = await ts.check('AgentResponse', data);

  if (!result.passed) {
    // Validation ran, but data failed policy/schema
    console.log('Step:', result.failedStep); // 8 = schema, 9 = policy
    console.log('Reason:', result.failReason);
  }
} catch (e) {
  if (e instanceof TrustStateError) {
    // HTTP-level error (auth failure, network issue, server error)
    console.error(`TrustState [${e.statusCode}]: ${e.message}`);
  }
}
```

**`failedStep` values:**

| Step | Meaning |
|---|---|
| `8` | Schema validation failed — data shape/type is wrong |
| `9` | Policy evaluation failed — data violated a business rule |

---

## TypeScript Types

```typescript
import type {
  TrustStateClientOptions,
  ComplianceResult,
  BatchResult,
  CheckItem,
} from '@truststate/sdk';

const options: TrustStateClientOptions = {
  apiKey: 'ts_...',
  mock: false,
  defaultSchemaVersion: '1.0',
};

const result: ComplianceResult = await ts.check('AgentResponse', data);
```

---

## Running the Examples

```bash
git clone https://github.com/jasimp18/truststate-js.git
cd truststate-js
npm install
npm run build

# AI agent demo (uses mock mode if no API key set)
export TRUSTSTATE_API_KEY="ts_your_key"
npx ts-node examples/ai-agent-demo.ts

# Batch transaction feed
npx ts-node examples/batch-feed.ts
```

---

## Running Tests

```bash
npm test
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `TRUSTSTATE_API_KEY` | Your TrustState API key | — |
| `TRUSTSTATE_BASE_URL` | API base URL (override for self-hosted) | `https://truststate-api.apps.trustchainlabs.com` |

---

## API Compatibility

| SDK Version | TrustState API |
|---|---|
| `0.1.x` | API v1 |

---

## Roadmap

- [ ] Publish to npm as `@truststate/sdk`
- [ ] Schema caching (avoid re-fetching on every call)
- [ ] LangChain callback handler
- [ ] OpenAI function call interceptor
- [ ] Deno support
- [ ] Browser bundle (ESM)

---

## Links

- **TrustState Platform:** [tstate.apps.trustchainlabs.com](https://tstate.apps.trustchainlabs.com)
- **API Reference:** [truststate-api.apps.trustchainlabs.com/docs](https://truststate-api.apps.trustchainlabs.com/docs)
- **Python SDK:** [github.com/jasimp18/truststate-py](https://github.com/jasimp18/truststate-py)
- **TrustChain Labs:** [trustchainlabs.com](https://trustchainlabs.com)

---

## License

MIT — see [LICENSE](LICENSE)
