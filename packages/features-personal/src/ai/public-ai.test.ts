import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PUBLIC_AI_CONFIG_SESSION_STORAGE_KEY,
  PUBLIC_AI_CONFIG_STORAGE_KEY,
  clearPublicAiConfig,
  getPublicAiSettingsSaveErrorKind,
  readPublicAiConfig,
  resolvePublicAiChatCompletionsUrl,
  savePublicAiSettings,
  validatePublicAiBaseUrl,
  writePublicAiConfig,
} from './config';
import { createPublicAiAdapter, PUBLIC_AI_MAX_USER_PROMPT_CHARS } from './client';
import {
  collectPublicAiLocalImageDataUrlSpans,
  omitPublicAiLocalImageDataUrls,
} from './redact';
import { PublicAiError, type PublicAiConfig } from './types';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

type StorageOperation = 'get' | 'remove' | 'set';

class FailingStorage extends MemoryStorage {
  private failure: { key: string; operation: StorageOperation } | null = null;

  failNext(operation: StorageOperation, key: string): void {
    this.failure = { key, operation };
  }

  private maybeFail(operation: StorageOperation, key: string): void {
    if (this.failure?.operation !== operation || this.failure.key !== key) return;
    this.failure = null;
    throw new Error(`blocked_${operation}`);
  }

  override getItem(key: string): string | null {
    this.maybeFail('get', key);
    return super.getItem(key);
  }

  override removeItem(key: string): void {
    this.maybeFail('remove', key);
    super.removeItem(key);
  }

  override setItem(key: string, value: string): void {
    this.maybeFail('set', key);
    super.setItem(key, value);
  }
}

const createStorage = () => ({
  localStorage: new MemoryStorage(),
  sessionStorage: new MemoryStorage(),
});

const configured = (overrides: Partial<PublicAiConfig> = {}): PublicAiConfig => ({
  apiKey: 'secret-key',
  baseUrl: 'https://models.example.com/v1',
  models: {
    generate: 'generate-model',
    modify: 'modify-model',
    summarize: 'summarize-model',
  },
  persistApiKey: false,
  ...overrides,
});

const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

test('legacy thin settings are read without mutating storage and migrate on save', () => {
  const storage = createStorage();
  storage.localStorage.setItem('morndraft.oss.ai.config', JSON.stringify({
    baseUrl: 'https://legacy.example.com/v1',
    models: ['generate-v1', 'modify-v1'],
  }));
  storage.sessionStorage.setItem('morndraft.oss.ai.session-key', 'session-secret');

  const legacy = readPublicAiConfig(storage);
  assert.deepEqual(legacy, {
    apiKey: 'session-secret',
    baseUrl: 'https://legacy.example.com/v1',
    models: {
      generate: 'generate-v1',
      modify: 'modify-v1',
      summarize: 'generate-v1',
    },
    persistApiKey: false,
  });
  assert.notEqual(storage.localStorage.getItem('morndraft.oss.ai.config'), null);

  writePublicAiConfig(legacy, storage);
  assert.equal(storage.localStorage.getItem('morndraft.oss.ai.config'), null);
  assert.equal(storage.sessionStorage.getItem('morndraft.oss.ai.session-key'), null);
  assert.equal(storage.localStorage.getItem('morndraft.oss.ai.key'), null);
  assert.equal(JSON.parse(storage.localStorage.getItem(PUBLIC_AI_CONFIG_STORAGE_KEY) ?? '{}').apiKey, '');
  assert.equal(
    JSON.parse(storage.sessionStorage.getItem(PUBLIC_AI_CONFIG_SESSION_STORAGE_KEY) ?? '{}').apiKey,
    'session-secret',
  );
});

test('persistApiKey is explicit and clear removes canonical and legacy keys', () => {
  const storage = createStorage();
  writePublicAiConfig(configured({ persistApiKey: true }), storage);
  assert.equal(JSON.parse(storage.localStorage.getItem(PUBLIC_AI_CONFIG_STORAGE_KEY) ?? '{}').apiKey, 'secret-key');
  writePublicAiConfig(configured({ persistApiKey: false }), storage);
  assert.equal(JSON.parse(storage.localStorage.getItem(PUBLIC_AI_CONFIG_STORAGE_KEY) ?? '{}').apiKey, '');
  clearPublicAiConfig(storage);
  assert.equal(storage.localStorage.length, 0);
  assert.equal(storage.sessionStorage.length, 0);
});

test('settings save reports blocked browser storage instead of pretending persistence succeeded', () => {
  const blocked = new MemoryStorage();
  blocked.setItem = () => { throw new Error('blocked'); };
  assert.throws(
    () => writePublicAiConfig(configured(), { localStorage: new MemoryStorage(), sessionStorage: blocked }),
    (error: unknown) => error instanceof PublicAiError && error.code === 'storage_error',
  );
});

test('settings save restores session, local and legacy values when any storage step fails', () => {
  const legacyConfigKey = 'morndraft.oss.ai.config';
  const legacyPersistedKey = 'morndraft.oss.ai.key';
  const legacySessionKey = 'morndraft.oss.ai.session-key';
  const cases: Array<{
    failingStore: 'localStorage' | 'sessionStorage';
    key: string;
    operation: StorageOperation;
  }> = [
    { failingStore: 'sessionStorage', key: PUBLIC_AI_CONFIG_SESSION_STORAGE_KEY, operation: 'set' },
    { failingStore: 'localStorage', key: PUBLIC_AI_CONFIG_STORAGE_KEY, operation: 'set' },
    { failingStore: 'localStorage', key: legacyConfigKey, operation: 'remove' },
  ];

  for (const item of cases) {
    const localStorage = new FailingStorage();
    const sessionStorage = new FailingStorage();
    const storage = { localStorage, sessionStorage };
    const oldSessionConfig = JSON.stringify(configured({ apiKey: 'old-session-key' }));
    const oldLocalConfig = JSON.stringify(configured({ apiKey: 'old-local-key', persistApiKey: true }));
    localStorage.setItem(PUBLIC_AI_CONFIG_STORAGE_KEY, oldLocalConfig);
    localStorage.setItem(legacyConfigKey, '{"baseUrl":"https://legacy.example.com/v1"}');
    localStorage.setItem(legacyPersistedKey, 'old-legacy-local-key');
    sessionStorage.setItem(PUBLIC_AI_CONFIG_SESSION_STORAGE_KEY, oldSessionConfig);
    sessionStorage.setItem(legacySessionKey, 'old-legacy-session-key');
    storage[item.failingStore].failNext(item.operation, item.key);

    assert.throws(
      () => writePublicAiConfig(configured({ apiKey: 'new-key', persistApiKey: false }), storage),
      (error: unknown) => error instanceof PublicAiError && error.code === 'storage_error',
    );
    assert.equal(sessionStorage.getItem(PUBLIC_AI_CONFIG_SESSION_STORAGE_KEY), oldSessionConfig);
    assert.equal(localStorage.getItem(PUBLIC_AI_CONFIG_STORAGE_KEY), oldLocalConfig);
    assert.equal(localStorage.getItem(legacyConfigKey), '{"baseUrl":"https://legacy.example.com/v1"}');
    assert.equal(localStorage.getItem(legacyPersistedKey), 'old-legacy-local-key');
    assert.equal(sessionStorage.getItem(legacySessionKey), 'old-legacy-session-key');
  }
});

test('shared settings save controller distinguishes required, URL and storage failures', () => {
  let caught: unknown;
  try {
    savePublicAiSettings(configured({ models: { generate: '', modify: 'm', summarize: 's' } }), createStorage());
  } catch (error) {
    caught = error;
  }
  assert.equal(getPublicAiSettingsSaveErrorKind(caught), 'required');

  try {
    savePublicAiSettings(configured({ baseUrl: 'http://models.example.com/v1' }), createStorage());
  } catch (error) {
    caught = error;
  }
  assert.equal(getPublicAiSettingsSaveErrorKind(caught), 'invalid_base_url');

  const blocked = new MemoryStorage();
  blocked.setItem = () => { throw new Error('blocked'); };
  try {
    savePublicAiSettings(configured(), { localStorage: blocked, sessionStorage: new MemoryStorage() });
  } catch (error) {
    caught = error;
  }
  assert.equal(getPublicAiSettingsSaveErrorKind(caught), 'storage_error');
});

test('base URL validation allows HTTPS and localhost HTTP only', () => {
  assert.equal(validatePublicAiBaseUrl('https://models.example.com/v1/').origin, 'https://models.example.com');
  assert.equal(validatePublicAiBaseUrl('http://localhost:11434/v1').origin, 'http://localhost:11434');
  assert.equal(
    resolvePublicAiChatCompletionsUrl('https://models.example.com/v1/'),
    'https://models.example.com/v1/chat/completions',
  );
  assert.equal(
    resolvePublicAiChatCompletionsUrl('https://models.example.com/v1/chat/completions'),
    'https://models.example.com/v1/chat/completions',
  );
  assert.throws(() => validatePublicAiBaseUrl('http://models.example.com/v1'), (error: unknown) => (
    error instanceof PublicAiError && error.code === 'invalid_base_url'
  ));
  assert.throws(() => validatePublicAiBaseUrl('https://token@models.example.com/v1'), PublicAiError);
  assert.throws(() => validatePublicAiBaseUrl('https://models.example.com/v1?key=secret'), PublicAiError);
});

test('adapter routes generate, modify, summarize and fix to the correct models', async () => {
  const seen: Array<{ body: Record<string, unknown>; headers: Headers; url: string }> = [];
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async (input, init) => {
      seen.push({
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        headers: new Headers(init?.headers),
        url: String(input),
      });
      return jsonResponse({ choices: [{ message: { content: 'result' }, finish_reason: 'stop' }] });
    },
  });

  for (const action of ['generate', 'modify', 'summarize', 'fix'] as const) {
    const result = await adapter.request({
      action,
      instruction: 'do this',
      selectedText: 'selection',
      source: 'private full source',
    });
    assert.deepEqual(result, { text: 'result', finishReason: 'stop' });
  }
  assert.deepEqual(seen.map(entry => entry.body.model), [
    'generate-model',
    'modify-model',
    'summarize-model',
    'modify-model',
  ]);
  assert.ok(seen.every(entry => entry.url === 'https://models.example.com/v1/chat/completions'));
  assert.ok(seen.every(entry => entry.headers.get('authorization') === 'Bearer secret-key'));
  assert.ok(seen.every(entry => entry.body.stream === false));
  const summarizeMessages = seen[2].body.messages as Array<{ content: string }>;
  assert.doesNotMatch(summarizeMessages[1].content, /private full source/u);
});

test('finish_reason length is returned to the caller without silently discarding text', async () => {
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async () => jsonResponse({
      choices: [{ message: { content: 'partial output' }, finish_reason: 'length' }],
    }),
  });
  assert.deepEqual(await adapter.request({ action: 'generate' }), {
    text: 'partial output',
    finishReason: 'length',
  });
});

test('adapter omits local image data and rejects oversized prompts before fetch', async () => {
  const seen: string[] = [];
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      seen.push(String(init?.body));
      return jsonResponse({ choices: [{ message: { content: 'result' } }] });
    },
  });
  await adapter.request({
    action: 'modify',
    selectedText: 'selection',
    source: `before data:image/png;base64,${'A'.repeat(2_000)} after`,
  });
  assert.equal(seen.length, 1);
  assert.doesNotMatch(seen[0], /data:image|AAAAAA/u);
  assert.match(seen[0], /local image data omitted/u);

  await assert.rejects(adapter.request({
    action: 'generate',
    source: 'x'.repeat(PUBLIC_AI_MAX_USER_PROMPT_CHARS + 1),
  }), (error: unknown) => error instanceof PublicAiError && error.code === 'input_too_large');
  assert.equal(seen.length, 1, 'oversized prompts must fail before fetch');
});

test('shared redactor removes folded data URLs from the actual fetch body', async () => {
  const foldedTail = 'Rk9MREVEX1BBWUxPQURfVEFJTA==';
  const foldedImage = `data:image/png;base64,QUJDREVGR0hJ\r\n\t${foldedTail}`;
  assert.deepEqual(collectPublicAiLocalImageDataUrlSpans(`x ${foldedImage}) y`), [{
    start: 2,
    end: 2 + foldedImage.length,
  }]);
  assert.equal(omitPublicAiLocalImageDataUrls(`x ${foldedImage}) y`), 'x [local image data omitted]) y');

  let requestBody = '';
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      requestBody = String(init?.body);
      return jsonResponse({ choices: [{ message: { content: 'result' } }] });
    },
  });
  await adapter.request({
    action: 'modify',
    selectedText: `selection ${foldedImage})`,
    source: `before ${foldedImage}) after`,
  });

  assert.doesNotMatch(requestBody, /data:image|QUJDREVGR0hJ|Rk9MREVEX1BBWUxPQURfVEFJTA/u);
  assert.match(requestBody, /local image data omitted/u);
});

test('missing config opens settings and reports a typed error', async () => {
  let openCount = 0;
  const adapter = createPublicAiAdapter({
    readConfig: () => configured({ apiKey: '' }),
    onMissingConfig: () => { openCount += 1; },
    fetch: async () => assert.fail('fetch must not run'),
  });
  await assert.rejects(adapter.request({ action: 'generate' }), (error: unknown) => (
    error instanceof PublicAiError && error.code === 'missing_config'
  ));
  assert.equal(openCount, 1);
});

test('HTTP, invalid JSON, empty and network failures use stable non-sensitive error codes', async () => {
  const cases: Array<{ code: string; fetch: typeof fetch }> = [
    { code: 'unauthorized', fetch: async () => jsonResponse({ error: { message: 'echo secret-key' } }, 401) },
    { code: 'model_not_found', fetch: async () => jsonResponse({}, 404) },
    { code: 'model_not_found', fetch: async () => jsonResponse({ error: { code: 'invalid_model' } }, 400) },
    { code: 'rate_limited', fetch: async () => jsonResponse({}, 429) },
    { code: 'server_error', fetch: async () => jsonResponse({}, 503) },
    { code: 'invalid_response', fetch: async () => new Response('not-json', { status: 200 }) },
    { code: 'empty_response', fetch: async () => jsonResponse({ choices: [{ message: { content: ' ' } }] }) },
    { code: 'network_error', fetch: async () => { throw new TypeError('CORS failed with secret-key'); } },
  ];
  for (const item of cases) {
    const adapter = createPublicAiAdapter({ readConfig: () => configured(), fetch: item.fetch });
    await assert.rejects(adapter.request({ action: 'generate', source: 'private full source' }), (error: unknown) => {
      assert.ok(error instanceof PublicAiError);
      assert.equal(error.code, item.code);
      assert.doesNotMatch(error.message, /secret-key|private full source/u);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('adapter distinguishes timeout from caller cancellation', async () => {
  const pendingFetch: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  const timeoutAdapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: pendingFetch,
    timeoutMs: 5,
  });
  await assert.rejects(timeoutAdapter.request({ action: 'generate' }), (error: unknown) => (
    error instanceof PublicAiError && error.code === 'timeout'
  ));

  const controller = new AbortController();
  const cancelAdapter = createPublicAiAdapter({ readConfig: () => configured(), fetch: pendingFetch });
  const promise = cancelAdapter.request({ action: 'generate', signal: controller.signal });
  controller.abort();
  await assert.rejects(promise, (error: unknown) => (
    error instanceof PublicAiError && error.code === 'aborted'
  ));

  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  await assert.rejects(cancelAdapter.request({ action: 'generate', signal: alreadyAborted.signal }), (error: unknown) => (
    error instanceof PublicAiError && error.code === 'aborted'
  ));
});
