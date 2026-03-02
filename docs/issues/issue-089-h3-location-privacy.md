## Priority
P0

## Context
The current proof flow stores and signs raw latitude/longitude (`latitudeE6` and `longitudeE6`) end-to-end. This can expose precise user location and increases doxxing risk.

## Scope
Replace raw coordinate handling with H3 cell IDs across the full photo-proof-compressed flow.

In scope:
- On-chain record args, attestation message, and leaf derivation
- SDK transaction builders and presign integrity types
- Presign API canonical payload and attestation signing
- Mobile app capture payload + local gallery metadata
- Demo-site proof decoding and location rendering

Out of scope:
- Legacy compatibility with old lat/long record format
- Historical migration of already submitted records

## Subtasks
- [x] Define canonical H3 payload contract (`h3Cell` as u64/hex string).
- [x] Update photo-proof-compressed program args and validation.
- [x] Update SDK transaction + attestation encoding.
- [x] Update presign services (cloud + local) payload validation/signing.
- [x] Update mobile app capture/upload flow and local history schema.
- [x] Update demo-site tx decoders and UI labels.
- [x] Run lint/build/tests and capture evidence.

## Acceptance Criteria
- [x] No new payloads include raw latitude/longitude fields.
- [x] `record_photo_proof` instruction encodes H3 cell in place of lat/lon.
- [x] Presign attestation signature verifies against H3-based message.
- [x] Mobile app can submit proofs and show H3 cell metadata.
- [x] Demo-site lists proofs with H3 cell values without decode errors.
