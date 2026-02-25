/**
 * Photo Proof Compressed - Solana Program
 *
 * Uses state compression to store photo proofs at ~$0.001 per photo
 * instead of ~$1 using traditional accounts.
 *
 * This is a simplified version. For production, integrate with
 * Bubblegum protocol for full concurrent Merkle tree support.
 */
use anchor_lang::prelude::*;
use anchor_lang::system_program::System;

declare_id!("J8U2PEf8ZaXcG5Q7xPCob92qFA8H8LWj1j3xiuKA6QEt");

/// Photo proof metadata stored on-chain
/// Note: In a full compression impl, only the root hash would be stored here
/// and the actual proof data would be in the Merkle tree
#[account]
#[derive(InitSpace)]
pub struct PhotoMetadata {
    pub owner: Pubkey,
    pub hash: [u8; 32],        // Blake3 hash of photo (32 bytes)
    pub timestamp: i64,        // Unix timestamp (8 bytes)
    pub latitude: i64,         // Fixed-point, 6 decimal places (8 bytes)
    pub longitude: i64,        // Fixed-point, 6 decimal places (8 bytes)
    pub merkle_root: [u8; 32], // Root of Merkle tree (32 bytes)
    pub leaf_index: u32,       // Index in tree (4 bytes)
    pub bump: u8,              // PDA bump (1 byte)
    pub created_at: i64,       // Block timestamp (8 bytes)
                               // Total: ~140 bytes vs ~600 bytes traditional
}

impl PhotoMetadata {
    pub const MAX_SIZE: usize = 32 + 32 + 8 + 8 + 8 + 32 + 4 + 1 + 8;
}

/// Configuration for a proof tree
#[account]
#[derive(InitSpace)]
pub struct TreeConfig {
    pub authority: Pubkey,
    pub merkle_tree: Pubkey,
    pub max_capacity: u64,
    pub current_count: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl TreeConfig {
    pub const MAX_SIZE: usize = 32 + 32 + 8 + 8 + 8 + 1;
}

/// Errors
#[error_code]
pub enum PhotoProofError {
    #[msg("Tree is at capacity")]
    TreeFull,
    #[msg("Invalid timestamp")]
    InvalidTimestamp,
    #[msg("Invalid coordinates")]
    InvalidCoordinates,
    #[msg("Proof not found")]
    ProofNotFound,
    #[msg("Unauthorized")]
    Unauthorized,
}

/// Initialize a new photo proof tree
#[derive(Accounts)]
pub struct InitializeTree<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + TreeConfig::MAX_SIZE,
        seeds = [b"tree_config", authority.key().as_ref()],
        bump
    )]
    pub tree_config: Account<'info, TreeConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Record a new photo proof
#[derive(Accounts)]
pub struct RecordPhotoProof<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + PhotoMetadata::MAX_SIZE,
        seeds = [b"photo", owner.key().as_ref(), &hash],
        bump
    )]
    pub photo_metadata: Account<'info, PhotoMetadata>,
    #[account(
        mut,
        seeds = [b"tree_config", tree_config.authority.key().as_ref()],
        bump = tree_config.bump
    )]
    pub tree_config: Account<'info, TreeConfig>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RecordPhotoProofArgs {
    pub hash: [u8; 32],
    pub timestamp: i64,
    pub latitude: i64,
    pub longitude: i64,
    pub merkle_root: [u8; 32],
    pub leaf_index: u32,
}

/// Verify an existing photo proof
#[derive(Accounts)]
pub struct VerifyPhotoProof<'info> {
    #[account(
        seeds = [b"photo", photo_metadata.owner.key().as_ref(), &photo_metadata.hash],
        bump = photo_metadata.bump
    )]
    pub photo_metadata: Account<'info, PhotoMetadata>,
}

/// Program entrypoints
#[program]
pub mod photo_proof_compressed {
    use super::*;

    /// Initialize a photo proof tree
    pub fn initialize_tree(ctx: Context<InitializeTree>, max_capacity: u64) -> Result<()> {
        let tree_config = &mut ctx.accounts.tree_config;
        tree_config.authority = ctx.accounts.authority.key();
        tree_config.merkle_tree = Pubkey::default();
        tree_config.max_capacity = max_capacity;
        tree_config.current_count = 0;
        tree_config.created_at = Clock::get()?.unix_timestamp;
        tree_config.bump = ctx.bumps.tree_config;

        msg!("Initialized tree with capacity: {}", max_capacity);
        Ok(())
    }

    /// Record a photo proof
    pub fn record_photo_proof(
        ctx: Context<RecordPhotoProof>,
        args: RecordPhotoProofArgs,
    ) -> Result<()> {
        let tree_config = &mut ctx.accounts.tree_config;

        // Check capacity
        require!(
            tree_config.current_count < tree_config.max_capacity,
            PhotoProofError::TreeFull
        );

        // Validate timestamp (within last year, not in future)
        let current_time = Clock::get()?.unix_timestamp;
        require!(
            args.timestamp <= current_time + 60,
            PhotoProofError::InvalidTimestamp
        );
        require!(
            args.timestamp > current_time - 365 * 24 * 60 * 60,
            PhotoProofError::InvalidTimestamp
        );

        // Validate coordinates (scaled by 1e6)
        require!(
            args.latitude >= -90_000_000 && args.latitude <= 90_000_000,
            PhotoProofError::InvalidCoordinates
        );
        require!(
            args.longitude >= -180_000_000 && args.longitude <= 180_000_000,
            PhotoProofError::InvalidCoordinates
        );

        // Increment count
        tree_config.current_count = tree_config.current_count.checked_add(1).unwrap();

        // Store metadata
        let metadata = &mut ctx.accounts.photo_metadata;
        metadata.owner = ctx.accounts.owner.key();
        metadata.hash = args.hash;
        metadata.timestamp = args.timestamp;
        metadata.latitude = args.latitude;
        metadata.longitude = args.longitude;
        metadata.merkle_root = args.merkle_root;
        metadata.leaf_index = args.leaf_index;
        metadata.bump = ctx.bumps.photo_metadata;
        metadata.created_at = current_time;

        msg!(
            "Recorded proof: hash={:?}, time={}, pos=({},{})",
            &args.hash[..8],
            args.timestamp,
            args.latitude as f64 / 1_000_000.0,
            args.longitude as f64 / 1_000_000.0
        );

        Ok(())
    }

    /// Verify a photo proof by hash
    pub fn verify_photo_proof(ctx: Context<VerifyPhotoProof>) -> Result<PhotoMetadata> {
        Ok(ctx.accounts.photo_metadata.clone())
    }
}
