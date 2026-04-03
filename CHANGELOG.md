# Changelog

## [1.1.0] — 2026-04-03

### Breaking Changes

- **`actorId` is now required** for all writes. Previously the SDK silently fell back to `"sdk-writer"` when no actor ID was provided. This fallback has been removed.
- Any call to `check()`, `checkBatch()`, or `checkWithEvidence()` that does not supply an `actorId` (per-call or via `defaultActorId` on the client) will now throw a `TrustStateError` (HTTP 400) **before** any network request is made.
- Any `actorId` that is not registered as an active Data Source in the TrustState tenant will be rejected by the server with `403 UNKNOWN_SOURCE`.

### Why This Changed

TrustState now enforces a **registered Data Source** model. Every integration must be declared in the TrustState dashboard under **Manage → Data Sources** before it can submit writes. This gives compliance teams:

- A clear registry of every system and feed writing to the ledger
- Per-source schema and policy bindings
- The ability to pause or revoke a source without changing API keys
- Audit trails tied to a named, managed entity rather than a free-text string

### Migration Guide

**Before (v1.0.x):**
```typescript
// actorId was optional — SDK fell back to "sdk-writer"
const client = new TrustStateClient({ apiKey: "ts_your_api_key" });
const result = await client.check("KYCRecord", data);
```

**After (v1.1.0):**
```typescript
// 1. Register your source in the TrustState dashboard first:
//    Manage → Data Sources → New Source
//    Set Source ID to e.g. "my-service-001"

// 2. Pass it as defaultActorId (applies to all calls):
const client = new TrustStateClient({
  apiKey: "ts_your_api_key",
  defaultActorId: "my-service-001",   // ← required
});
const result = await client.check("KYCRecord", data);

// Or pass per-call:
const result = await client.check("KYCRecord", data, {
  actorId: "my-service-001",
});
```

### What Happens on Error

| Scenario | Where caught | Error |
|---|---|---|
| `actorId` not provided | SDK (client-side) | `TrustStateError` (400) before HTTP call |
| `actorId` not registered in dashboard | API (server-side) | `403 UNKNOWN_SOURCE` |
| Source registered but status `inactive`/`paused` | API (server-side) | `403 UNKNOWN_SOURCE` |

### Other Changes

- `defaultActorId` constructor option is now documented as **required** in the config reference.
- README updated with Data Sources section, updated quickstart, and updated batch example.
- `CheckItem.actorId` now overrides `defaultActorId` per-item — unchanged behaviour, now explicitly documented.

---

## [1.0.0] — 2026-03-01

Initial release.
