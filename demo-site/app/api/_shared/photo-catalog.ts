import {
  getObjectViewUrl,
  listPhotoKeys,
  loadOptionalSidecarJson,
} from './storage-adapter';
import { parseS3PhotoKey } from '@photoverifier/core/dist/storage.js';

export type PhotoCatalogItem = {
  key: string;
  url: string;
  seekerMint: string;
  hashHex: string;
  sidecar: unknown | null;
  proofUrl: string | null;
};

export async function loadPhotoCatalog(params: {
  maxItems: number;
  prefix: string;
  includeProofSidecar: boolean;
  cdnDomain?: string | null;
}): Promise<PhotoCatalogItem[]> {
  const keys = await listPhotoKeys({
    maxItems: params.maxItems,
    prefix: params.prefix,
  });

  return Promise.all(
    keys.map(async (key) => {
      const { seekerMint, hashHex } = parsePhotoKey(key, params.prefix);
      const url = await getObjectViewUrl(key, params.cdnDomain);

      if (!params.includeProofSidecar) {
        return {
          key,
          url,
          seekerMint,
          hashHex,
          sidecar: null,
          proofUrl: null,
        };
      }

      const sidecarLoad = await loadOptionalSidecarJson(key);
      return {
        key,
        url,
        seekerMint,
        hashHex,
        sidecar: sidecarLoad.sidecar,
        proofUrl: sidecarLoad.proofUrl,
      };
    })
  );
}

function parsePhotoKey(key: string, basePrefix: string): { seekerMint: string; hashHex: string } {
  const parsed = parseS3PhotoKey(key, { basePrefix });
  if (!parsed) {
    return { seekerMint: 'unknown', hashHex: 'unknown' };
  }
  return { seekerMint: parsed.seekerMint, hashHex: parsed.photoHashHex };
}
