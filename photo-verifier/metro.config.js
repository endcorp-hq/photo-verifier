// Learn more https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);
const appNodeModules = path.resolve(projectRoot, 'node_modules');

// Watch all monorepo packages
config.watchFolders = [workspaceRoot, path.join(workspaceRoot, 'packages')];

// Resolve packages in the monorepo to the app's node_modules first
config.resolver.nodeModulesPaths = [
  appNodeModules,
  path.resolve(workspaceRoot, 'node_modules'),
];

// Force a single React runtime across workspace packages.
config.resolver.extraNodeModules = {
  react: path.join(appNodeModules, 'react'),
  'react/jsx-runtime': path.join(appNodeModules, 'react/jsx-runtime'),
  'react/jsx-dev-runtime': path.join(appNodeModules, 'react/jsx-dev-runtime'),
  'react-native': path.join(appNodeModules, 'react-native'),
};

// Metro can still resolve React from pnpm's shared virtual store for files
// outside the app root. Pin React-related imports to the app runtime directly.
const reactModuleAliases = {
  react: path.join(appNodeModules, 'react', 'index.js'),
  'react/jsx-runtime': path.join(appNodeModules, 'react', 'jsx-runtime.js'),
  'react/jsx-dev-runtime': path.join(appNodeModules, 'react', 'jsx-dev-runtime.js'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const forced = reactModuleAliases[moduleName];
  if (forced) {
    return context.resolveRequest(context, forced, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Workspace packages in this repo rely on package subpath exports
// (for example @photoverifier/core/contracts/*), so keep exports enabled.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
