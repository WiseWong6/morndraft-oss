import React, { useEffect, useMemo, useState } from 'react';
import {
  PUBLIC_AI_DEEPSEEK_PRESET,
  getPublicAiRequestOrigin,
  getPublicAiSettingsSaveErrorKind,
  normalizePublicAiConfig,
  savePublicAiSettings,
} from './config';
import type { PublicAiConfig, PublicAiModelRole } from './types';

export type PublicAiSettingsFormProps = {
  initialConfig: PublicAiConfig;
  locale?: 'en' | 'zh';
  onCancel?: () => void;
  onSave?: (config: PublicAiConfig) => void;
};

const MODEL_ROLES: readonly PublicAiModelRole[] = ['generate', 'modify', 'summarize'];

export const PublicAiSettingsForm: React.FC<PublicAiSettingsFormProps> = ({
  initialConfig,
  locale = 'zh',
  onCancel,
  onSave,
}) => {
  const [config, setConfig] = useState(() => normalizePublicAiConfig(initialConfig));
  const [error, setError] = useState('');

  useEffect(() => {
    setConfig(normalizePublicAiConfig(initialConfig));
    setError('');
  }, [initialConfig]);

  const labels = locale === 'zh' ? {
    baseUrl: 'Base URL',
    cancel: '取消',
    generate: '生成模型',
    invalidBaseUrl: 'Base URL 仅允许 HTTPS；localhost 可使用 HTTP。',
    key: 'API Key',
    modify: '修改模型',
    origin: '浏览器将直接向此来源发送请求：',
    persist: '在此设备持久保存 API Key',
    preset: '使用 DeepSeek preset',
    required: '请填写 Base URL、API Key 和三个模型。',
    save: '保存',
    session: '默认仅在当前浏览器会话保存 Key。',
    storage: '浏览器拒绝保存设置。请允许本页面使用本地存储后重试；Key 未被上传。',
    summarize: '总结模型',
  } : {
    baseUrl: 'Base URL',
    cancel: 'Cancel',
    generate: 'Generate model',
    invalidBaseUrl: 'Base URL must use HTTPS; localhost may use HTTP.',
    key: 'API Key',
    modify: 'Modify model',
    origin: 'The browser will send requests directly to:',
    persist: 'Persist API Key on this device',
    preset: 'Use DeepSeek preset',
    required: 'Enter a Base URL, API Key, and all three models.',
    save: 'Save',
    session: 'By default, the Key is kept only for this browser session.',
    storage: 'The browser blocked settings storage. Allow site storage and try again; the Key was not uploaded.',
    summarize: 'Summarize model',
  };
  const origin = useMemo(() => getPublicAiRequestOrigin(config.baseUrl), [config.baseUrl]);

  const updateModel = (role: PublicAiModelRole, value: string) => {
    setConfig(current => ({ ...current, models: { ...current.models, [role]: value } }));
    setError('');
  };

  const save = () => {
    try {
      const saved = savePublicAiSettings(config);
      setError('');
      onSave?.(saved);
    } catch (saveError) {
      const errorKind = getPublicAiSettingsSaveErrorKind(saveError);
      setError(errorKind === 'storage_error'
        ? labels.storage
        : errorKind === 'required'
          ? labels.required
          : labels.invalidBaseUrl);
    }
  };

  return (
    <form className="public-ai-settings" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <button
        data-public-ai-initial-focus
        type="button"
        onClick={() => {
          setConfig(current => ({
            ...current,
            baseUrl: PUBLIC_AI_DEEPSEEK_PRESET.baseUrl,
            models: { ...PUBLIC_AI_DEEPSEEK_PRESET.models },
          }));
          setError('');
        }}
      >
        {labels.preset}
      </button>
      <label>
        {labels.baseUrl}
        <input
          name="baseUrl"
          type="url"
          value={config.baseUrl}
          onChange={(event) => { setConfig(current => ({ ...current, baseUrl: event.target.value })); setError(''); }}
          placeholder="https://example.com/v1"
        />
      </label>
      <label>
        {labels.key}
        <input
          autoComplete="off"
          name="apiKey"
          type="password"
          value={config.apiKey}
          onChange={(event) => setConfig(current => ({ ...current, apiKey: event.target.value }))}
        />
      </label>
      {MODEL_ROLES.map(role => (
        <label key={role}>
          {labels[role]}
          <input
            name={`model-${role}`}
            type="text"
            value={config.models[role]}
            onChange={(event) => updateModel(role, event.target.value)}
          />
        </label>
      ))}
      <label>
        <input
          checked={config.persistApiKey}
          name="persistApiKey"
          type="checkbox"
          onChange={(event) => setConfig(current => ({ ...current, persistApiKey: event.target.checked }))}
        />
        {labels.persist}
      </label>
      <p>{labels.session}</p>
      <p aria-live="polite">{origin ? <>{labels.origin} <strong>{origin}</strong></> : labels.invalidBaseUrl}</p>
      {error && <p role="alert">{error}</p>}
      <div>
        {onCancel && <button type="button" onClick={onCancel}>{labels.cancel}</button>}
        <button type="submit">{labels.save}</button>
      </div>
    </form>
  );
};

export default PublicAiSettingsForm;
