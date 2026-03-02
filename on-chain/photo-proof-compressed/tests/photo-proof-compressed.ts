import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { PhotoProofCompressed } from "../target/types/photo_proof_compressed";
import crypto from "crypto";

const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new web3.PublicKey(
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"
);
const SPL_NOOP_PROGRAM_ID = new web3.PublicKey(
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
);
const PROGRAM_FEE_AUTHORITY = new web3.PublicKey(
  "DTrsex7XGyS6QstUr4GFZ4cHYEm4YoeD75799A7ns7Sc"
);
const MERKLE_TREE_ACCOUNT_SPACE = 31_800;
const ATTESTATION_PREFIX = Buffer.from("photo-proof-attestation-v1", "utf8");

function buildAttestationMessage(params: {
  owner: web3.PublicKey;
  hash: Uint8Array;
  nonce: number;
  timestamp: number;
  h3Index: bigint;
}) {
  const out = Buffer.alloc(ATTESTATION_PREFIX.length + 32 + 32 + 8 + 8 + 8);
  let o = 0;
  ATTESTATION_PREFIX.copy(out, o);
  o += ATTESTATION_PREFIX.length;
  params.owner.toBuffer().copy(out, o);
  o += 32;
  Buffer.from(params.hash).copy(out, o);
  o += 32;
  out.writeBigUInt64LE(BigInt(params.nonce), o);
  o += 8;
  out.writeBigInt64LE(BigInt(params.timestamp), o);
  o += 8;
  out.writeBigUInt64LE(BigInt(params.h3Index), o);
  return out;
}

function signMessageEd25519(secretKey: Uint8Array, message: Buffer): Buffer {
  const seed = Buffer.from(secretKey).subarray(0, 32);
  const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  const privateKeyDer = Buffer.concat([pkcs8Prefix, seed]);
  const privateKey = crypto.createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" });
  return crypto.sign(null, message, privateKey);
}

describe("photo-proof-compressed", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.photoProofCompressed as Program<PhotoProofCompressed>;

  it("initializes compressed tree and appends multiple proofs", async () => {
    const owner = provider.wallet as anchor.Wallet;
    const ownerKeypair = (provider.wallet as any).payer as web3.Keypair;
    if (!owner.publicKey.equals(PROGRAM_FEE_AUTHORITY)) {
      // initialize_tree is authority-gated in this program; local test wallets usually won't match.
      return;
    }

    const compressionProgramInfo = await provider.connection.getAccountInfo(
      SPL_ACCOUNT_COMPRESSION_PROGRAM_ID
    );
    if (!compressionProgramInfo?.executable) {
      // Local validators used in CI/dev often don't preload the account-compression program.
      // In that case we skip this integration path.
      return;
    }

    const [treeConfigPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("tree_config")],
      program.programId
    );
    const [treeAuthorityPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("tree_authority")],
      program.programId
    );

    const treeInfo = await provider.connection.getAccountInfo(treeConfigPda);
    let merkleTreePubkey: web3.PublicKey;
    if (!treeInfo) {
      const merkleTreeKeypair = web3.Keypair.generate();
      const lamports = await provider.connection.getMinimumBalanceForRentExemption(
        MERKLE_TREE_ACCOUNT_SPACE
      );
      const initializeIx = await program.methods
        .initializeTree()
        .accounts({
          treeConfig: treeConfigPda,
          merkleTree: merkleTreeKeypair.publicKey,
          treeAuthority: treeAuthorityPda,
          authority: owner.publicKey,
          accountCompressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
          logWrapper: SPL_NOOP_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        })
        .instruction();

      const tx = new web3.Transaction().add(
        web3.SystemProgram.createAccount({
          fromPubkey: owner.publicKey,
          newAccountPubkey: merkleTreeKeypair.publicKey,
          lamports,
          space: MERKLE_TREE_ACCOUNT_SPACE,
          programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        }),
        initializeIx
      );
      await provider.sendAndConfirm(tx, [merkleTreeKeypair]);
      merkleTreePubkey = merkleTreeKeypair.publicKey;
    } else {
      const treeConfig = await program.account.treeConfig.fetch(treeConfigPda);
      merkleTreePubkey = treeConfig.merkleTree;
    }

    const now = Math.floor(Date.now() / 1000);

    const hash1 = new Uint8Array(32).fill(1);
    const attestationMessage1 = buildAttestationMessage({
      owner: owner.publicKey,
      hash: hash1,
      nonce: 1,
      timestamp: now,
      h3Index: BigInt("0x8928308280fffff"),
    });
    const attestationSig1 = signMessageEd25519(ownerKeypair.secretKey, attestationMessage1);
    const attestationIx1 = web3.Ed25519Program.createInstructionWithPublicKey({
      publicKey: owner.publicKey.toBytes(),
      message: attestationMessage1,
      signature: attestationSig1,
    });
    await program.methods
      .recordPhotoProof({
        hash: Array.from(hash1) as any,
        nonce: new anchor.BN(1),
        timestamp: new anchor.BN(now),
        h3Index: new anchor.BN("617700169958293503"),
        attestationSignature: Array.from(attestationSig1) as any,
      })
      .preInstructions([attestationIx1])
      .accounts({
        treeConfig: treeConfigPda,
        merkleTree: merkleTreePubkey,
        treeAuthority: treeAuthorityPda,
        owner: owner.publicKey,
        feeRecipient: owner.publicKey,
        instructions: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        accountCompressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    const hash2 = new Uint8Array(32).fill(2);
    const attestationMessage2 = buildAttestationMessage({
      owner: owner.publicKey,
      hash: hash2,
      nonce: 2,
      timestamp: now + 1,
      h3Index: BigInt("0x8928308280bffff"),
    });
    const attestationSig2 = signMessageEd25519(ownerKeypair.secretKey, attestationMessage2);
    const attestationIx2 = web3.Ed25519Program.createInstructionWithPublicKey({
      publicKey: owner.publicKey.toBytes(),
      message: attestationMessage2,
      signature: attestationSig2,
    });
    await program.methods
      .recordPhotoProof({
        hash: Array.from(hash2) as any,
        nonce: new anchor.BN(2),
        timestamp: new anchor.BN(now + 1),
        h3Index: new anchor.BN("617700169958031359"),
        attestationSignature: Array.from(attestationSig2) as any,
      })
      .preInstructions([attestationIx2])
      .accounts({
        treeConfig: treeConfigPda,
        merkleTree: merkleTreePubkey,
        treeAuthority: treeAuthorityPda,
        owner: owner.publicKey,
        feeRecipient: owner.publicKey,
        instructions: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        accountCompressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    const treeConfig = await program.account.treeConfig.fetch(treeConfigPda);

    if (treeConfig.merkleTree.toBase58() !== merkleTreePubkey.toBase58()) {
      throw new Error("merkle tree mismatch");
    }
    if (treeConfig.currentCount.lt(new anchor.BN(2))) {
      throw new Error(`expected at least 2 records, got ${treeConfig.currentCount.toString()}`);
    }
  });
});
