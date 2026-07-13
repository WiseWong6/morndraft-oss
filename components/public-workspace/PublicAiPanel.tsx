import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyPublicAiGenerateResult,
  applyPublicAiModifyResult,
  PublicAiStaleSourceError,
  type PublicAiGenerateSnapshot,
} from './publicAiState';
import { buildPublicAiBoundedRequest } from './publicAiContext';
import type {
  PublicAiAdapter,
  PublicTextSelection,
  PublicWorkspaceLocale,
  SourceChangeMeta,
} from './types';
import { PublicDialog } from './PublicDialog';

export type PublicAiGenerateIntent = {
  id: number;
  range: { start: number; end: number };
};

type PublicAiPanelProps = {
  adapter: PublicAiAdapter;
  source: string;
  documentEpoch: number;
  locale: PublicWorkspaceLocale;
  selection: PublicTextSelection | null;
  generateIntent: PublicAiGenerateIntent | null;
  onGenerateIntentConsumed(): void;
  onSourceChange(next: string, meta: SourceChangeMeta): void;
};

type RequestSnapshot =
  | { action: 'generate'; generate: PublicAiGenerateSnapshot }
  | { action: 'modify'; selection: PublicTextSelection }
  | { action: 'summarize'; selection: PublicTextSelection };

type AiResult = {
  text: string;
  finishReason?: string;
  snapshot: RequestSnapshot;
};

const REQUEST_TIMEOUT_MS = 90_000;

const getLabels = (locale: PublicWorkspaceLocale) => locale === 'zh' ? {
  modify: '修改', summarize: '总结', generate: 'AI 生成', cancel: '取消', run: '发送',
  instruction: '你希望 AI 怎么处理？', result: 'AI 结果预览', apply: '采用', copy: '复制', copied: '已复制',
  copyFailed: '复制失败，请手动选择并复制结果。',
  close: '关闭', busy: '处理中…', stale: 'Source 已变化，结果未采用。请重新选择后再试。',
  timeout: '请求超过 90 秒，已取消。', cancelled: '请求已取消。', failed: 'AI 请求失败，请检查配置、模型、网络或 CORS。',
  missing: '请先在“更多 → AI 配置”中填写 Base URL、Key 和对应模型。', unauthorized: 'AI Key 无效或没有权限（401/403）。',
  notFound: 'AI 地址或模型不存在（404）。', rateLimited: 'AI 请求过于频繁（429），请稍后再试。',
  server: 'AI 服务暂时不可用（5xx）。', network: '浏览器无法连接 AI 服务，请检查网络、Base URL 和 CORS。',
  invalid: 'AI 返回了无效 JSON 或空内容。',
  tooLarge: '内容过长。请缩小选区或精简指令后重试。',
  truncated: '模型返回的内容可能不完整，请检查后再采用。',
  privacy: '仅发送选区、指令和附近的有限上下文；本地图片数据不会发送。总结只发送当前选区。',
} : {
  modify: 'Modify', summarize: 'Summarize', generate: 'AI generate', cancel: 'Cancel', run: 'Send',
  instruction: 'What should AI do?', result: 'AI result preview', apply: 'Apply', copy: 'Copy', copied: 'Copied',
  copyFailed: 'Copy failed. Select and copy the result manually.',
  close: 'Close', busy: 'Working…', stale: 'Source changed, so the result was not applied. Select the text and try again.',
  timeout: 'The request exceeded 90 seconds and was cancelled.', cancelled: 'The request was cancelled.', failed: 'AI request failed. Check settings, model, network, or CORS.',
  missing: 'Configure the Base URL, Key, and role models under More → AI settings.', unauthorized: 'The AI Key is invalid or unauthorized (401/403).',
  notFound: 'The AI endpoint or model was not found (404).', rateLimited: 'The AI provider rate-limited this request (429). Try again later.',
  server: 'The AI provider is temporarily unavailable (5xx).', network: 'The browser could not reach the AI provider. Check the network, Base URL, and CORS.',
  invalid: 'The AI provider returned invalid JSON or an empty response.',
  tooLarge: 'The input is too long. Select less content or shorten the instruction.',
  truncated: 'The model response may be incomplete. Review it before applying.',
  privacy: 'Only the selection, instruction, and limited nearby context are sent. Local image data is omitted. Summaries send only the selection.',
};

type PublicAiLabels = ReturnType<typeof getLabels>;

export const getPublicAiRequestErrorMessage = (error: unknown, labels: PublicAiLabels) => {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  switch (code) {
    case 'missing_config': return labels.missing;
    case 'unauthorized': return labels.unauthorized;
    case 'model_not_found': return labels.notFound;
    case 'rate_limited': return labels.rateLimited;
    case 'server_error': return labels.server;
    case 'network_error': return labels.network;
    case 'timeout': return labels.timeout;
    case 'aborted': return labels.cancelled;
    case 'invalid_response':
    case 'empty_response': return labels.invalid;
    case 'input_too_large': return labels.tooLarge;
    default: return labels.failed;
  }
};

class PublicAiPanelResponseError extends Error {
  readonly code = 'empty_response';

  constructor() {
    super('The AI provider returned an empty response.');
    this.name = 'PublicAiPanelResponseError';
  }
}

export const ensurePublicAiResponseText = (text: string): string => {
  if (!text.trim()) throw new PublicAiPanelResponseError();
  return text;
};

export type PublicAiCopyDependencies = {
  fallbackCopy(value: string): boolean;
  writeClipboardText?: (value: string) => Promise<void>;
};

const fallbackCopyWithExecCommand = (value: string): boolean => {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
};

const getBrowserCopyDependencies = (): PublicAiCopyDependencies => ({
  fallbackCopy: fallbackCopyWithExecCommand,
  writeClipboardText: navigator.clipboard?.writeText
    ? navigator.clipboard.writeText.bind(navigator.clipboard)
    : undefined,
});

export const copyPublicAiResultText = async (
  value: string,
  dependencies: PublicAiCopyDependencies = getBrowserCopyDependencies(),
): Promise<void> => {
  if (dependencies.writeClipboardText) {
    try {
      await dependencies.writeClipboardText(value);
      return;
    } catch {
      // Clipboard permission and browser policy can reject at call time. The
      // legacy selection path is still worth trying before reporting failure.
    }
  }
  if (!dependencies.fallbackCopy(value)) throw new Error('copy_failed');
};

export const PublicAiPanel: React.FC<PublicAiPanelProps> = ({
  adapter,
  source,
  documentEpoch,
  locale,
  selection,
  generateIntent,
  onGenerateIntentConsumed,
  onSourceChange,
}) => {
  const labels = useMemo(() => getLabels(locale), [locale]);
  const controllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const requestSequenceRef = useRef(0);
  const [form, setForm] = useState<RequestSnapshot | null>(null);
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState<AiResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, setCopied] = useState(false);

  const abortActiveRequest = useCallback(() => {
    requestSequenceRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const reset = useCallback(() => {
    abortActiveRequest();
    setForm(null);
    setInstruction('');
    setResult(null);
    setError('');
    setCopyError('');
    setCopied(false);
    setIsBusy(false);
  }, [abortActiveRequest]);

  const cancelRequest = useCallback(() => {
    abortActiveRequest();
    setIsBusy(false);
    setError(labels.cancelled);
  }, [abortActiveRequest, labels.cancelled]);

  useEffect(() => reset, [reset]);
  useEffect(() => { reset(); }, [documentEpoch, reset]);

  useEffect(() => {
    if (!generateIntent) return;
    reset();
    setForm({
      action: 'generate',
      generate: { source, range: generateIntent.range },
    });
    onGenerateIntentConsumed();
  }, [generateIntent, onGenerateIntentConsumed, reset, source]);

  const runRequest = useCallback(async (snapshot: RequestSnapshot, requestInstruction = '') => {
    abortActiveRequest();
    const requestSequence = requestSequenceRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsBusy(true);
    setError('');
    setCopyError('');
    setCopied(false);
    setResult(null);
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    timeoutRef.current = timeoutId;
    try {
      const boundedRequest = snapshot.action === 'summarize'
        ? buildPublicAiBoundedRequest({
          action: 'summarize',
          selectedText: snapshot.selection.text,
        })
        : snapshot.action === 'modify'
          ? buildPublicAiBoundedRequest({
            action: 'modify',
            instruction: requestInstruction,
            selectedText: snapshot.selection.text,
            source: snapshot.selection.source,
            range: { start: snapshot.selection.start, end: snapshot.selection.end },
          })
          : buildPublicAiBoundedRequest({
            action: 'generate',
            instruction: requestInstruction,
            source: snapshot.generate.source,
            range: snapshot.generate.range,
          });
      const response = await adapter.request({ ...boundedRequest, signal: controller.signal });
      ensurePublicAiResponseText(response.text);
      if (requestSequence === requestSequenceRef.current) {
        setResult({ text: response.text, finishReason: response.finishReason, snapshot });
        setForm(null);
      }
    } catch (requestError) {
      if (requestSequence === requestSequenceRef.current) {
        const errorCode = requestError && typeof requestError === 'object' && 'code' in requestError
          ? String((requestError as { code?: unknown }).code ?? '')
          : '';
        if (errorCode === 'missing_config') {
          setForm(null);
          setResult(null);
          setError('');
        } else if (controller.signal.aborted) setError(didTimeout ? labels.timeout : labels.cancelled);
        else setError(getPublicAiRequestErrorMessage(requestError, labels));
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (requestSequence === requestSequenceRef.current) {
        timeoutRef.current = null;
        if (controllerRef.current === controller) controllerRef.current = null;
        setIsBusy(false);
      }
    }
  }, [adapter, abortActiveRequest, labels]);

  const applyResult = () => {
    if (!result || result.snapshot.action === 'summarize') return;
    try {
      const next = result.snapshot.action === 'modify'
        ? applyPublicAiModifyResult(source, result.snapshot.selection, result.text)
        : applyPublicAiGenerateResult(source, result.snapshot.generate, result.text);
      onSourceChange(next, { origin: 'ai' });
      reset();
    } catch (applyError) {
      setError(applyError instanceof PublicAiStaleSourceError ? labels.stale : labels.failed);
    }
  };

  return (
    <>
      {selection && !form && !result && !isBusy && (
        <div className="md-public-ai-selection" role="toolbar" aria-label={locale === 'zh' ? 'AI 选区操作' : 'AI selection actions'}>
          <button type="button" data-testid="oss-ai-modify" onClick={() => {
            setError('');
            setInstruction('');
            setForm({ action: 'modify', selection });
          }}>{labels.modify}</button>
          <button type="button" data-testid="oss-ai-summarize" onClick={() => void runRequest({ action: 'summarize', selection })}>{labels.summarize}</button>
        </div>
      )}

      <PublicDialog
        className="md-public-ai-dialog"
        isOpen={Boolean(form || result || isBusy || error)}
        labelledBy="md-public-ai-title"
        onClose={reset}
      >
            <h2 id="md-public-ai-title">{result ? labels.result : form?.action === 'generate' ? labels.generate : form?.action === 'modify' ? labels.modify : labels.summarize}</h2>
            {form && form.action !== 'summarize' && (
              <label className="md-public-ai-instruction">
                <span>{labels.instruction}</span>
                <textarea data-testid="oss-ai-instruction" data-public-dialog-initial-focus autoFocus value={instruction} onChange={(event) => setInstruction(event.currentTarget.value)} />
              </label>
            )}
            {(form || isBusy || result) && <p className="md-public-ai-privacy">{labels.privacy}</p>}
            {isBusy && <p role="status">{labels.busy}</p>}
            {error && <p className="md-public-inline-error" role="alert">{error}</p>}
            {copyError && <p className="md-public-inline-error" data-testid="oss-ai-copy-error" role="alert">{copyError}</p>}
            {result && (
              <>
                {result.finishReason === 'length' && <p className="md-public-ai-warning">{labels.truncated}</p>}
                <pre className="md-public-ai-result" data-testid="oss-ai-result"><code>{result.text}</code></pre>
              </>
            )}
            <div className="md-public-dialog-actions">
              {form && !isBusy && <button type="button" onClick={() => void runRequest(form, instruction)}>{labels.run}</button>}
              {isBusy && <button type="button" onClick={cancelRequest}>{labels.cancel}</button>}
              {result?.snapshot.action !== 'summarize' && result && <button type="button" data-testid="oss-ai-adopt" onClick={applyResult}>{labels.apply}</button>}
              {result && <button type="button" onClick={() => void copyPublicAiResultText(result.text).then(() => {
                setCopied(true);
                setCopyError('');
              }).catch(() => {
                setCopied(false);
                setCopyError(labels.copyFailed);
              })}>{copied ? labels.copied : labels.copy}</button>}
              {!isBusy && <button type="button" onClick={reset}>{labels.close}</button>}
            </div>
      </PublicDialog>
    </>
  );
};
