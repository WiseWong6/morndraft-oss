import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import test from 'node:test';

import { createOssBundleBudgetPlugin, resolveOssManualChunk } from './oss-bundle-budget.mjs';

const chunk = ({
  code = 'export const value = 1;',
  fileName,
  imports = [],
  isEntry = false,
  moduleIds = [`/src/${fileName}`],
}) => ({ code, fileName, imports, isEntry, moduleIds, type: 'chunk' });

const runBudget = (bundle, overrides = {}) => {
  const plugin = createOssBundleBudgetPlugin({
    entryBaselineBytes: 10_000,
    initialStaticBaselineBytes: 10_000,
    growthBudgetBytes: 0,
    parserBudgetBytes: 10_000,
    ...overrides,
  });
  plugin.generateBundle.call({
    error(message) {
      throw new Error(message);
    },
  }, {}, bundle);
};

const validBundle = () => ({
  'entry.js': chunk({
    code: 'import "./vendor.js"; export const entry = true;',
    fileName: 'entry.js',
    imports: ['vendor.js'],
    isEntry: true,
  }),
  'vendor.js': chunk({ fileName: 'vendor.js' }),
  'parse5.js': chunk({
    fileName: 'parse5.js',
    moduleIds: ['/repo/node_modules/parse5/dist/index.js', '/repo/node_modules/entities/decode.js'],
  }),
});

test('OSS bundle budget accepts a bounded entry graph with a lazy parser chunk', () => {
  assert.doesNotThrow(() => runBudget(validBundle()));
});

test('OSS manual chunk policy is stable across source and exported builds', () => {
  assert.equal(resolveOssManualChunk('/repo/node_modules/react/index.js'), 'vendor-react');
  assert.equal(resolveOssManualChunk('C:\\repo\\node_modules\\html2canvas\\dist.js'), 'vendor-capture');
  assert.equal(resolveOssManualChunk('/repo/node_modules/lucide-react/dist.js'), 'vendor-icons');
  assert.equal(resolveOssManualChunk('/repo/node_modules/json5/lib/index.js'), 'vendor-data');
  assert.equal(resolveOssManualChunk('/repo/src/App.tsx'), undefined);
});

test('OSS bundle budget rejects static parser leakage and split-entry budget bypasses', () => {
  const parserLeak = validBundle();
  parserLeak['entry.js'].imports.push('parse5.js');
  assert.throws(() => runBudget(parserLeak), /parse5.*entities.*leaked/u);

  const sharedDependencyLeak = validBundle();
  sharedDependencyLeak['parse5.js'].imports.push('vendor.js');
  assert.throws(() => runBudget(sharedDependencyLeak), /static dependencies leaked/u);

  assert.throws(
    () => runBudget(validBundle(), { initialStaticBaselineBytes: 1 }),
    /initial static JS gzip/u,
  );
});

test('OSS bundle budget rejects missing parser evidence and oversized lazy parser chunks', () => {
  const missingParser = validBundle();
  delete missingParser['parse5.js'];
  assert.throws(() => runBudget(missingParser), /expected lazy parse5 chunks/u);
  assert.throws(
    () => runBudget(validBundle(), { parserBudgetBytes: 1 }),
    /Lazy parse5 gzip/u,
  );

  const splitParser = validBundle();
  splitParser['parse5.js'].imports.push('parser-helper.js');
  splitParser['parser-helper.js'] = chunk({
    code: `export const lookup = "${Array.from({ length: 256 }, (_, index) => index.toString(36)).join('-')}";`,
    fileName: 'parser-helper.js',
  });
  const parse5OnlyGzipBytes = gzipSync(splitParser['parse5.js'].code).byteLength;
  assert.throws(
    () => runBudget(splitParser, { parserBudgetBytes: parse5OnlyGzipBytes }),
    /Lazy parse5 gzip/u,
  );
});
