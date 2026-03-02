# NPM Release Workflow

## Scope

This workflow covers npm release readiness and publish execution for:

- `@photoverifier/sdk`
- `@photoverifier/seeker-sdk`

## Version and Tag Policy

- Use semver.
- Use `next` dist-tag for pre-release validation (`-rc`, `-beta`).
- Use `latest` only after app/demo validation on target cluster.

Recommended progression:

1. `x.y.z-rc.1` published with `--tag next`
2. Integrator validation pass
3. Promote stable `x.y.z` to `latest`

## Preconditions

- `NPM_TOKEN` configured for publish environment.
- 2FA requirements satisfied for account/org policy.
- Branch contains merged changes for SDK package updates.
- Release notes prepared.

## Local Validation Commands

From repo root:

```bash
pnpm install --no-frozen-lockfile
pnpm --filter @photoverifier/sdk build
pnpm --filter @photoverifier/seeker-sdk build
pnpm --filter @photoverifier/seeker-sdk smoke:types
pnpm release:pack-check
pnpm release:dry-run
```

## What `release:pack-check` enforces

- Both packages build before pack.
- `npm pack --dry-run --json` output is inspected.
- Tarball is blocked if it contains suspicious files such as:
- `node_modules/`
- `.env*`
- `*secret*`
- `id.json`
- `*.pem` or `*.key`

## Publish Commands

Stable (`latest`):

```bash
cd packages/photoverifier-sdk
npm publish --access public

cd ../photoverifier-seeker-sdk
npm publish --access public
```

Pre-release (`next`):

```bash
cd packages/photoverifier-sdk
npm publish --access public --tag next

cd ../photoverifier-seeker-sdk
npm publish --access public --tag next
```

## CI Release Automation

`/.github/workflows/release.yml` now builds both packages, runs pack checks, and publishes both SDK packages on tag pushes.

## Rollback Strategy

- If package content is wrong, deprecate bad version immediately.
- Publish patched version (`x.y.(z+1)`), do not overwrite an existing version.
- Communicate required upgrade version in changelog/README.
