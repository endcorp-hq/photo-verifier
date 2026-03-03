import { loadPhotoCatalog, type PhotoCatalogItem } from './photo-catalog';
import { getStorageConfig } from './storage-adapter';

type S3ListingServiceOptions = {
  maxItems: number;
  includeProofSidecar: boolean;
  prefix?: string;
  cdnDomain?: string | null;
  env?: NodeJS.ProcessEnv;
};

export async function loadS3PhotoCatalog(
  options: S3ListingServiceOptions
): Promise<PhotoCatalogItem[]> {
  const storage = getStorageConfig(options.env);
  return loadPhotoCatalog({
    maxItems: options.maxItems,
    prefix: options.prefix ?? storage.prefix,
    includeProofSidecar: options.includeProofSidecar,
    cdnDomain: options.cdnDomain ?? storage.cdnDomain,
  });
}
