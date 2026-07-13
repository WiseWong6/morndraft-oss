export type PublicAiModelRole = 'generate' | 'modify' | 'summarize';

export type PublicAiAction = PublicAiModelRole | 'fix';

export type PublicAiConfig = {
  apiKey: string;
  baseUrl: string;
  models: Record<PublicAiModelRole, string>;
  persistApiKey: boolean;
};

export type PublicAiRequest = {
  action: PublicAiAction;
  diagnostic?: string;
  instruction?: string;
  signal?: AbortSignal;
  source?: string;
  selectedText?: string;
  visibleText?: string;
};

export type PublicAiResult = {
  finishReason?: string;
  text: string;
};

export interface PublicAiAdapter {
  request(input: PublicAiRequest): Promise<PublicAiResult>;
}

export type PublicAiErrorCode =
  | 'aborted'
  | 'empty_response'
  | 'http_error'
  | 'invalid_base_url'
  | 'invalid_response'
  | 'missing_config'
  | 'model_not_found'
  | 'network_error'
  | 'rate_limited'
  | 'server_error'
  | 'storage_error'
  | 'timeout'
  | 'unauthorized';

export class PublicAiError extends Error {
  readonly code: PublicAiErrorCode;
  readonly status?: number;

  constructor(code: PublicAiErrorCode, message: string, options: { cause?: unknown; status?: number } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PublicAiError';
    this.code = code;
    this.status = options.status;
  }
}
