# Licensing

This repository currently contains mixed licensing across packages/components.

## Package License Summary

| Component | License metadata |
|---|---|
| `@endcorp/photoverifier-core` | no explicit field in `package.json` (treat as project-defined until finalized) |
| `@endcorp/photoverifier-sdk` | `MIT` |
| `@endcorp/photoverifier-seeker-sdk` | `MIT` |
| `@endcorp/photoverifier-blockchain` | `PROPRIETARY` |
| `on-chain/photo-proof-compressed` crate/package metadata | `ISC` (package metadata) |

## Practical Guidance

- Treat `@endcorp/photoverifier-blockchain` as non-open commercial code unless legal terms are explicitly updated.
- Keep license metadata consistent before public npm publishing.
- If publishing new packages, ensure each has:
  - explicit `license` field
  - matching LICENSE file where required

## Contributor Note

If you change package boundaries or re-export rules, review this document and package metadata in the same PR.
