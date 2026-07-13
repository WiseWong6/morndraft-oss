import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getPublicDeliveryErrorMessage } from './PublicDeliveryToolbar';

test('delivery surfaces the clipboard fallback supplied by the public adapter', () => {
  assert.equal(
    getPublicDeliveryErrorMessage(new Error('当前浏览器无法复制图片，请使用“下载 PNG”。'), '交付失败'),
    '当前浏览器无法复制图片，请使用“下载 PNG”。',
  );
  assert.equal(getPublicDeliveryErrorMessage(null, '交付失败'), '交付失败');
  assert.equal(
    getPublicDeliveryErrorMessage(
      { code: 'clipboard-unavailable', message: '当前浏览器无法复制图片。' },
      'Unable to deliver.',
      'en',
    ),
    'Image copy failed. Use “Download PNG” instead.',
  );
  assert.equal(getPublicDeliveryErrorMessage(new Error('中文内部错误'), 'Unable to deliver.', 'en'), 'Unable to deliver.');
});

test('delivery invalidates and aborts a stale action when source identity changes', async () => {
  const source = await readFile(new URL('PublicDeliveryToolbar.tsx', import.meta.url), 'utf8');
  assert.match(source, /actionGenerationRef\.current \+= 1;[\s\S]*?actionAbortRef\.current\?\.abort\(\);/u);
  assert.match(source, /\[documentEpoch, source, theme, title\]/u);
  assert.match(source, /const assertCurrent = \(\) => \{[\s\S]*?sourceRef\.current !== requestedSource[\s\S]*?themeRef\.current !== requestedTheme[\s\S]*?titleRef\.current !== requestedTitle/u);
  assert.match(source, /waitForPublicPreviewRender\(previewRoot, 20_000, controller\.signal\)/u);
  assert.match(source, /requestAnimationFrame can be suspended indefinitely/u);
  assert.match(source, /await handler\(input\);[\s\S]*?assertCurrent\(\);/u);
  assert.match(source, /catch \(error\)[\s\S]*?controller\.abort\(error\)/u);
  assert.match(source, /actionGenerationRef\.current === generation/u);
});
