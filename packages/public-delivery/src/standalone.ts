import { serializePublicThemeVariables } from './theme';
import { PublicDeliveryError, type PublicDeliveryInput } from './types';
import { extractPublicRawHtmlSource } from './rawHtml';
import {
  findPortableCssImportOccurrences,
  findPortableCssUrlOccurrences,
} from './portableCss';
import {
  absolutizePortableElementUrls,
  absolutizePortableHtml,
} from './portableHtml';
import { buildPortableDocument } from './portableDocument';
import {
  buildOpaqueSandboxIframe,
  escapePortableHtmlAttribute,
} from './sandboxViewer';

const PUBLIC_STANDALONE_MAX_LOCAL_ASSET_BYTES = 25 * 1024 * 1024;
const PUBLIC_STANDALONE_MAX_TOTAL_LOCAL_ASSET_BYTES = 50 * 1024 * 1024;
const PUBLIC_STANDALONE_MAX_LOCAL_ASSETS = 100;
export const PUBLIC_STANDALONE_ASSET_TIMEOUT_MS = 10_000;
export const PUBLIC_STANDALONE_OPERATION_TIMEOUT_MS = 30_000;

const PUBLIC_DOCUMENT_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'self' data: blob:",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data: blob: https: http:",
  "style-src 'unsafe-inline' data: https: http:",
  // User-authored scripts only execute inside an opaque sandbox iframe. The
  // top-level document contains no user-controlled markup or runtime script.
  "script-src 'unsafe-inline' 'unsafe-eval' blob: https: http:",
  "connect-src https: http:",
  "media-src 'self' data: blob: https: http:",
].join('; ');

const PUBLIC_RAW_HTML_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'self' data: blob:",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data: blob: https: http:",
  "style-src 'unsafe-inline' data: https: http:",
  // The top-level viewer has no runtime script. This allowance only lets the
  // sandboxed srcdoc preserve scripts explicitly authored by the document owner.
  "script-src 'unsafe-inline' 'unsafe-eval' blob: https: http:",
  "connect-src https: http:",
  "media-src 'self' data: blob: https: http:",
].join('; ');

const escapeCssUrl = (value: string) => value.replace(/["\\\n\r]/g, character => `\\${character}`);
const escapeStyleText = (value: string) => value.replace(/<\/style/giu, '<\\/style');

type PortableAssetBudget = {
  count: number;
  totalBytes: number;
};

type PortableStyleEntry =
  | { kind: 'inline'; cssText: string; media?: string }
  | { kind: 'external'; href: string; media?: string };

const failPortableAsset = (cause?: unknown): never => {
  throw new PublicDeliveryError(
    'download-unavailable',
    'MornDraft 本地样式资源无法完整写入 standalone HTML，未生成半成品。',
    cause === undefined ? undefined : { cause },
  );
};

const getStandaloneAbortReason = (signal?: AbortSignal) => signal?.reason instanceof Error
  ? signal.reason
  : new Error('文档已变化，已取消旧的交付任务。');

const throwIfStandaloneAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw getStandaloneAbortReason(signal);
  }
};

const withStandaloneTimeout = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
  createTimeoutError: () => Error,
) => {
  throwIfStandaloneAborted(callerSignal);
  const controller = new AbortController();
  let interruptionReason: Error | undefined;
  let rejectInterruption: ((reason: Error) => void) | undefined;
  const interruption = new Promise<never>((_, reject) => {
    rejectInterruption = reject;
  });
  const interrupt = (reason: Error) => {
    if (interruptionReason) return;
    interruptionReason = reason;
    rejectInterruption?.(reason);
    controller.abort(reason);
  };
  const abortFromCaller = () => interrupt(getStandaloneAbortReason(callerSignal));
  const timeout = setTimeout(() => {
    interrupt(createTimeoutError());
  }, timeoutMs);
  callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  if (callerSignal?.aborted) abortFromCaller();
  const pending = Promise.resolve().then(() => {
    if (interruptionReason) throw interruptionReason;
    return operation(controller.signal);
  });
  const observed = pending.then((value) => {
    if (interruptionReason) throw interruptionReason;
    return value;
  });
  // Promise.race releases the caller immediately. Keep observing the source
  // task so a non-cooperative late rejection can never become unhandled.
  void pending.catch(() => undefined);
  try {
    return await Promise.race([observed, interruption]);
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
};

export const withStandaloneAssetTimeout = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal?: AbortSignal,
  timeoutMs = PUBLIC_STANDALONE_ASSET_TIMEOUT_MS,
) => withStandaloneTimeout(
  operation,
  callerSignal,
  timeoutMs,
  () => new PublicDeliveryError(
    'download-unavailable',
    '读取本地样式资源超时，未生成不完整的 standalone HTML。',
  ),
);

export const withStandaloneOperationTimeout = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal?: AbortSignal,
  timeoutMs = PUBLIC_STANDALONE_OPERATION_TIMEOUT_MS,
) => withStandaloneTimeout(
  operation,
  callerSignal,
  timeoutMs,
  () => new PublicDeliveryError(
    'download-unavailable',
    '生成 portable standalone HTML 超时，未生成不完整文件。',
  ),
);

const isLocalPortableAsset = (url: URL, doc: Document) => {
  if (url.protocol === 'blob:') return true;
  try {
    return url.origin === new URL(doc.baseURI).origin;
  } catch {
    return false;
  }
};

const readPortableAssetBytes = async (
  response: Response,
  budget: PortableAssetBudget,
  signal?: AbortSignal,
) => {
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (
    Number.isFinite(declaredSize) &&
    (declaredSize > PUBLIC_STANDALONE_MAX_LOCAL_ASSET_BYTES ||
      budget.totalBytes + declaredSize > PUBLIC_STANDALONE_MAX_TOTAL_LOCAL_ASSET_BYTES)
  ) {
    failPortableAsset();
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.byteLength > PUBLIC_STANDALONE_MAX_LOCAL_ASSET_BYTES ||
      budget.totalBytes + bytes.byteLength > PUBLIC_STANDALONE_MAX_TOTAL_LOCAL_ASSET_BYTES
    ) {
      failPortableAsset();
    }
    budget.totalBytes += bytes.byteLength;
    return bytes;
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      throwIfStandaloneAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      byteLength += value.byteLength;
      if (
        byteLength > PUBLIC_STANDALONE_MAX_LOCAL_ASSET_BYTES ||
        budget.totalBytes + byteLength > PUBLIC_STANDALONE_MAX_TOTAL_LOCAL_ASSET_BYTES
      ) {
        await reader.cancel();
        failPortableAsset();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  budget.totalBytes += byteLength;
  return bytes;
};

const fetchPortableLocalAsset = async (
  href: string,
  doc: Document,
  budget: PortableAssetBudget,
  signal?: AbortSignal,
) => {
  throwIfStandaloneAborted(signal);
  const view = doc.defaultView;
  if (!view?.fetch || budget.count >= PUBLIC_STANDALONE_MAX_LOCAL_ASSETS) failPortableAsset();
  budget.count += 1;
  try {
    return await withStandaloneAssetTimeout(async (assetSignal) => {
      const response = await view.fetch(href, {
        cache: 'force-cache',
        credentials: 'same-origin',
        mode: 'same-origin',
        signal: assetSignal,
      });
      if (!response.ok) failPortableAsset();
      return {
        bytes: await readPortableAssetBytes(response, budget, assetSignal),
        contentType: response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream',
      };
    }, signal);
  } catch (error) {
    if (error instanceof PublicDeliveryError) throw error;
    if (signal?.aborted) throwIfStandaloneAborted(signal);
    return failPortableAsset(error);
  }
};

const encodePortableDataUrl = (bytes: Uint8Array, contentType: string, view: Window) => {
  // 24 KiB is divisible by three, so independently encoded chunks concatenate
  // into one valid base64 payload without a giant argument spread.
  const chunkSize = 24 * 1024;
  let payload = '';
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength));
    let binary = '';
    for (const byte of chunk) binary += String.fromCharCode(byte);
    payload += view.btoa(binary);
  }
  return `data:${contentType};base64,${payload}`;
};

const rewritePortableCssUrls = async (
  cssText: string,
  stylesheetHref: string,
  doc: Document,
  budget: PortableAssetBudget,
  cache: Map<string, Promise<string>>,
  signal?: AbortSignal,
) => {
  const parts: string[] = [];
  let cursor = 0;
  for (const occurrence of findPortableCssUrlOccurrences(cssText)) {
    parts.push(cssText.slice(cursor, occurrence.start));
    cursor = occurrence.end;
    const value = occurrence.value.trim();
    if (!value || /^(?:data:|#)/iu.test(value)) {
      parts.push(cssText.slice(occurrence.start, occurrence.end));
      continue;
    }
    let assetUrl: URL;
    try {
      assetUrl = new URL(value, stylesheetHref);
    } catch {
      parts.push(cssText.slice(occurrence.start, occurrence.end));
      continue;
    }
    if (!isLocalPortableAsset(assetUrl, doc)) {
      parts.push(`url("${escapeCssUrl(assetUrl.href)}")`);
      continue;
    }
    let dataUrlPromise = cache.get(assetUrl.href);
    if (!dataUrlPromise) {
      dataUrlPromise = fetchPortableLocalAsset(assetUrl.href, doc, budget, signal).then(({ bytes, contentType }) => {
        const view = doc.defaultView;
        if (!view) failPortableAsset();
        return encodePortableDataUrl(bytes, contentType, view);
      });
      cache.set(assetUrl.href, dataUrlPromise);
    }
    parts.push(`url("${escapeCssUrl(await dataUrlPromise)}")`);
  }
  parts.push(cssText.slice(cursor));
  return parts.join('');
};

const rewritePortableCssImports = async (
  cssText: string,
  stylesheetHref: string,
  doc: Document,
  budget: PortableAssetBudget,
  assetCache: Map<string, Promise<string>>,
  stylesheetCache: Map<string, Promise<string>>,
  importStack: ReadonlySet<string>,
  signal?: AbortSignal,
): Promise<string> => {
  const parts: string[] = [];
  let cursor = 0;
  for (const occurrence of findPortableCssImportOccurrences(cssText)) {
    parts.push(cssText.slice(cursor, occurrence.start));
    cursor = occurrence.end;
    const value = occurrence.value.trim();
    const condition = occurrence.condition;
    if (!value || /^(?:data:|#)/iu.test(value)) {
      parts.push(cssText.slice(occurrence.start, occurrence.end));
      continue;
    }
    let importUrl: URL;
    try {
      importUrl = new URL(value, stylesheetHref);
    } catch {
      parts.push(cssText.slice(occurrence.start, occurrence.end));
      continue;
    }
    if (!isLocalPortableAsset(importUrl, doc)) {
      parts.push(`@import url("${escapeCssUrl(importUrl.href)}")${condition};`);
      continue;
    }
    if (importStack.has(importUrl.href)) failPortableAsset();
    let dataUrlPromise = stylesheetCache.get(importUrl.href);
    if (!dataUrlPromise) {
      const nextImportStack = new Set(importStack);
      nextImportStack.add(importUrl.href);
      dataUrlPromise = fetchPortableLocalAsset(importUrl.href, doc, budget, signal)
        .then(async ({ bytes }) => {
          const view = doc.defaultView;
          if (!view) failPortableAsset();
          const importedCss = new TextDecoder().decode(bytes);
          const rewrittenCss = await rewritePortableStylesheet(
            importedCss,
            importUrl.href,
            doc,
            budget,
            assetCache,
            stylesheetCache,
            nextImportStack,
            signal,
          );
          return encodePortableDataUrl(
            new TextEncoder().encode(rewrittenCss),
            'text/css;charset=utf-8',
            view,
          );
        });
      stylesheetCache.set(importUrl.href, dataUrlPromise);
    }
    parts.push(`@import url("${escapeCssUrl(await dataUrlPromise)}")${condition};`);
  }
  parts.push(cssText.slice(cursor));
  return parts.join('');
};

const rewritePortableStylesheet = async (
  cssText: string,
  stylesheetHref: string,
  doc: Document,
  budget: PortableAssetBudget,
  assetCache: Map<string, Promise<string>>,
  stylesheetCache: Map<string, Promise<string>>,
  importStack: ReadonlySet<string>,
  signal?: AbortSignal,
) => rewritePortableCssUrls(
  await rewritePortableCssImports(
    cssText,
    stylesheetHref,
    doc,
    budget,
    assetCache,
    stylesheetCache,
    importStack,
    signal,
  ),
  stylesheetHref,
  doc,
  budget,
  assetCache,
  signal,
);

const collectPortableStyles = async (doc: Document, signal?: AbortSignal) => {
  const entries: PortableStyleEntry[] = [];
  const budget: PortableAssetBudget = { count: 0, totalBytes: 0 };
  const assetCache = new Map<string, Promise<string>>();
  const stylesheetCache = new Map<string, Promise<string>>();

  for (const sheet of Array.from(doc.styleSheets)) {
    throwIfStandaloneAborted(signal);
    if (sheet.disabled) continue;
    const stylesheetHref = sheet.href ? new URL(sheet.href, doc.baseURI).href : doc.baseURI;
    const media = sheet.media?.mediaText?.trim() || undefined;
    if (sheet.href && !isLocalPortableAsset(new URL(stylesheetHref), doc)) {
      entries.push({ kind: 'external', href: stylesheetHref, media });
      continue;
    }
    let cssText: string;
    try {
      cssText = Array.from(sheet.cssRules, rule => rule.cssText).join('\n');
    } catch {
      if (!sheet.href) continue;
      const asset = await fetchPortableLocalAsset(stylesheetHref, doc, budget, signal);
      cssText = new TextDecoder().decode(asset.bytes);
    }
    if (!cssText.trim()) continue;
    const importStack = new Set<string>();
    if (sheet.href) importStack.add(stylesheetHref);
    entries.push({ kind: 'inline', media, cssText: await rewritePortableStylesheet(
      cssText,
      stylesheetHref,
      doc,
      budget,
      assetCache,
      stylesheetCache,
      importStack,
      signal,
    ) });
  }

  return entries;
};

const serializePreviewRoot = (previewRoot: HTMLElement) => {
  const clone = previewRoot.cloneNode(true) as HTMLElement;
  absolutizePortableElementUrls(clone, previewRoot.ownerDocument.baseURI, previewRoot.ownerDocument);
  clone.querySelectorAll('[data-morndraft-delivery-exclude]').forEach(node => node.remove());
  clone.removeAttribute('contenteditable');
  clone.removeAttribute('data-public-final-editable');
  clone.querySelectorAll('script,base,meta,title,object,embed').forEach(node => node.remove());
  clone.querySelectorAll('*').forEach((element) => {
    element.removeAttribute('contenteditable');
    element.removeAttribute('data-public-final-editable');
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on')) element.removeAttribute(attribute.name);
      if (
        (name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action' || name === 'formaction') &&
        /^(?:javascript|vbscript)\s*:/iu.test(attribute.value.trim())
      ) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element instanceof HTMLIFrameElement) {
      const isMermaid = element.dataset.mermaidSecurity === 'strict-isolated';
      element.setAttribute('sandbox', isMermaid ? '' : 'allow-scripts');
    }
  });
  return clone.outerHTML;
};

const buildPortableStyleEntries = (entries: readonly PortableStyleEntry[]) => entries
  .map((entry) => {
    const media = entry.media ? ` media="${escapePortableHtmlAttribute(entry.media)}"` : '';
    return entry.kind === 'external'
      ? `<link rel="stylesheet" href="${escapePortableHtmlAttribute(entry.href)}"${media}>`
      : `<style${media}>${escapeStyleText(entry.cssText)}</style>`;
  })
  .join('\n');

const buildRawHtmlViewer = (
  input: PublicDeliveryInput,
  styles: readonly PortableStyleEntry[],
  themeVariables: string,
  language: string,
) => {
  const rawHtml = extractPublicRawHtmlSource(input.source);
  const frameSource = absolutizePortableHtml(
    rawHtml.trim() || '<!doctype html><html><body></body></html>',
    input.previewRoot.ownerDocument.baseURI,
    input.previewRoot.ownerDocument,
  );
  const title = input.title || 'MornDraft';
  const frame = buildOpaqueSandboxIframe({
    className: 'morndraft-public-raw-frame',
    srcdoc: frameSource,
    title,
  });
  return buildPortableDocument({
    body: frame,
    headBeforeTitle: `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapePortableHtmlAttribute(PUBLIC_RAW_HTML_CSP)}">
`,
    headAfterTitle: `<style>
:root{${themeVariables};}html,body{margin:0;min-height:100%;background:${input.theme === 'dark' ? '#11110f' : '#fff'};}
.morndraft-public-raw-frame{display:block;width:100%;height:100vh;min-height:100vh;border:0;background:#fff;}
</style>
${buildPortableStyleEntries(styles)}
`,
    htmlAttributes: { 'data-morndraft-public-standalone': 'raw-html' },
    language,
    title,
  });
};

const buildPublicStandaloneHtmlWithinDeadline = async (
  input: PublicDeliveryInput,
) => {
  await input.ensureRendered?.();
  input.assertCurrent?.();
  const document = input.previewRoot.ownerDocument;
  const styles = await collectPortableStyles(document, input.signal);
  const themeVariables = serializePublicThemeVariables(input.previewRoot, input.theme);
  const language = document.documentElement?.lang || 'zh-CN';

  if (input.contentType === 'html') {
    const html = buildRawHtmlViewer(input, styles, themeVariables, language);
    input.assertCurrent?.();
    return html;
  }

  const renderedHtml = serializePreviewRoot(input.previewRoot);
  const themeBackground = input.theme === 'dark' ? '#11110f' : '#fff';
  const themeColor = input.theme === 'dark' ? '#f4f4ef' : '#20201d';
  const title = input.title || 'MornDraft';
  const renderedDocument = buildPortableDocument({
    body: renderedHtml,
    headBeforeTitle: `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapePortableHtmlAttribute(PUBLIC_DOCUMENT_CSP)}">
`,
    headAfterTitle: `<style>
:root{${themeVariables};color-scheme:${input.theme};background:${themeBackground};color:${themeColor};}
*{box-sizing:border-box;}html,body{margin:0;min-height:100%;}body{background:${themeBackground};color:${themeColor};}
img,svg,canvas,video,iframe,table{max-width:100%;}
</style>
${buildPortableStyleEntries(styles)}
`,
    htmlAttributes: {
      'data-morndraft-public-document-frame': 'true',
      'data-theme': input.theme,
    },
    language,
    title,
  });
  const frame = buildOpaqueSandboxIframe({
    className: 'morndraft-public-document-frame',
    srcdoc: renderedDocument,
    title,
  });
  const html = buildPortableDocument({
    body: frame,
    headBeforeTitle: `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapePortableHtmlAttribute(PUBLIC_DOCUMENT_CSP)}">
`,
    headAfterTitle: `<style>
:root{color-scheme:${input.theme};background:${themeBackground};color:${themeColor};}
*{box-sizing:border-box;}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${themeBackground};color:${themeColor};}
.morndraft-public-document-frame{display:block;width:100%;height:100%;border:0;background:${themeBackground};}
</style>
`,
    htmlAttributes: {
      'data-morndraft-public-standalone': 'document',
      'data-theme': input.theme,
    },
    language,
    title,
  });
  input.assertCurrent?.();
  return html;
};

export const buildPublicStandaloneHtml = (
  input: PublicDeliveryInput,
  options: { timeoutMs?: number } = {},
) => withStandaloneOperationTimeout(
  signal => buildPublicStandaloneHtmlWithinDeadline({ ...input, signal }),
  input.signal,
  options.timeoutMs,
);
