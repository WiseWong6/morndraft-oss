export type PublicAiModelRole = 'generate' | 'modify' | 'summarize';

export type PublicAiAction = PublicAiModelRole | 'fix';

export type PublicAiSourceKind = 'html' | 'markdown' | 'text';

export type PublicAiSourceRange = {
  start: number;
  end: number;
};

export type PublicAiConfig = {
  apiKey: string;
  baseUrl: string;
  models: Record<PublicAiModelRole, string>;
  persistApiKey: boolean;
};

type PublicAiRequestBase = {
  diagnostic?: string;
  instruction?: string;
  signal?: AbortSignal;
};

type PublicAiSourceRequestBase = PublicAiRequestBase & {
  range: PublicAiSourceRange;
  source: string;
  sourceKind: PublicAiSourceKind;
  /** Accepted only for compatibility and ignored in favor of source + range. */
  selectedText?: string;
  visibleText?: never;
};

type PublicAiGenerateOrSummarizeRequest = PublicAiSourceRequestBase & {
  action: 'generate' | 'summarize';
  patchRange?: never;
};

type PublicAiModifyRequest = PublicAiSourceRequestBase & {
  action: 'modify';
  /** Mutation range; `range` remains the independent privacy selection. */
  patchRange: PublicAiSourceRange;
};

type PublicAiFixRequest = PublicAiRequestBase & {
  action: 'fix';
  range?: never;
  source: string;
  sourceKind: PublicAiSourceKind;
  selectedText?: never;
  visibleText?: never;
};

type PublicAiVisibleSummaryRequest = PublicAiRequestBase & {
  action: 'summarize';
  range?: never;
  source?: never;
  sourceKind?: never;
  selectedText?: never;
  visibleText: string;
};

export type PublicAiRequest =
  | PublicAiGenerateOrSummarizeRequest
  | PublicAiModifyRequest
  | PublicAiFixRequest
  | PublicAiVisibleSummaryRequest;

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
  | 'input_too_large'
  | 'invalid_base_url'
  | 'invalid_response'
  | 'missing_config'
  | 'model_not_found'
  | 'network_error'
  | 'privacy_unsafe_input'
  | 'privacy_unsafe_response'
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
