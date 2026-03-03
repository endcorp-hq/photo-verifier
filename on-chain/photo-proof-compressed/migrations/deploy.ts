import * as anchor from '@coral-xyz/anchor';

/**
 * Intentional no-op migration entrypoint.
 * No post-deploy state transforms are currently required for this program.
 */
module.exports = async function deploy(provider: anchor.AnchorProvider): Promise<void> {
  anchor.setProvider(provider);
};
