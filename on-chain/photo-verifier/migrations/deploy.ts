import * as anchor from '@coral-xyz/anchor';

/**
 * Intentional no-op migration entrypoint.
 *
 * Current releases do not require post-deploy state transformations.
 * Migration triggers and future rollout steps are tracked in ./README.md.
 */
module.exports = async function deploy(provider: anchor.AnchorProvider): Promise<void> {
  anchor.setProvider(provider);
};
