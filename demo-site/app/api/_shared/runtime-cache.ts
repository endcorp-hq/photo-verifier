type RuntimeCacheState = {
  maps: Map<string, Map<string, unknown>>;
};

declare global {
  // eslint-disable-next-line no-var
  var __PHOTO_VERIFIER_DEMO_RUNTIME_CACHE__: RuntimeCacheState | undefined;
}

function getRuntimeCacheState(): RuntimeCacheState {
  if (!globalThis.__PHOTO_VERIFIER_DEMO_RUNTIME_CACHE__) {
    globalThis.__PHOTO_VERIFIER_DEMO_RUNTIME_CACHE__ = {
      maps: new Map<string, Map<string, unknown>>(),
    };
  }
  return globalThis.__PHOTO_VERIFIER_DEMO_RUNTIME_CACHE__;
}

export function getRuntimeCacheMap<T>(name: string): Map<string, T> {
  const state = getRuntimeCacheState();
  const existing = state.maps.get(name);
  if (existing) {
    return existing as Map<string, T>;
  }
  const created = new Map<string, T>();
  state.maps.set(name, created as Map<string, unknown>);
  return created;
}
