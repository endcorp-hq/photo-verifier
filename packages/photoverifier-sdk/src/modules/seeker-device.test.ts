import assert from 'node:assert/strict';
import test from 'node:test';

import { Platform } from 'react-native';
import { isSeekerDevice } from './seeker-device';

type PlatformConstants = {
  Model?: string;
};

test('isSeekerDevice returns true only for Seeker model constant', () => {
  const platform = Platform as unknown as { constants?: PlatformConstants };
  const original = platform.constants;

  platform.constants = { ...original, Model: 'Seeker' };
  assert.equal(isSeekerDevice(), true);

  platform.constants = { ...original, Model: 'Pixel 9' };
  assert.equal(isSeekerDevice(), false);

  platform.constants = original;
});
