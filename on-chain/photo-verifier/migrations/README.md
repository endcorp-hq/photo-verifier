# Photo Verifier Migrations

## Current State

`migrations/deploy.ts` is intentionally a no-op today.

Reason: the current program deployment does not require post-deploy account rewrites or backfills.

## Migration Roadmap

Add concrete migration actions to `deploy.ts` when any of the following occurs:

1. Account layout changes for existing PDA/state accounts.
2. Instruction discriminator changes that require replay/backfill.
3. New required config accounts that must be initialized for live deployments.
4. Program-ID migrations where historical references must be rewritten.

## Required Steps When Migration Work Is Added

1. Document the migration scope and rollback plan in this file.
2. Implement idempotent migration logic in `deploy.ts`.
3. Add dry-run verification output and post-migration checks.
4. Capture runbook notes in the release PR.
