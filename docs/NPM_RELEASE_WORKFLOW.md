# NPM Release Workflow

## Packages

- `@photoverifier/sdk`
- `@photoverifier/seeker-sdk`

## Release Policy

- Use semver.
- Use `next` for pre-release validation (`-rc`, `-beta`).
- Promote to `latest` after app/demo validation.

## Preconditions

- `NPM_TOKEN` available in publish environment.
- 2FA requirements satisfied.
- Branch includes merged package changes.
- Release notes/changelog prepared.

## Validation Commands

From repo root:

```bash
pnpm install
pnpm -C packages/photoverifier-sdk build
pnpm -C packages/photoverifier-seeker-sdk build
pnpm -C packages/photoverifier-seeker-sdk smoke:types
pnpm release:pack-check
pnpm release:dry-run
```

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

## Rollback

- Do not overwrite versions.
- Deprecate bad version immediately.
- Publish patch version (`x.y.(z+1)`).
