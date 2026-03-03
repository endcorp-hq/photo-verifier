# SDK Packaging Strategy

## Decision

Maintain two published packages:

1. `@endcorp/photoverifier-sdk` (full/canonical API)
2. `@endcorp/photoverifier-seeker-sdk` (focused wrapper for Seeker mobile flows)

## Rationale

- Existing integrators keep a stable full API.
- Hackathon/mobile teams get a smaller, task-oriented surface.
- Wrapper avoids duplicated protocol logic.

## Package Boundaries

## `@endcorp/photoverifier-sdk`

- Source of truth for:
  - H3 helpers (`locationToH3Cell`, `h3CellToU64`)
  - presign payload canonicalization/parsing
  - on-chain transaction builders
  - seeker detection/verification helpers
- Includes broader open-core and blockchain exports.

## `@endcorp/photoverifier-seeker-sdk`

- Re-exports high-frequency symbols from base SDK.
- Adds ergonomic helpers:
  - `createNonceU64`
  - `nonceToString`
  - `buildIntegrityPayload`
  - `createIntegrityEnvelope`

## Versioning

- Keep seeker-sdk compatible with matching base SDK release.
- Publish together for release candidates and stable tags.

## Validation Before Publish

```bash
pnpm -C packages/photoverifier-sdk build
pnpm -C packages/photoverifier-seeker-sdk build
pnpm -C packages/photoverifier-seeker-sdk smoke:types
```
