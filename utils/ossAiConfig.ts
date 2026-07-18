import {
  DEFAULT_PUBLIC_AI_CONFIG,
  PUBLIC_AI_CONFIG_REQUEST_EVENT,
  PUBLIC_AI_CONFIG_SESSION_STORAGE_KEY,
  PUBLIC_AI_CONFIG_STORAGE_KEY,
  PUBLIC_AI_DEEPSEEK_PRESET,
  PUBLIC_AI_MODEL_PLACEHOLDERS,
  PublicAiError,
  clearPublicAiConfig,
  createPublicAiAdapter,
  getPublicAiRequestOrigin,
  isPublicAiConfigUsable,
  readPublicAiConfig,
  requestPublicAiConfigOpen,
  validatePublicAiBaseUrl,
  writePublicAiConfig,
  type PublicAiAction,
  type PublicAiConfig,
  type PublicAiModelRole,
  type PublicAiRequest,
} from '@morndraft/features-personal/ai';

/**
 * Backwards-compatible facade for the commercial workspace.
 *
 * The public implementation lives in @morndraft/features-personal/ai so the
 * commercial and OSS shells cannot drift into separate configuration stores or
 * request contracts again.
 */
export type OssAiModelRole = PublicAiModelRole;
export type OssAiConfig = PublicAiConfig;
export type OssAiRequestAction = PublicAiAction;

export const OSS_AI_CONFIG_STORAGE_KEY = PUBLIC_AI_CONFIG_STORAGE_KEY;
export const OSS_AI_CONFIG_SESSION_STORAGE_KEY = PUBLIC_AI_CONFIG_SESSION_STORAGE_KEY;
export const OSS_AI_CONFIG_REQUEST_EVENT = PUBLIC_AI_CONFIG_REQUEST_EVENT;
export const OSS_AI_MODEL_PLACEHOLDERS = PUBLIC_AI_MODEL_PLACEHOLDERS;
export const OSS_AI_DEEPSEEK_PRESET = PUBLIC_AI_DEEPSEEK_PRESET;
export const DEFAULT_OSS_AI_CONFIG = DEFAULT_PUBLIC_AI_CONFIG;

export class OssAiConfigError extends Error {
  code: 'missing_oss_ai_config';

  constructor(message = 'OSS AI is not configured.') {
    super(message);
    this.name = 'OssAiConfigError';
    this.code = 'missing_oss_ai_config';
  }
}

export const readOssAiConfig = readPublicAiConfig;
export const writeOssAiConfig = writePublicAiConfig;
export const clearOssAiConfig = clearPublicAiConfig;
export const requestOssAiConfigOpen = requestPublicAiConfigOpen;
export const isOssAiConfigUsable = isPublicAiConfigUsable;
export const validateOssAiBaseUrl = validatePublicAiBaseUrl;
export const getOssAiRequestOrigin = getPublicAiRequestOrigin;

export async function requestOssAiText(input: PublicAiRequest): Promise<string> {
  try {
    const result = await createPublicAiAdapter().request(input);
    return result.text;
  } catch (error) {
    if (error instanceof PublicAiError && error.code === 'missing_config') {
      throw new OssAiConfigError();
    }
    throw error;
  }
}
