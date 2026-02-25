# Citizen Science SDK - Licensing Guide

## Overview

The Citizen Science SDK uses an **Open Core** licensing model, combining open-source principles with commercial sustainability.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CITIZEN SCIENCE SDK                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐    ┌─────────────────────────────┐ │
│  │   CORE (FREE)       │    │    BLOCKCHAIN (LICENSED)    │ │
│  │   MIT License       │    │    Proprietary              │ │
│  ├──────────────────────┤    ├─────────────────────────────┤ │
│  │ • Blake3 hashing    │    │ • Compressed accounts       │ │
│  │ • Camera capture    │    │ • Merkle tree management    │ │
│  │ • Location services │    │ • On-chain verification     │ │
│  │ • S3 abstraction    │    │ • License validation       │ │
│  │ • Theming system    │    │ • Premium support          │ │
│  └──────────────────────┘    └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Why Open Core?

### Benefits
1. **Community Adoption**: Free core enables widespread adoption and testing
2. **Lower Barrier**: Startups can evaluate before buying
3. **Network Effects**: More users = more valuable network
4. **Proof of Concept**: Easy for others to build demos
5. **Trust**: Open source code can be audited

### Commercial Viability
1. **Revenue**: License fees from blockchain features
2. **Support**: Enterprise support contracts
3. **Custom Integration**: Paid customization services
4. **Infrastructure**: Managed RPC/endpoints (future)

## License Tiers

| Feature | Free | Startup | Enterprise |
|---------|------|---------|------------|
| **Price** | $0 | $99/mo | $499/mo |
| **Photos/month** | 0 | 1,000 | Unlimited |
| **Core SDK** | ✓ | ✓ | ✓ |
| **Blake3 Hashing** | ✓ | ✓ | ✓ |
| **Camera Capture** | ✓ | ✓ | ✓ |
| **Location Services** | ✓ | ✓ | ✓ |
| **S3 Storage** | ✓ | ✓ | ✓ |
| **Theming** | ✓ | ✓ | ✓ |
| **Compressed Accounts** | - | ✓ | ✓ |
| **On-chain Verification** | - | ✓ | ✓ |
| **White-label** | - | ✓ | ✓ |
| **Custom Integration** | - | - | ✓ |
| **Dedicated Support** | - | - | ✓ |
| **SLA** | - | - | ✓ |

## Legal Structure

### Core SDK: MIT License

```
MIT License

Copyright (c) 2024 Citizen Science SDK Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Blockchain Layer: Proprietary License

The blockchain component (`@citizen-science-sdk/blockchain`) is proprietary and requires a valid license key.

```
PROPRIETARY LICENSE AGREEMENT

Copyright (c) 2024 Citizen Science SDK

This software, including the blockchain components and associated documentation,
is proprietary and may only be used in accordance with the terms of your license
agreement.

RESTRICTIONS:
- You may not modify, decompile, or reverse engineer the software
- You may not sublicense, rent, or lease the software
- You may not use the software beyond the scope of your license tier
- You must maintain the confidentiality of the software

For license inquiries, contact: licensing@citizen-science-sdk.com
```

## Comparison with Industry

| Company | Model | Open Source | Licensed |
|---------|-------|-------------|----------|
| MySQL | Dual | GPL | Commercial |
| Qt | Multi | LGPL/GPL | Commercial |
| Redis | Source-Available | RSALv2/SSPL | Enterprise |
| Elastic | Source-Available | SSPL | Cloud/Enterprise |
| MongoDB | Source-Available | SSPL | Cloud |
| **Citizen Science SDK** | Open Core | MIT | Proprietary |

## Implementation

### License Key Format

License keys are encoded with the following structure:
```
base64(tier:maxPhotos:expires:signature)
```

### Validation Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  App Start  │────▶│ Decode Key   │────▶│ Validate Sig    │
└─────────────┘     └──────────────┘     └─────────────────┘
                                               │
                    ┌──────────────┐           │
                    │ Check Expiry  │◀──────────┘
                    └──────────────┘
                         │   │
              ┌──────────┘   └──────────┐
              ▼                           ▼
        ┌──────────┐              ┌──────────┐
        │ Expired  │              │ Valid    │
        └──────────┘              └──────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
              ┌──────────┐        ┌──────────┐       ┌──────────┐
              │  Free    │        │ Startup  │       │Enterprise│
              └──────────┘        └──────────┘       └──────────┘
```

### Usage Tracking

The SDK tracks usage locally and can optionally sync to a backend:

```typescript
// Local tracking
const tracker = new UsageTracker(license);
tracker.recordPhoto();
const count = tracker.getPhotoCount();
const remaining = tracker.getRemainingPhotos();

// Export for sync
const usageData = tracker.exportUsage();
```

## Contributor Guidelines

### Contributor License Agreement (CLA)

All contributors must sign a CLA before contributions can be accepted:

1. **Individual CLA**: For personal contributions
2. **Corporate CLA**: For company contributions

### Copyright Assignment

- Contributors retain copyright to their contributions
- License applies to the collective work

## Future Considerations

### Possible License Changes

1. **Moving to AGPL**: If competitors heavily use the SDK without paying
2. **SSPL**: IfSaaS providers offer the SDK as a service
3. **Commercial-only**: If open core model proves unsustainable

Any license changes would:
- Apply only to new releases
- Grandfather existing licenses
- Include transition period

## FAQ

### Can I use the core SDK in my commercial product?

**Yes**. The core SDK (hash, camera, location, storage, theming) is MIT licensed and can be used in any project, including commercial products, with attribution.

### Do I need a license to test?

**No**. You can use the demo program ID on devnet for free testing. A license is only required for production use.

### What happens if I exceed my photo limit?

The SDK will stop accepting new verifications. You can either:
- Upgrade to a higher tier
- Wait for the next billing cycle (for monthly limits)

### Can I get a refund?

**Contact sales** for enterprise licensing. Monthly subscriptions are non-refundable.

### Is the blockchain program open source?

**No**. The Solana program for compressed accounts is proprietary. However:
- It's a wrapper around the open Bubblegum protocol
- You can verify proofs on-chain without our program
- The SDK interfaces are open

## Contact

- **Licensing**: licensing@citizen-science-sdk.com
- **Sales**: sales@citizen-science-sdk.com
- **Support**: support@citizen-science-sdk.com
- **Website**: https://citizen-science-sdk.com
