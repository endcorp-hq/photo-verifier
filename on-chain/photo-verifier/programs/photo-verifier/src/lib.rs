use anchor_lang::prelude::*;
use anchor_lang::system_program::System;

declare_id!("J8U2PEf8ZaXcG5Q7xPCob92qFA8H8LWj1j3xiuKA6QEt");

const MAX_URI_LEN: usize = 256;
const MAX_LOCATION_LEN: usize = 256;
const MAX_TIMESTAMP_LEN: usize = 64;

#[program]
pub mod photo_verifier {
    use super::*;

    pub fn create_photo_data(
        ctx: Context<CreatePhotoData>,
        hash: [u8; 32],
        s3_uri: String,
        location: String,
        timestamp: String,
    ) -> Result<()> {
        require!(s3_uri.len() <= MAX_URI_LEN, PhotoVerifierError::UriTooLong);
        require!(location.len() <= MAX_LOCATION_LEN, PhotoVerifierError::LocationTooLong);
        require!(timestamp.len() <= MAX_TIMESTAMP_LEN, PhotoVerifierError::TimestampTooLong);

        msg!(
            "create_photo_data: payer={}, s3_uri={}, location={}, timestamp={}",
            ctx.accounts.payer.key(),
            s3_uri,
            location,
            timestamp
        );
        msg!("hash={:?}", hash);

        let photo_data = &mut ctx.accounts.photo_data;
        photo_data.payer = ctx.accounts.payer.key();
        photo_data.hash = hash;
        photo_data.s3_uri = s3_uri;
        photo_data.location = location;
        photo_data.timestamp = timestamp;
        photo_data.bump = ctx.bumps.photo_data;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(hash: [u8; 32], s3_uri: String, location: String, timestamp: String)]
pub struct CreatePhotoData<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + PhotoData::MAX_SIZE,
        seeds = [b"photo", payer.key().as_ref(), &hash, timestamp.as_bytes()],
        bump
    )]
    pub photo_data: Account<'info, PhotoData>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct PhotoData {
    pub payer: Pubkey,
    pub hash: [u8; 32],
    pub s3_uri: String,
    pub location: String,
    pub timestamp: String,
    pub bump: u8,
}

impl PhotoData {
    pub const MAX_SIZE: usize = 32 + 32 + 4 + MAX_URI_LEN + 4 + MAX_LOCATION_LEN + 4 + MAX_TIMESTAMP_LEN + 1;
}

#[error_code]
pub enum PhotoVerifierError {
    #[msg("s3_uri too long")]
    UriTooLong,
    #[msg("location too long")]
    LocationTooLong,
    #[msg("timestamp too long")]
    TimestampTooLong,
}
