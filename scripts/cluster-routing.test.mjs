import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const clusterPolicy = await import(
  pathToFileURL(path.join(repoRoot, 'packages/core/dist/network/cluster-policy.js')).href
);
const networkUtils = await import(
  pathToFileURL(path.join(repoRoot, 'photo-verifier/providers/network/network-utils.ts')).href
);

test('getExplorerClusterUrlParam handles all cluster networks including custom endpoint', () => {
  assert.equal(clusterPolicy.getExplorerClusterUrlParam('devnet'), '?cluster=devnet');
  assert.equal(clusterPolicy.getExplorerClusterUrlParam('testnet'), '?cluster=testnet');
  assert.equal(clusterPolicy.getExplorerClusterUrlParam('mainnet-beta'), '');

  const customEndpoint = 'https://rpc.example.test/path?a=1&b=2';
  assert.equal(
    clusterPolicy.getExplorerClusterUrlParam('custom', customEndpoint),
    `?cluster=custom&customUrl=${encodeURIComponent(customEndpoint)}`
  );
});

test('network provider helpers initialize and route explorer URLs from config', () => {
  const clusters = [
    { id: 'solana:custom', name: 'Zeta', endpoint: 'https://rpc.custom.test', network: 'custom' },
    { id: 'solana:devnet', name: 'Alpha', endpoint: 'https://api.devnet.solana.com', network: 'devnet' },
    { id: 'solana:testnet', name: 'Beta', endpoint: 'https://api.testnet.solana.com', network: 'testnet' },
  ];

  assert.deepEqual(networkUtils.resolveInitialCluster(clusters), clusters[0]);
  assert.deepEqual(
    networkUtils.sortClustersByName(clusters).map((cluster) => cluster.name),
    ['Alpha', 'Beta', 'Zeta']
  );

  assert.equal(
    networkUtils.buildExplorerUrl('account/abc', clusters[1]),
    'https://explorer.solana.com/account/abc?cluster=devnet'
  );
  assert.equal(
    networkUtils.buildExplorerUrl('tx/123', clusters[0]),
    `https://explorer.solana.com/tx/123?cluster=custom&customUrl=${encodeURIComponent(clusters[0].endpoint)}`
  );
});
