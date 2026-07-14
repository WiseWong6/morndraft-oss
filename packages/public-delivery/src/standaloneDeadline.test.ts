import assert from 'node:assert/strict';
import test from 'node:test';

import { PublicDeliveryError } from './types';
import {
  buildPublicStandaloneHtml,
  withStandaloneAssetTimeout,
  withStandaloneOperationTimeout,
} from './standalone';

test('buildPublicStandaloneHtml applies the operation deadline to render readiness', async () => {
  await assert.rejects(
    buildPublicStandaloneHtml({
      previewRoot: {} as HTMLElement,
      source: '# pending standalone',
      contentType: 'markdown',
      theme: 'light',
      title: 'Pending standalone',
      ensureRendered: async () => new Promise<void>(() => undefined),
    }, { timeoutMs: 5 }),
    (error: unknown) => error instanceof PublicDeliveryError
      && error.code === 'download-unavailable'
      && /portable standalone HTML.*超时/u.test(error.message),
  );
});

test('standalone operation deadline bounds multiple sequential local resource waits', async () => {
  let releaseFirst: (() => void) | undefined;
  let secondResourceAborted = false;
  const firstResource = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const pending = withStandaloneOperationTimeout(async (operationSignal) => {
    await withStandaloneAssetTimeout(
      async () => firstResource,
      operationSignal,
      1_000,
    );
    await withStandaloneAssetTimeout(
      async (resourceSignal) => new Promise<void>((_, reject) => {
        resourceSignal.addEventListener('abort', () => {
          secondResourceAborted = true;
          reject(resourceSignal.reason);
        }, { once: true });
      }),
      operationSignal,
      1_000,
    );
  }, undefined, 40);

  setTimeout(() => releaseFirst?.(), 5);

  await assert.rejects(
    pending,
    (error: unknown) => error instanceof PublicDeliveryError
      && error.code === 'download-unavailable'
      && /portable standalone HTML.*超时/u.test(error.message),
  );
  assert.equal(secondResourceAborted, true);
});

test('standalone operation deadline observes a non-cooperative late completion', async () => {
  let lateResolved = false;
  const pending = withStandaloneOperationTimeout(
    async () => new Promise<string>((resolve) => {
      setTimeout(() => {
        lateResolved = true;
        resolve('late standalone');
      }, 35);
    }),
    undefined,
    5,
  );

  await assert.rejects(pending, /portable standalone HTML.*超时/u);
  assert.equal(lateResolved, false);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(lateResolved, true);
});
