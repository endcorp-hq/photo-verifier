use anchor_lang::prelude::*;
use anchor_lang::InstructionData;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::keccak::hashv;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};
use anchor_lang::system_program::{transfer, Transfer};
use anchor_lang::system_program::System;
use spl_account_compression::program::SplAccountCompression;
use spl_account_compression::Noop;

declare_id!("3i6eNpCFvXhMg8LESAutXWKUtAey9mAbTziLLuUc78Hu");

const TREE_MAX_DEPTH: u32 = 14;
const TREE_MAX_BUFFER_SIZE: u32 = 64;
const TREE_MAX_CAPACITY: u64 = 1u64 << TREE_MAX_DEPTH;
const RECORD_FEE_LAMPORTS: u64 = 50_000;
const PROGRAM_FEE_AUTHORITY: Pubkey = pubkey!("DTrsex7XGyS6QstUr4GFZ4cHYEm4YoeD75799A7ns7Sc");
const ATTESTATION_AUTHORITY: Pubkey = pubkey!("Ga6SxqKLPTzrc4pykqrawSi9pvz3ZGhAdnZSBDKKioYk");
const ATTESTATION_PREFIX: &[u8] = b"photo-proof-attestation-v1";
const MAX_CAPTURE_AGE_SECS: i64 = 10 * 60;
const MAX_FUTURE_DRIFT_SECS: i64 = 60;
const ED25519_OFFSETS_START: usize = 2;
const ED25519_OFFSETS_SIZE: usize = 14;

/// Configuration for a proof tree
#[account]
#[derive(InitSpace)]
pub struct TreeConfig {
    pub version: u8,
    pub authority: Pubkey,
    pub tree_authority_bump: u8,
    pub merkle_tree: Pubkey,
    pub max_depth: u32,
    pub max_buffer_size: u32,
    pub max_capacity: u64,
    pub current_count: u64,
    pub bump: u8,
    pub created_at: i64,
}

impl TreeConfig {
    pub const MAX_SIZE: usize = 1 + 32 + 1 + 32 + 4 + 4 + 8 + 8 + 1 + 8;
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
    #[msg("Tree account mismatch")]
    InvalidTreeAccount,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Invalid fee recipient")]
    InvalidFeeRecipient,
    #[msg("Missing attestation instruction")]
    MissingAttestationInstruction,
    #[msg("Invalid attestation instruction")]
    InvalidAttestationInstruction,
}

#[derive(Accounts)]
pub struct InitializeTree<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + TreeConfig::MAX_SIZE,
        seeds = [b"tree_config"],
        bump
    )]
    pub tree_config: Account<'info, TreeConfig>,
    #[account(mut, signer)]
    /// CHECK: Must be a pre-created tree account owned by the compression program
    pub merkle_tree: UncheckedAccount<'info>,
    #[account(seeds = [b"tree_authority"], bump)]
    /// CHECK: PDA used as CPI signer for account compression writes
    pub tree_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub account_compression_program: Program<'info, SplAccountCompression>,
    pub log_wrapper: Program<'info, Noop>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: RecordPhotoProofArgs)]
pub struct RecordPhotoProof<'info> {
    #[account(
        mut,
        seeds = [b"tree_config"],
        bump = tree_config.bump
    )]
    pub tree_config: Account<'info, TreeConfig>,
    #[account(
        mut,
        address = tree_config.merkle_tree @ PhotoProofError::InvalidTreeAccount
    )]
    /// CHECK: The account data is owned/validated by the account-compression program
    pub merkle_tree: UncheckedAccount<'info>,
    #[account(seeds = [b"tree_authority"], bump = tree_config.tree_authority_bump)]
    /// CHECK: PDA used as CPI signer for account compression writes
    pub tree_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        address = tree_config.authority @ PhotoProofError::InvalidFeeRecipient
    )]
    pub fee_recipient: SystemAccount<'info>,
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: Sysvar instruction account validated by address constraint
    pub instructions: UncheckedAccount<'info>,
    pub account_compression_program: Program<'info, SplAccountCompression>,
    pub log_wrapper: Program<'info, Noop>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RecordPhotoProofArgs {
    pub hash: [u8; 32],
    pub nonce: u64,
    pub timestamp: i64,
    pub latitude: i64,
    pub longitude: i64,
    pub attestation_signature: [u8; 64],
}

#[program]
pub mod photo_proof_compressed {
    use super::*;

    pub fn initialize_tree(ctx: Context<InitializeTree>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.authority.key(),
            PROGRAM_FEE_AUTHORITY,
            PhotoProofError::InvalidAuthority
        );
        require_keys_eq!(
            *ctx.accounts.merkle_tree.owner,
            ctx.accounts.account_compression_program.key(),
            PhotoProofError::InvalidTreeAccount
        );
        let tree_authority_bump = ctx.bumps.tree_authority;
        let tree_config = &mut ctx.accounts.tree_config;

        tree_config.authority = ctx.accounts.authority.key();
        tree_config.version = 1;
        tree_config.tree_authority_bump = tree_authority_bump;
        tree_config.merkle_tree = ctx.accounts.merkle_tree.key();
        tree_config.max_depth = TREE_MAX_DEPTH;
        tree_config.max_buffer_size = TREE_MAX_BUFFER_SIZE;
        tree_config.max_capacity = TREE_MAX_CAPACITY;
        tree_config.current_count = 0;
        tree_config.created_at = Clock::get()?.unix_timestamp;
        tree_config.bump = ctx.bumps.tree_config;

        let signer_seeds: &[&[&[u8]]] = &[&[b"tree_authority", &[tree_authority_bump]]];
        let init_ix = build_init_empty_merkle_tree_ix(
            ctx.accounts.merkle_tree.key(),
            ctx.accounts.tree_authority.key(),
            ctx.accounts.log_wrapper.key(),
            TREE_MAX_DEPTH,
            TREE_MAX_BUFFER_SIZE,
        );
        invoke_signed(
            &init_ix,
            &[
                ctx.accounts.merkle_tree.to_account_info(),
                ctx.accounts.tree_authority.to_account_info(),
                ctx.accounts.log_wrapper.to_account_info(),
                ctx.accounts.account_compression_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        msg!(
            "Initialized compressed tree={}, depth={}, buffer={}, capacity={}",
            tree_config.merkle_tree,
            TREE_MAX_DEPTH,
            TREE_MAX_BUFFER_SIZE,
            TREE_MAX_CAPACITY
        );
        Ok(())
    }

    pub fn record_photo_proof(
        ctx: Context<RecordPhotoProof>,
        args: RecordPhotoProofArgs,
    ) -> Result<()> {
        let current_count = ctx.accounts.tree_config.current_count;
        let max_capacity = ctx.accounts.tree_config.max_capacity;
        let tree_merkle = ctx.accounts.tree_config.merkle_tree;
        let tree_authority_bump = ctx.accounts.tree_config.tree_authority_bump;

        require!(current_count < max_capacity, PhotoProofError::TreeFull);

        // Validate timestamp in a short anti-replay window.
        let current_time = Clock::get()?.unix_timestamp;
        require!(
            args.timestamp <= current_time + MAX_FUTURE_DRIFT_SECS,
            PhotoProofError::InvalidTimestamp
        );
        require!(
            args.timestamp >= current_time - MAX_CAPTURE_AGE_SECS,
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
        require_keys_eq!(
            tree_merkle,
            ctx.accounts.merkle_tree.key(),
            PhotoProofError::InvalidTreeAccount
        );
        verify_server_attestation(
            &ctx.accounts.instructions.to_account_info(),
            &ctx.accounts.owner.key(),
            &args,
        )?;

        let leaf = derive_leaf(&ctx.accounts.owner.key(), &args);
        let fee_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.fee_recipient.to_account_info(),
            },
        );
        transfer(fee_ctx, RECORD_FEE_LAMPORTS)?;

        let signer_seeds: &[&[&[u8]]] = &[&[b"tree_authority", &[tree_authority_bump]]];
        let append_ix = build_append_ix(
            ctx.accounts.merkle_tree.key(),
            ctx.accounts.tree_authority.key(),
            ctx.accounts.log_wrapper.key(),
            leaf,
        );
        invoke_signed(
            &append_ix,
            &[
                ctx.accounts.merkle_tree.to_account_info(),
                ctx.accounts.tree_authority.to_account_info(),
                ctx.accounts.log_wrapper.to_account_info(),
                ctx.accounts.account_compression_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        let tree_config = &mut ctx.accounts.tree_config;
        tree_config.current_count = current_count.checked_add(1).unwrap();

        msg!(
            "Appended compressed proof: hash_prefix={:?}, owner={}, nonce={}, fee_lamports={}, time={}, pos=({},{})",
            &args.hash[..8],
            ctx.accounts.owner.key(),
            args.nonce,
            RECORD_FEE_LAMPORTS,
            args.timestamp,
            args.latitude as f64 / 1_000_000.0,
            args.longitude as f64 / 1_000_000.0
        );

        Ok(())
    }
}

fn derive_leaf(owner: &Pubkey, args: &RecordPhotoProofArgs) -> [u8; 32] {
    let nonce_bytes = args.nonce.to_le_bytes();
    let timestamp_bytes = args.timestamp.to_le_bytes();
    let latitude_bytes = args.latitude.to_le_bytes();
    let longitude_bytes = args.longitude.to_le_bytes();
    hashv(&[
        b"photo-proof-v2",
        owner.as_ref(),
        &args.hash,
        &nonce_bytes,
        &timestamp_bytes,
        &latitude_bytes,
        &longitude_bytes,
    ])
    .to_bytes()
}

fn build_attestation_message(owner: &Pubkey, args: &RecordPhotoProofArgs) -> Vec<u8> {
    let mut out = Vec::with_capacity(ATTESTATION_PREFIX.len() + 32 + 32 + 8 + 8 + 8 + 8);
    out.extend_from_slice(ATTESTATION_PREFIX);
    out.extend_from_slice(owner.as_ref());
    out.extend_from_slice(&args.hash);
    out.extend_from_slice(&args.nonce.to_le_bytes());
    out.extend_from_slice(&args.timestamp.to_le_bytes());
    out.extend_from_slice(&args.latitude.to_le_bytes());
    out.extend_from_slice(&args.longitude.to_le_bytes());
    out
}

fn verify_server_attestation(
    instructions_sysvar: &AccountInfo,
    owner: &Pubkey,
    args: &RecordPhotoProofArgs,
) -> Result<()> {
    let current_index = load_current_index_checked(instructions_sysvar)
        .map_err(|_| error!(PhotoProofError::MissingAttestationInstruction))?
        as usize;
    require!(
        current_index > 0,
        PhotoProofError::MissingAttestationInstruction
    );

    let ed25519_ix = load_instruction_at_checked(current_index - 1, instructions_sysvar)
        .map_err(|_| error!(PhotoProofError::MissingAttestationInstruction))?;
    require_keys_eq!(
        ed25519_ix.program_id,
        ed25519_program::id(),
        PhotoProofError::InvalidAttestationInstruction
    );

    let data = ed25519_ix.data.as_slice();
    require!(
        data.len() >= ED25519_OFFSETS_START + ED25519_OFFSETS_SIZE,
        PhotoProofError::InvalidAttestationInstruction
    );
    require!(
        data[0] == 1,
        PhotoProofError::InvalidAttestationInstruction
    );

    let signature_offset =
        read_u16(data, 2).ok_or_else(|| error!(PhotoProofError::InvalidAttestationInstruction))?
            as usize;
    let signature_ix_idx =
        read_u16(data, 4).ok_or_else(|| error!(PhotoProofError::InvalidAttestationInstruction))?;
    let public_key_offset =
        read_u16(data, 6).ok_or_else(|| error!(PhotoProofError::InvalidAttestationInstruction))?
            as usize;
    let public_key_ix_idx =
        read_u16(data, 8).ok_or_else(|| error!(PhotoProofError::InvalidAttestationInstruction))?;
    let message_offset =
        read_u16(data, 10).ok_or_else(|| error!(PhotoProofError::InvalidAttestationInstruction))?
            as usize;
    let message_size =
        read_u16(data, 12).ok_or_else(|| error!(PhotoProofError::InvalidAttestationInstruction))?
            as usize;
    let message_ix_idx =
        read_u16(data, 14).ok_or_else(|| error!(PhotoProofError::InvalidAttestationInstruction))?;

    require!(
        signature_ix_idx == u16::MAX
            && public_key_ix_idx == u16::MAX
            && message_ix_idx == u16::MAX,
        PhotoProofError::InvalidAttestationInstruction
    );

    let signature_end = signature_offset
        .checked_add(64)
        .ok_or_else(|| error!(PhotoProofError::InvalidAttestationInstruction))?;
    let public_key_end = public_key_offset
        .checked_add(32)
        .ok_or_else(|| error!(PhotoProofError::InvalidAttestationInstruction))?;
    let message_end = message_offset
        .checked_add(message_size)
        .ok_or_else(|| error!(PhotoProofError::InvalidAttestationInstruction))?;

    let signature = data
        .get(signature_offset..signature_end)
        .ok_or_else(|| error!(PhotoProofError::InvalidAttestationInstruction))?;
    let public_key = data
        .get(public_key_offset..public_key_end)
        .ok_or_else(|| error!(PhotoProofError::InvalidAttestationInstruction))?;
    let message = data
        .get(message_offset..message_end)
        .ok_or_else(|| error!(PhotoProofError::InvalidAttestationInstruction))?;

    require!(
        public_key == ATTESTATION_AUTHORITY.as_ref(),
        PhotoProofError::InvalidAttestationInstruction
    );
    require!(
        signature == args.attestation_signature.as_slice(),
        PhotoProofError::InvalidAttestationInstruction
    );

    let expected_message = build_attestation_message(owner, args);
    require!(
        message == expected_message.as_slice(),
        PhotoProofError::InvalidAttestationInstruction
    );

    Ok(())
}

fn read_u16(data: &[u8], offset: usize) -> Option<u16> {
    let bytes = data.get(offset..offset + 2)?;
    Some(u16::from_le_bytes([bytes[0], bytes[1]]))
}

fn build_init_empty_merkle_tree_ix(
    merkle_tree: Pubkey,
    authority: Pubkey,
    noop: Pubkey,
    max_depth: u32,
    max_buffer_size: u32,
) -> Instruction {
    Instruction {
        program_id: spl_account_compression::id(),
        accounts: vec![
            AccountMeta::new(merkle_tree, false),
            AccountMeta::new_readonly(authority, true),
            AccountMeta::new_readonly(noop, false),
        ],
        data: spl_account_compression::instruction::InitEmptyMerkleTree {
            max_depth,
            max_buffer_size,
        }
        .data(),
    }
}

fn build_append_ix(
    merkle_tree: Pubkey,
    authority: Pubkey,
    noop: Pubkey,
    leaf: [u8; 32],
) -> Instruction {
    Instruction {
        program_id: spl_account_compression::id(),
        accounts: vec![
            AccountMeta::new(merkle_tree, false),
            AccountMeta::new_readonly(authority, true),
            AccountMeta::new_readonly(noop, false),
        ],
        data: spl_account_compression::instruction::Append { leaf }.data(),
    }
}
