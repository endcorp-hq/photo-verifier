// Learn more https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch all monorepo packages
config.watchFolders = [workspaceRoot, path.join(workspaceRoot, 'packages')];

// Resolve packages in the monorepo to the app's node_modules first
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Some Solana dependencies reference subpaths that aren't exported for the
// `android` condition. Disable package exports so Metro uses classic
// file-based resolution and avoids noisy fallback warnings.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;

