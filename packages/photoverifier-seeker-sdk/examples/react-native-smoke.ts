import {
  verifySeeker,
  buildIntegrityPayload,
  createNonceU64,
  nonceToString,
  createIntegrityEnvelope,
  requestAttestedPresignedPut,
  buildRecordPhotoProofTransaction,
} from '../src';
import { Connection, PublicKey } from '@solana/web3.js';

async function smoke(signMessage: (msg: Uint8Array) => Promise<Uint8Array>) {
  const nonce = createNonceU64();
  const payload = buildIntegrityPayload({
    hashHex: 'ab'.repeat(32),
    latitudeE6: 37774900,
    longitudeE6: -122419400,
    timestampSec: Math.floor(Date.now() / 1000),
    wallet: '11111111111111111111111111111111',
    nonce: nonceToString(nonce),
    slot: 1,
    blockhash: 'DummyBlockhash11111111111111111111111111111111',
  });

  const envelope = await createIntegrityEnvelope(payload, signMessage);

  // Type smoke only: runtime values are placeholders.
  await requestAttestedPresignedPut('https://example.com/uploads', {
    key: 'photos/demo/abc.jpg',
    contentType: 'image/jpeg',
    integrity: envelope,
  });

  await buildRecordPhotoProofTransaction({
    connection: new Connection('https://api.devnet.solana.com'),
    owner: new PublicKey(payload.wallet),
    hash32: new Uint8Array(32),
    nonce,
    timestampSec: payload.timestampSec,
    latitudeE6: payload.latitudeE6,
    longitudeE6: payload.longitudeE6,
    attestationSignature64: new Uint8Array(64),
  });

  await verifySeeker({
    walletAddress: payload.wallet,
    rpcUrl: 'https://api.mainnet-beta.solana.com',
  });
}

void smoke(async () => new Uint8Array(64));
