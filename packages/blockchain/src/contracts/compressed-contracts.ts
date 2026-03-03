import { PublicKey } from '@solana/web3.js';
import {
  BUBBLEGUM_PROGRAM_ID_BASE58,
  PHOTO_PROOF_PROGRAM_ID_BASE58,
} from '@photoverifier/core/contracts/chain-contracts';

export const PHOTO_PROOF_PROGRAM_ID = new PublicKey(PHOTO_PROOF_PROGRAM_ID_BASE58);
export const BUBBLEGUM_PROGRAM_ID = new PublicKey(BUBBLEGUM_PROGRAM_ID_BASE58);

export interface TreeConfig {
  maxDepth: number;
  maxBufferSize: number;
  canopyDepth: number;
}

export const TREE_CONFIGS: Record<string, TreeConfig> = {
  small: {
    maxDepth: 10,
    maxBufferSize: 8,
    canopyDepth: 8,
  },
  medium: {
    maxDepth: 14,
    maxBufferSize: 64,
    canopyDepth: 8,
  },
  large: {
    maxDepth: 20,
    maxBufferSize: 1024,
    canopyDepth: 12,
  },
};

export interface LeafSchema {
  owner: PublicKey;
  delegate: PublicKey;
  nonce: number;
  dataHash: Uint8Array;
}

export function deriveTreeConfigPda(tree: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('tree_config'), tree.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  )[0];
}

export function deriveAuthorityPda(authority: PublicKey, tree: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('authority'), authority.toBuffer(), tree.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  )[0];
}
