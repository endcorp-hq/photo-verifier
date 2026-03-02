import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { PhotoProofCompressed } from "../target/types/photo_proof_compressed";

describe("photo-proof-compressed", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.photoProofCompressed as Program<PhotoProofCompressed>;

  it("initializes tree and stores multiple photo proofs for one owner", async () => {
    const owner = provider.wallet as anchor.Wallet;

    const [treeConfigPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("tree_config"), owner.publicKey.toBuffer()],
      program.programId
    );

    const treeInfo = await provider.connection.getAccountInfo(treeConfigPda);
    if (!treeInfo) {
      await program.methods
        .initializeTree(new anchor.BN(10_000))
        .accounts({
          treeConfig: treeConfigPda,
          authority: owner.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
    }

    const now = Math.floor(Date.now() / 1000);
    const merkleRoot = new Uint8Array(32).fill(7);

    const hash1 = new Uint8Array(32).fill(1);
    const [photoPda1] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("photo"), owner.publicKey.toBuffer(), Buffer.from(hash1)],
      program.programId
    );
    await program.methods
      .recordPhotoProof({
        hash: Array.from(hash1) as any,
        nonce: new anchor.BN(1),
        timestamp: new anchor.BN(now),
        latitude: new anchor.BN(37_774_900),
        longitude: new anchor.BN(-122_419_400),
        merkleRoot: Array.from(merkleRoot) as any,
        leafIndex: 0,
      })
      .accounts({
        photoMetadata: photoPda1,
        treeConfig: treeConfigPda,
        owner: owner.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    const hash2 = new Uint8Array(32).fill(2);
    const [photoPda2] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("photo"), owner.publicKey.toBuffer(), Buffer.from(hash2)],
      program.programId
    );
    await program.methods
      .recordPhotoProof({
        hash: Array.from(hash2) as any,
        nonce: new anchor.BN(2),
        timestamp: new anchor.BN(now + 1),
        latitude: new anchor.BN(37_775_000),
        longitude: new anchor.BN(-122_419_300),
        merkleRoot: Array.from(merkleRoot) as any,
        leafIndex: 1,
      })
      .accounts({
        photoMetadata: photoPda2,
        treeConfig: treeConfigPda,
        owner: owner.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    const proof1 = await program.account.photoMetadata.fetch(photoPda1);
    const proof2 = await program.account.photoMetadata.fetch(photoPda2);
    const treeConfig = await program.account.treeConfig.fetch(treeConfigPda);

    if (proof1.owner.toBase58() !== owner.publicKey.toBase58()) {
      throw new Error("proof1 owner mismatch");
    }
    if (proof2.owner.toBase58() !== owner.publicKey.toBase58()) {
      throw new Error("proof2 owner mismatch");
    }
    if (proof1.nonce.toString() !== "1") {
      throw new Error("proof1 nonce mismatch");
    }
    if (proof2.nonce.toString() !== "2") {
      throw new Error("proof2 nonce mismatch");
    }
    if (treeConfig.currentCount.toString() !== "2") {
      throw new Error("tree count mismatch");
    }
  });
});
