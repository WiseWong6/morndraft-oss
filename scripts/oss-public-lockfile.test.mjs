import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectPublicPackageLock,
  resolveLockedDependencyPath,
  serializePublicPackageLock,
} from './oss-public-lockfile.mjs';

const sourceLock = {
  name: 'private-root',
  version: '1.0.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': {
      name: 'private-root',
      version: '1.0.0',
      dependencies: { private: '1.0.0', public: '1.0.0' },
    },
    'node_modules/private': { version: '1.0.0' },
    'node_modules/public': {
      version: '1.0.0',
      dependencies: { shared: '1.0.0' },
      optionalDependencies: { platform: '1.0.0' },
      peerDependencies: { peer: '1.0.0', missingOptionalPeer: '1.0.0' },
      peerDependenciesMeta: { missingOptionalPeer: { optional: true } },
    },
    'node_modules/public/node_modules/shared': {
      version: '1.0.0',
      dependencies: { leaf: '1.0.0' },
    },
    'node_modules/leaf': { version: '1.0.0' },
    'node_modules/platform': { version: '1.0.0', optional: true },
    'node_modules/peer': { version: '1.0.0' },
  },
};

const publicPackageJson = {
  name: 'morndraft',
  version: '1.0.0',
  license: 'Apache-2.0',
  engines: { node: '>=22' },
  dependencies: { public: '1.0.0' },
  devDependencies: {},
};

test('projects a deterministic transitive public dependency closure', () => {
  const projected = projectPublicPackageLock({ sourceLock, publicPackageJson });
  assert.deepEqual(Object.keys(projected.packages), [
    '',
    'node_modules/leaf',
    'node_modules/peer',
    'node_modules/platform',
    'node_modules/public',
    'node_modules/public/node_modules/shared',
  ]);
  assert.equal(projected.packages['node_modules/private'], undefined);
  assert.equal(
    serializePublicPackageLock({ sourceLock, publicPackageJson }),
    serializePublicPackageLock({ sourceLock, publicPackageJson }),
  );
});

test('resolves nested dependencies before root dependencies', () => {
  assert.equal(
    resolveLockedDependencyPath(sourceLock.packages, 'node_modules/public', 'shared'),
    'node_modules/public/node_modules/shared',
  );
  assert.equal(
    resolveLockedDependencyPath(sourceLock.packages, 'node_modules/public/node_modules/shared', 'leaf'),
    'node_modules/leaf',
  );
});

test('fails closed when the source lock cannot satisfy a required dependency', () => {
  const brokenLock = JSON.parse(JSON.stringify(sourceLock));
  delete brokenLock.packages['node_modules/leaf'];
  assert.throws(
    () => projectPublicPackageLock({ sourceLock: brokenLock, publicPackageJson }),
    /cannot resolve leaf/,
  );
});
