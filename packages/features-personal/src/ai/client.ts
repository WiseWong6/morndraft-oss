import {
  getPublicAiModelRole,
  isPublicAiConfigUsable,
  readPublicAiConfig,
  requestPublicAiConfigOpen,
  resolvePublicAiChatCompletionsUrl,
} from './config';
import {
  PublicAiError,
  type PublicAiAction,
  type PublicAiAdapter,
  type PublicAiConfig,
  type PublicAiRequest,
  type PublicAiResult,
} from './types';

type OpenAiCompatibleResponse = {
  choices?: Array<{
    finish_reason?: unknown;
    message?: { content?: unknown };
    text?: unknown;
  }>;
};

export const PUBLIC_AI_DEFAULT_TIMEOUT_MS = 90_000;
export const PUBLIC_AI_MAX_USER_PROMPT_CHARS = 64_000;

const PUBLIC_LOCAL_IMAGE_DATA_URL = /data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z0-9+/=]+/giu;
const omitLocalImageDataUrls = (value: string) => (
  value.replace(PUBLIC_LOCAL_IMAGE_DATA_URL, '[local image data omitted]')
);

export type PublicAiAdapterOptions = {
  fetch?: typeof fetch;
  onMissingConfig?: () => void;
  readConfig?: () => PublicAiConfig;
  timeoutMs?: number;
};

function buildSystemPrompt(action: PublicAiAction): string {
  if (action === 'summarize') {
    return 'You are MornDraft OSS AI. Summarize the selected content clearly and concisely. Return only the summary.';
  }
  if (action === 'modify') {
    return 'You are MornDraft OSS AI. Rewrite the selected content according to the user request. Return only the replacement text.';
  }
  if (action === 'fix') {
    return 'You are MornDraft OSS AI. Repair the provided MornDraft source according to the diagnostic. Return only the full corrected source.';
  }
  return 'You are MornDraft OSS AI. Generate useful MornDraft-compatible Markdown content. Return only the generated content.';
}

function buildUserPrompt(input: PublicAiRequest): string {
  const parts: string[] = [];
  if (input.instruction?.trim()) parts.push(`User request:\n${omitLocalImageDataUrls(input.instruction.trim())}`);
  if (input.diagnostic?.trim()) parts.push(`Diagnostic:\n${omitLocalImageDataUrls(input.diagnostic.trim())}`);
  if (input.selectedText?.trim()) parts.push(`Selected text:\n${omitLocalImageDataUrls(input.selectedText.trim())}`);
  else if (input.visibleText?.trim()) parts.push(`Visible text:\n${omitLocalImageDataUrls(input.visibleText.trim())}`);
  if (input.source?.trim() && input.action !== 'summarize') {
    const source = omitLocalImageDataUrls(input.source);
    parts.push(input.action === 'fix'
      ? `Full source to repair:\n${source}`
      : `Relevant source context:\n${source}`);
  }
  const prompt = parts.join('\n\n').trim();
  if (prompt.length > PUBLIC_AI_MAX_USER_PROMPT_CHARS) {
    throw new PublicAiError('input_too_large', 'AI input exceeds the browser-local request limit.');
  }
  return prompt;
}

function readResult(body: unknown): PublicAiResult {
  if (!body || typeof body !== 'object') {
    throw new PublicAiError('invalid_response', 'AI returned an invalid JSON response.');
  }
  const choices = (body as OpenAiCompatibleResponse).choices;
  if (!Array.isArray(choices)) {
    throw new PublicAiError('invalid_response', 'AI returned an invalid response shape.');
  }
  for (const choice of choices) {
    const messageText = typeof choice?.message?.content === 'string' ? choice.message.content.trim() : '';
    const legacyText = typeof choice?.text === 'string' ? choice.text.trim() : '';
    const text = messageText || legacyText;
    if (!text) continue;
    return {
      text,
      finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : undefined,
    };
  }
  throw new PublicAiError('empty_response', 'AI returned an empty response.');
}

const isModelConfigurationError = (body: unknown) => {
  if (!body || typeof body !== 'object') return false;
  const providerError = 'error' in body && body.error && typeof body.error === 'object'
    ? body.error as Record<string, unknown>
    : body as Record<string, unknown>;
  const safeSignals = ['code', 'type', 'param']
    .map(key => providerError[key])
    .filter((value): value is string => typeof value === 'string' && value.length <= 128)
    .join(' ')
    .toLowerCase();
  return /(?:model_not_found|invalid_model|model.*(?:not[_ -]?found|does[_ -]?not[_ -]?exist|invalid))/u.test(safeSignals);
};

function httpError(status: number, body?: unknown): PublicAiError {
  if (status === 401 || status === 403) {
    return new PublicAiError('unauthorized', 'AI rejected the API Key.', { status });
  }
  if (status === 404) {
    return new PublicAiError('model_not_found', 'AI endpoint or model was not found.', { status });
  }
  if ((status === 400 || status === 422) && isModelConfigurationError(body)) {
    return new PublicAiError('model_not_found', 'AI model is invalid or unavailable.', { status });
  }
  if (status === 429) {
    return new PublicAiError('rate_limited', 'AI request was rate limited.', { status });
  }
  if (status >= 500) {
    return new PublicAiError('server_error', 'AI provider is temporarily unavailable.', { status });
  }
  return new PublicAiError('http_error', `AI request failed with HTTP ${status}.`, { status });
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return PUBLIC_AI_DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return PUBLIC_AI_DEFAULT_TIMEOUT_MS;
  return Math.floor(timeoutMs);
}

function createRequestSignal(externalSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let didTimeout = false;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  const timeoutId = globalThis.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    cleanup: () => {
      globalThis.clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    },
  };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new PublicAiError('invalid_response', 'AI returned invalid JSON.');
  }
}

export function createPublicAiAdapter(options: PublicAiAdapterOptions = {}): PublicAiAdapter {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const readConfig = options.readConfig ?? readPublicAiConfig;
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const onMissingConfig = options.onMissingConfig ?? requestPublicAiConfigOpen;

  return {
    async request(input: PublicAiRequest): Promise<PublicAiResult> {
      if (input.signal?.aborted) {
        throw new PublicAiError('aborted', 'AI request was cancelled.');
      }
      const config = readConfig();
      const modelRole = getPublicAiModelRole(input.action);
      if (!isPublicAiConfigUsable(config, input.action)) {
        onMissingConfig();
        throw new PublicAiError('missing_config', 'AI is not configured for this action.');
      }
      const requestSignal = createRequestSignal(input.signal, timeoutMs);
      try {
        const response = await fetchImpl(resolvePublicAiChatCompletionsUrl(config.baseUrl), {
          method: 'POST',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${config.apiKey.trim()}`,
            'content-type': 'application/json',
          },
          signal: requestSignal.signal,
          body: JSON.stringify({
            messages: [
              { role: 'system', content: buildSystemPrompt(input.action) },
              { role: 'user', content: buildUserPrompt(input) },
            ],
            model: config.models[modelRole].trim(),
            stream: false,
            temperature: 0.2,
          }),
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          throw httpError(response.status, errorBody);
        }
        return readResult(await parseJsonResponse(response));
      } catch (error) {
        if (error instanceof PublicAiError) throw error;
        if (requestSignal.didTimeout()) {
          throw new PublicAiError('timeout', 'AI request timed out.');
        }
        if (input.signal?.aborted || requestSignal.signal.aborted) {
          throw new PublicAiError('aborted', 'AI request was cancelled.');
        }
        throw new PublicAiError('network_error', 'AI request could not reach the configured provider.');
      } finally {
        requestSignal.cleanup();
      }
    },
  };
}

export const publicAiAdapter: PublicAiAdapter = createPublicAiAdapter();
