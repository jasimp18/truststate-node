# TrustState Trustgate API Server

The V3 compliance engine. All compliance logic runs here — the SDK never touches BaaS.

## Architecture

```
┌──────────────┐     HTTP      ┌─────────────────┐     BaaS SDK      ┌──────────────┐
│  SDK (thin)  │ ──────────▶  │  Trustgate API   │ ──────────────▶  │  V3 BaaS     │
│  @truststate │              │  ComplianceMole  │                   │  (Merkle DB) │
│  /sdk        │  ◀──────────  │  WriteHandler    │  ◀──────────────  │              │
│              │   responses   │  PolicyService   │   Merkle proofs  │              │
└──────────────┘              │  LibraryService  │                   └──────────────┘
                              │  SchemaService   │
                              │  ViolationService│
                              │  EntityState     │
                              │  AI Layer (P4)   │
                              └─────────────────┘
```

## Why This Architecture?

Every write flows through Trustgate. This ensures:
- ✅ Violations show up in the dashboard
- ✅ AI explanation triggers fire
- ✅ Anomaly detection scans run
- ✅ Source profiles update
- ✅ Activity feed entries log
- ✅ Policy library usage tracks
- ✅ Tenant analytics record

If the SDK talked to BaaS directly, all of that is bypassed.

## Setup

```bash
cd server
npm install
npm run build
npm start
```

## Environment

| Variable | Description | Default |
|----------|-------------|---------|
| `SMART_HOST_URL` | V3 Smart Host URL | `https://host.smartengines.io` |
| `TRUSTSTATE_APP_NAME` | BaaS application name | `truststate` |
| `TRUSTSTATE_APP_ID` | BaaS app ID (skip registration) | — |
| `TRUSTSTATE_CHAIN` | Auth chain | `hedera` |
| `TRUSTSTATE_WALLET_ADDRESS` | Wallet for BaaS auth | — |
| `TRUSTSTATE_PUBLIC_KEY` | Public key (hex) | — |
| `PORT` | Server port | `3100` |

## API Endpoints

See [router.ts](src/server/router.ts) for the full 22-endpoint API surface.

### Quick Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/write` | Single compliance write |
| `POST` | `/v1/write/batch` | Batch compliance write |
| `GET` | `/v1/registry` | Query compliance records |
| `GET` | `/v1/violations` | Query violations |
| `POST` | `/v1/schemas` | Create schema |
| `POST` | `/v1/policies` | Create policy |
| `GET` | `/v1/library/packs` | Browse policy packs |
| `GET` | `/v1/library/templates` | Search templates |
| `POST` | `/v1/playground/validate` | Inline atom validation |
| `GET` | `/health` | Health check |
