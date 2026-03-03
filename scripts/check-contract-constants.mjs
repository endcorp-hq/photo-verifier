import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsPath = path.join(repoRoot, 'docs/CONTRACT_CONSTANTS.md');
const chainContractsUrl = pathToFileURL(
  path.join(repoRoot, 'packages/core/dist/contracts/chain-contracts.js')
).href;
const apiContractsUrl = pathToFileURL(
  path.join(repoRoot, 'packages/core/dist/contracts/api-contracts.js')
).href;

const docsText = await fs.readFile(docsPath, 'utf8');
const chain = await import(chainContractsUrl);
const api = await import(apiContractsUrl);

const expected = [
  chain.CHAIN_CONTRACT_VERSION,
  chain.PHOTO_PROOF_PROGRAM_ID_BASE58,
  chain.BUBBLEGUM_PROGRAM_ID_BASE58,
  chain.RECORD_PHOTO_PROOF_DISCRIMINATOR_SEED,
  String(chain.RECORD_PHOTO_PROOF_MIN_LEN),
  ...chain.SUPPORTED_SOLANA_CLUSTERS,
  api.API_CONTRACT_VERSION,
  api.HELIUS_TX_API_BASE_BY_CLUSTER.devnet,
  api.HELIUS_TX_API_BASE_BY_CLUSTER['mainnet-beta'],
  api.HELIUS_TX_API_BASE_BY_CLUSTER.testnet,
];

const missing = expected.filter((value) => !docsText.includes(value));
if (missing.length) {
  console.error('Contract constants doc is out of sync. Missing values:');
  for (const value of missing) console.error(`- ${value}`);
  process.exit(1);
}

console.log('Contract constants doc parity check passed.');
