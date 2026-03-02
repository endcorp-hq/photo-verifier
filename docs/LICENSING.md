# Licensing

This repository currently contains mixed licensing across packages/components.

## Package License Summary

| Component | License metadata |
|---|---|
| `@photoverifier/core` | no explicit field in `package.json` (treat as project-defined until finalized) |
| `@photoverifier/sdk` | `MIT` |
| `@photoverifier/seeker-sdk` | `MIT` |
| `@photoverifier/blockchain` | `PROPRIETARY` |
| `on-chain/photo-proof-compressed` crate/package metadata | `ISC` (package metadata) |

## Practical Guidance

- Treat `@photoverifier/blockchain` as non-open commercial code unless legal terms are explicitly updated.
- Keep license metadata consistent before public npm publishing.
- If publishing new packages, ensure each has:
  - explicit `license` field
  - matching LICENSE file where required

## Contributor Note

If you change package boundaries or re-export rules, review this document and package metadata in the same PR.
