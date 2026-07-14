import { PublicAiError, type PublicAiAction, type PublicAiConfig, type PublicAiModelRole } from './types';

export const PUBLIC_AI_CONFIG_STORAGE_KEY = 'morndraft.oss.aiConfig.v1';
export const PUBLIC_AI_CONFIG_SESSION_STORAGE_KEY = 'morndraft.oss.aiConfig.session.v1';
export const PUBLIC_AI_CONFIG_REQUEST_EVENT = 'morndraft:oss-ai-config-request';

const LEGACY_THIN_CONFIG_STORAGE_KEY = 'morndraft.oss.ai.config';
const LEGACY_THIN_PERSISTED_KEY_STORAGE_KEY = 'morndraft.oss.ai.key';
const LEGACY_THIN_SESSION_KEY_STORAGE_KEY = 'morndraft.oss.ai.session-key';

export const PUBLIC_AI_MODEL_PLACEHOLDERS: Record<PublicAiModelRole, string> = Object.freeze({
  generate: 'your-generate-model',
  modify: 'your-modify-model',
  summarize: 'your-summarize-model',
});

export const PUBLIC_AI_DEEPSEEK_PRESET: Pick<PublicAiConfig, 'baseUrl' | 'models'> = Object.freeze({
  baseUrl: 'https://api.deepseek.com/v1',
  models: Object.freeze({
    generate: 'deepseek-chat',
    modify: 'deepseek-chat',
    summarize: 'deepseek-chat',
  }),
});

export const DEFAULT_PUBLIC_AI_CONFIG: Readonly<PublicAiConfig> = Object.freeze({
  apiKey: '',
  baseUrl: '',
  models: Object.freeze({
    generate: '',
    modify: '',
    summarize: '',
  }),
  persistApiKey: false,
});

export type PublicAiConfigStorage = {
  localStorage: Storage | null;
  sessionStorage: Storage | null;
};

type LegacyThinConfig = {
  baseUrl?: unknown;
  models?: unknown;
};

export function getPublicAiModelRole(action: PublicAiAction): PublicAiModelRole {
  return action === 'fix' ? 'modify' : action;
}

export function normalizePublicAiConfig(value: Partial<PublicAiConfig> | null | undefined): PublicAiConfig {
  return {
    apiKey: typeof value?.apiKey === 'string' ? value.apiKey : '',
    baseUrl: typeof value?.baseUrl === 'string' ? value.baseUrl.trim() : '',
    models: {
      generate: typeof value?.models?.generate === 'string' ? value.models.generate.trim() : '',
      modify: typeof value?.models?.modify === 'string' ? value.models.modify.trim() : '',
      summarize: typeof value?.models?.summarize === 'string' ? value.models.summarize.trim() : '',
    },
    persistApiKey: value?.persistApiKey === true,
  };
}

export function cloneDefaultPublicAiConfig(): PublicAiConfig {
  return {
    ...DEFAULT_PUBLIC_AI_CONFIG,
    models: { ...DEFAULT_PUBLIC_AI_CONFIG.models },
  };
}

function getBrowserStorage(kind: keyof PublicAiConfigStorage): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window[kind];
  } catch {
    return null;
  }
}

export function getBrowserPublicAiConfigStorage(): PublicAiConfigStorage {
  return {
    localStorage: getBrowserStorage('localStorage'),
    sessionStorage: getBrowserStorage('sessionStorage'),
  };
}

function readJson(storage: Storage | null, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readString(storage: Storage | null, key: string): string {
  if (!storage) return '';
  try {
    return storage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

type StoredValueMutation = {
  key: string;
  storage: Storage | null;
  value: string | null;
};

type StoredValueSnapshot = StoredValueMutation & {
  previousValue: string | null;
};

/**
 * localStorage and sessionStorage do not provide a cross-store transaction.
 * Snapshot every touched key before the first write, then restore the complete
 * snapshot if any canonical write or legacy-key cleanup fails.
 */
function applyStoredValueTransaction(mutations: readonly StoredValueMutation[]): void {
  let snapshots: StoredValueSnapshot[];
  try {
    snapshots = mutations.map((mutation) => {
      if (!mutation.storage) throw new Error('storage_unavailable');
      return {
        ...mutation,
        previousValue: mutation.storage.getItem(mutation.key),
      };
    });
  } catch {
    throw new PublicAiError('storage_error', 'Browser storage is unavailable.');
  }

  try {
    for (const mutation of snapshots) {
      if (mutation.value === null) mutation.storage?.removeItem(mutation.key);
      else mutation.storage?.setItem(mutation.key, mutation.value);
    }
  } catch {
    let rollbackFailed = false;
    for (const snapshot of [...snapshots].reverse()) {
      try {
        if (snapshot.previousValue === null) snapshot.storage?.removeItem(snapshot.key);
        else snapshot.storage?.setItem(snapshot.key, snapshot.previousValue);
      } catch {
        rollbackFailed = true;
      }
    }
    throw new PublicAiError(
      'storage_error',
      rollbackFailed
        ? 'Browser storage could not save or fully restore the previous AI settings.'
        : 'Browser storage could not save the AI settings; the previous settings were restored.',
    );
  }
}

function readCanonicalConfig(storage: Storage | null, key: string): PublicAiConfig | null {
  const parsed = readJson(storage, key);
  if (!parsed || typeof parsed !== 'object') return null;
  return normalizePublicAiConfig(parsed as Partial<PublicAiConfig>);
}

function normalizeLegacyModels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((model): model is string => typeof model === 'string')
    .map(model => model.trim())
    .filter(Boolean))]
    .filter(model => model.length <= 128)
    .slice(0, 3);
}

function readLegacyThinConfig(storage: PublicAiConfigStorage): PublicAiConfig | null {
  const parsed = readJson(storage.localStorage, LEGACY_THIN_CONFIG_STORAGE_KEY) as LegacyThinConfig | null;
  if (!parsed || typeof parsed !== 'object') return null;
  const models = normalizeLegacyModels(parsed.models);
  const persistedKey = readString(storage.localStorage, LEGACY_THIN_PERSISTED_KEY_STORAGE_KEY);
  const sessionKey = readString(storage.sessionStorage, LEGACY_THIN_SESSION_KEY_STORAGE_KEY);
  return normalizePublicAiConfig({
    apiKey: persistedKey || sessionKey,
    baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
    models: {
      generate: models[0] ?? '',
      modify: models[1] ?? models[0] ?? '',
      summarize: models[2] ?? models[0] ?? '',
    },
    persistApiKey: Boolean(persistedKey),
  });
}

export function readPublicAiConfig(
  storage: PublicAiConfigStorage = getBrowserPublicAiConfigStorage(),
): PublicAiConfig {
  const sessionConfig = readCanonicalConfig(storage.sessionStorage, PUBLIC_AI_CONFIG_SESSION_STORAGE_KEY);
  if (sessionConfig) return sessionConfig;
  const localConfig = readCanonicalConfig(storage.localStorage, PUBLIC_AI_CONFIG_STORAGE_KEY);
  if (localConfig) return localConfig;
  return readLegacyThinConfig(storage) ?? cloneDefaultPublicAiConfig();
}

const getLegacyThinConfigRemovalMutations = (storage: PublicAiConfigStorage): StoredValueMutation[] => [
  { storage: storage.localStorage, key: LEGACY_THIN_CONFIG_STORAGE_KEY, value: null },
  { storage: storage.localStorage, key: LEGACY_THIN_PERSISTED_KEY_STORAGE_KEY, value: null },
  { storage: storage.sessionStorage, key: LEGACY_THIN_SESSION_KEY_STORAGE_KEY, value: null },
];

export function writePublicAiConfig(
  config: PublicAiConfig,
  storage: PublicAiConfigStorage = getBrowserPublicAiConfigStorage(),
): PublicAiConfig {
  const normalized = normalizePublicAiConfig(config);
  if (normalized.baseUrl) validatePublicAiBaseUrl(normalized.baseUrl);
  applyStoredValueTransaction([
    {
      storage: storage.sessionStorage,
      key: PUBLIC_AI_CONFIG_SESSION_STORAGE_KEY,
      value: JSON.stringify(normalized),
    },
    {
      storage: storage.localStorage,
      key: PUBLIC_AI_CONFIG_STORAGE_KEY,
      value: JSON.stringify({
        ...normalized,
        apiKey: normalized.persistApiKey ? normalized.apiKey : '',
      }),
    },
    ...getLegacyThinConfigRemovalMutations(storage),
  ]);
  return normalized;
}

export type PublicAiSettingsSaveErrorKind = 'invalid_base_url' | 'required' | 'storage_error';

export function savePublicAiSettings(
  config: PublicAiConfig,
  storage: PublicAiConfigStorage = getBrowserPublicAiConfigStorage(),
): PublicAiConfig {
  const normalized = normalizePublicAiConfig(config);
  if (
    !normalized.baseUrl
    || !normalized.apiKey.trim()
    || !normalized.models.generate
    || !normalized.models.modify
    || !normalized.models.summarize
  ) {
    throw new PublicAiError('missing_config', 'Base URL, API Key, and all three AI models are required.');
  }
  validatePublicAiBaseUrl(normalized.baseUrl);
  return writePublicAiConfig(normalized, storage);
}

export function getPublicAiSettingsSaveErrorKind(error: unknown): PublicAiSettingsSaveErrorKind {
  if (error instanceof PublicAiError && error.code === 'storage_error') return 'storage_error';
  if (error instanceof PublicAiError && error.code === 'missing_config') return 'required';
  return 'invalid_base_url';
}

export function clearPublicAiConfig(
  storage: PublicAiConfigStorage = getBrowserPublicAiConfigStorage(),
): void {
  applyStoredValueTransaction([
    { storage: storage.sessionStorage, key: PUBLIC_AI_CONFIG_SESSION_STORAGE_KEY, value: null },
    { storage: storage.localStorage, key: PUBLIC_AI_CONFIG_STORAGE_KEY, value: null },
    ...getLegacyThinConfigRemovalMutations(storage),
  ]);
}

export function requestPublicAiConfigOpen(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PUBLIC_AI_CONFIG_REQUEST_EVENT));
}

export function isPublicAiConfigUsable(
  config: PublicAiConfig,
  action: PublicAiAction = 'generate',
): boolean {
  const modelRole = getPublicAiModelRole(action);
  return Boolean(config.baseUrl.trim() && config.apiKey.trim() && config.models[modelRole].trim());
}

export function validatePublicAiBaseUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new PublicAiError('invalid_base_url', 'AI Base URL must be a valid absolute URL.');
  }
  const hostname = url.hostname.toLowerCase();
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  if (url.username || url.password) {
    throw new PublicAiError('invalid_base_url', 'AI Base URL must not contain credentials.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw new PublicAiError('invalid_base_url', 'AI Base URL must use HTTPS; HTTP is allowed only for localhost.');
  }
  if (url.search || url.hash) {
    throw new PublicAiError('invalid_base_url', 'AI Base URL must not include a query string or fragment.');
  }
  return url;
}

export function getPublicAiRequestOrigin(baseUrl: string): string | null {
  if (!baseUrl.trim()) return null;
  try {
    return validatePublicAiBaseUrl(baseUrl).origin;
  } catch {
    return null;
  }
}

export function resolvePublicAiChatCompletionsUrl(baseUrl: string): string {
  const trimmed = validatePublicAiBaseUrl(baseUrl).toString().replace(/\/+$/u, '');
  return /\/chat\/completions$/u.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
}
