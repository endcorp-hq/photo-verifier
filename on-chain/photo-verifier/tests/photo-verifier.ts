import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { PhotoVerifier } from "../target/types/photo-verifier";

describe("photo-verifier", () => {
  // Configure the client to use the configured cluster (devnet).
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.photoVerifier as Program<PhotoVerifier>;

  it("creates a PhotoData account and stores metadata", async () => {
    const payer = provider.wallet as anchor.Wallet;

    // Example inputs
    // For test purposes, emulate a 32-byte hash (in production, compute BLAKE3 off-chain)
    const hashSeed = Buffer.from("example-hash-seed");
    const hash = new Uint8Array(32);
    hash.set(hashSeed.subarray(0, Math.min(32, hashSeed.length)));

    const s3Uri = "s3://my-bucket/path/to/image.jpg";
    const location = "37.7749,-122.4194";
    const timestamp = new Date().toISOString();

    // Make sure the payer has funds on devnet
    const balance = await provider.connection.getBalance(payer.publicKey);
    if (balance < 0.5 * web3.LAMPORTS_PER_SOL) {
      const sig = await provider.connection.requestAirdrop(
        payer.publicKey,
        2 * web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    const [photoDataPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("photo"), payer.publicKey.toBuffer(), Buffer.from(hash), Buffer.from(timestamp)],
      program.programId
    );

    const txSig = await program.methods
      .createPhotoData(Array.from(hash) as any, s3Uri, location, timestamp)
      .accounts({
        payer: payer.publicKey,
        photoData: photoDataPda,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Transaction signature:", txSig);

    const account = await program.account.photoData.fetch(photoDataPda);
    console.log("PhotoData:", {
      payer: account.payer.toBase58(),
      hash: Buffer.from(account.hash).toString("hex"),
      s3Uri: account.s3Uri,
      location: account.location,
      timestamp: account.timestamp,
      bump: account.bump,
    });

    // Basic assertions
    if (account.payer.toBase58() !== payer.publicKey.toBase58()) throw new Error("payer mismatch");
    if (account.s3Uri !== s3Uri) throw new Error("s3Uri mismatch");
    if (account.location !== location) throw new Error("location mismatch");
    if (account.timestamp !== timestamp) throw new Error("timestamp mismatch");

    // Fetch and decode the transaction to view instruction data (args)
    const connection = provider.connection;
    const tx = await connection.getTransaction(txSig, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (tx && tx.transaction) {
      const message: any = tx.transaction.message as any;
      const programIdMatch = program.programId.toBase58();
      // Support both legacy and v0 messages
      const compiled = message.compiledInstructions || message.instructions || [];
      const accountKeys = message.staticAccountKeys || message.accountKeys || [];
      const ix = compiled.find((ci: any) => {
        const progKey = accountKeys[ci.programIdIndex];
        return progKey && progKey.toBase58 && progKey.toBase58() === programIdMatch;
      });
      if (ix) {
        const dataB64: string = typeof ix.data === "string" ? ix.data : Buffer.from(ix.data).toString("base64");
        const raw = Buffer.from(dataB64, "base64");
        const decoded = program.coder.instruction.decode(raw);
        if (decoded) {
          console.log("Decoded instruction:", decoded.name, decoded.data);
        } else {
          console.log("Could not decode instruction data");
        }
      }
    }
  });
});
