import React, { useEffect, useMemo, useState } from 'react';
import { normalizeOssAiModels, validateOssAiBaseUrl } from './ossAiSettings';
import { OssDialog } from './OssDialog';

const PUBLIC_CONFIG_KEY = 'morndraft.oss.ai.config';
const PERSISTED_KEY_KEY = 'morndraft.oss.ai.key';
const SESSION_KEY_KEY = 'morndraft.oss.ai.session-key';

export type OssAiSettings = {
  baseUrl: string;
  apiKey: string;
  models: string[];
  rememberKey: boolean;
};

type Props = {
  initialSettings: OssAiSettings | null;
  isOpen: boolean;
  locale: 'zh' | 'en';
  onClose: () => void;
  onSave: (settings: OssAiSettings) => void;
};

const readStoredSettings = (): OssAiSettings => {
  if (typeof window === 'undefined') return { baseUrl: '', apiKey: '', models: [], rememberKey: false };
  let baseUrl = '';
  let models: string[] = [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(PUBLIC_CONFIG_KEY) ?? '{}') as { baseUrl?: unknown; models?: unknown };
    baseUrl = typeof stored.baseUrl === 'string' ? stored.baseUrl : '';
    models = Array.isArray(stored.models) ? stored.models.filter((model): model is string => typeof model === 'string') : [];
  } catch {
    // Ignore malformed local configuration and start from a safe empty state.
  }
  const persistedKey = window.localStorage.getItem(PERSISTED_KEY_KEY) ?? '';
  const apiKey = persistedKey || window.sessionStorage.getItem(SESSION_KEY_KEY) || '';
  return { baseUrl, models, apiKey, rememberKey: Boolean(persistedKey) };
};

export const OssAiSettingsDialog: React.FC<Props> = ({ initialSettings, isOpen, locale, onClose, onSave }) => {
  const stored = useMemo(readStoredSettings, []);
  const [baseUrl, setBaseUrl] = useState(stored.baseUrl);
  const [apiKey, setApiKey] = useState(stored.apiKey);
  const [models, setModels] = useState(stored.models.join(', '));
  const [rememberKey, setRememberKey] = useState(stored.rememberKey);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !initialSettings) return;
    setBaseUrl(initialSettings.baseUrl);
    setApiKey(initialSettings.apiKey);
    setModels(initialSettings.models.join(', '));
    setRememberKey(initialSettings.rememberKey);
  }, [initialSettings, isOpen]);

  const origin = useMemo(() => {
    try { return validateOssAiBaseUrl(baseUrl).origin; } catch { return ''; }
  }, [baseUrl]);

  if (!isOpen) return null;

  const labels = locale === 'zh' ? {
    title: 'OpenAI-compatible 配置', base: 'Base URL', key: 'API Key', models: 'Models（逗号分隔）', preset: '填入 DeepSeek preset',
    remember: '在此设备持久化 API Key', session: '默认只在本次页面会话的内存中保留 Key。',
    origin: '浏览器将直接向此来源发送请求：', cancel: '取消', save: '保存',
    required: '请输入有效 Base URL 和至少一个 model。', https: 'Base URL 仅允许 HTTPS；localhost 可使用 HTTP。',
  } : {
    title: 'OpenAI-compatible settings', base: 'Base URL', key: 'API Key', models: 'Models (comma-separated)', preset: 'Use DeepSeek preset',
    remember: 'Persist API Key on this device', session: 'By default, the Key stays in memory for this page session only.',
    origin: 'The browser will send requests directly to:', cancel: 'Cancel', save: 'Save',
    required: 'Enter a valid Base URL and at least one model.', https: 'Base URL must use HTTPS; HTTP is allowed for localhost.',
  };

  const save = () => {
    let validated;
    try {
      validated = validateOssAiBaseUrl(baseUrl);
    } catch {
      setError(labels.https);
      return;
    }
    const normalizedModels = normalizeOssAiModels(models);
    if (!normalizedModels.length) {
      setError(labels.required);
      return;
    }
    const settings = { baseUrl: validated.baseUrl, apiKey, models: normalizedModels, rememberKey };
    window.localStorage.setItem(PUBLIC_CONFIG_KEY, JSON.stringify({ baseUrl: settings.baseUrl, models: settings.models }));
    if (apiKey) window.sessionStorage.setItem(SESSION_KEY_KEY, apiKey);
    else window.sessionStorage.removeItem(SESSION_KEY_KEY);
    if (rememberKey) window.localStorage.setItem(PERSISTED_KEY_KEY, apiKey);
    else window.localStorage.removeItem(PERSISTED_KEY_KEY);
    setError('');
    onSave(settings);
    onClose();
  };

  return (
    <OssDialog className="oss-ai-dialog" isOpen={isOpen} labelledBy="oss-ai-title" onClose={onClose}>
        <h2 id="oss-ai-title">{labels.title}</h2>
        <button data-oss-dialog-initial-focus type="button" onClick={() => { setBaseUrl('https://api.deepseek.com/v1'); setModels('deepseek-chat, deepseek-reasoner'); setError(''); }}>
          {labels.preset}
        </button>
        <label>{labels.base}<input type="url" value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setError(''); }} placeholder="https://example.com/v1" /></label>
        <label>{labels.key}<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" /></label>
        <label>{labels.models}<input type="text" value={models} onChange={(event) => { setModels(event.target.value); setError(''); }} placeholder="model-a, model-b" /></label>
        <label className="oss-checkbox"><input type="checkbox" checked={rememberKey} onChange={(event) => setRememberKey(event.target.checked)} />{labels.remember}</label>
        <p className="oss-setting-note">{labels.session}</p>
        <p className="oss-origin" aria-live="polite">{origin ? <>{labels.origin} <strong>{origin}</strong></> : labels.https}</p>
        {error && <p className="oss-inline-error" role="alert">{error}</p>}
        <div className="oss-dialog-actions"><button type="button" onClick={onClose}>{labels.cancel}</button><button type="button" onClick={save}>{labels.save}</button></div>
    </OssDialog>
  );
};
