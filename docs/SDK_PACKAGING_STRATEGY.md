# SDK Packaging Strategy

## Decision Summary

We will maintain two npm packages:

1. `@photoverifier/sdk` (base package)
2. `@photoverifier/seeker-sdk` (Seeker and React Native focused package)

## Why Two Packages

### Problem

A single package can work technically, but mobile integrators typically want a smaller, opinionated surface without scanning the full open-core API.

### Chosen approach

- Keep `@photoverifier/sdk` as the comprehensive API and source of truth.
- Add `@photoverifier/seeker-sdk` as a focused wrapper that re-exports the high-frequency Seeker flow surface and adds ergonomic helpers.

### Benefits

- Better onboarding for hackathon/mobile integrators.
- Clear boundary for Seeker-focused docs/examples.
- No breaking change for existing `@photoverifier/sdk` users.

## Package Boundaries

## `@photoverifier/sdk`

- Full API surface.
- Core + blockchain + on-chain tx builders + presign parsing.
- Backward-compatible for existing consumers.

## `@photoverifier/seeker-sdk`

- Re-exports key mobile flow primitives from base SDK.
- Adds helper APIs:
- `createNonceU64`
- `nonceToString`
- `buildIntegrityPayload`
- `canonicalizeIntegrityPayload`
- `createIntegrityEnvelope`

## Release Implications

- Publish both packages from workspace.
- Base SDK remains canonical for advanced usage.
- Seeker SDK versions should track base SDK compatibility.

## Validation Checklist

- `pnpm --filter @photoverifier/sdk build`
- `pnpm --filter @photoverifier/seeker-sdk build`
- `pnpm --filter @photoverifier/seeker-sdk smoke:types`
