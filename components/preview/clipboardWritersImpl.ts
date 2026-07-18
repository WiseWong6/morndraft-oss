export type CopyPayload = {
  html: string;
  plain: string;
  hasEmbeddedImages?: boolean;
};

const WECHAT_ARTICLE_WIDTH = 677;

export class ImageClipboardWriteError extends Error {
  override cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'ImageClipboardWriteError';
    this.cause = cause;
  }
}

const supportsImageClipboardWrite = () => {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
  const supports = (ClipboardItem as typeof ClipboardItem & { supports?: (type: string) => boolean }).supports;
  return typeof supports === 'function' ? supports('image/png') : true;
};

export const copyPlainText = async (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return;

  try {
    await navigator.clipboard.writeText(trimmed);
    return;
  } catch (err) {
    console.warn('navigator.clipboard.writeText failed, falling back to selection copy:', err);
  }

  const textarea = document.createElement('textarea');
  textarea.value = trimmed;
  textarea.setAttribute('readonly', 'true');
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand('copy')) {
      throw new Error('document.execCommand("copy") returned false');
    }
  } finally {
    document.body.removeChild(textarea);
  }
};

const saveCurrentSelection = () => {
  const mainSelection = window.getSelection();
  const savedRanges = mainSelection
    ? Array.from({ length: mainSelection.rangeCount }, (_, index) =>
        mainSelection.getRangeAt(index).cloneRange(),
      )
    : [];

  return { mainSelection, savedRanges };
};

const restoreSelection = (
  mainSelection: Selection | null,
  savedRanges: Range[],
  activeSelection?: Selection | null,
) => {
  activeSelection?.removeAllRanges();
  mainSelection?.removeAllRanges();
  savedRanges.forEach((range) => mainSelection?.addRange(range));
};

const copyRichHtmlViaDocumentSelection = (html: string) => {
  const { mainSelection, savedRanges } = saveCurrentSelection();
  const tempContainer = document.createElement('div');
  tempContainer.setAttribute('contenteditable', 'true');
  tempContainer.innerHTML = html;
  tempContainer.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:0',
    `width:${WECHAT_ARTICLE_WIDTH}px`,
    'background:#ffffff',
    'color:#1f2937',
    'opacity:0',
    'pointer-events:none',
    'z-index:-1',
  ].join(';');

  document.body.appendChild(tempContainer);

  try {
    const range = document.createRange();
    range.selectNodeContents(tempContainer);
    mainSelection?.removeAllRanges();
    mainSelection?.addRange(range);

    if (!document.execCommand('copy')) {
      throw new Error('document.execCommand("copy") returned false');
    }
  } finally {
    restoreSelection(mainSelection, savedRanges);
    document.body.removeChild(tempContainer);
  }
};

const copyRichHtmlViaIframeSelection = (html: string) => {
  const { mainSelection, savedRanges } = saveCurrentSelection();
  const iframe = document.createElement('iframe');
  iframe.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    `width:${WECHAT_ARTICLE_WIDTH}px`,
    'height:1px',
    'border:0',
    'opacity:0',
    'pointer-events:none',
    'background:#ffffff',
    'z-index:-1',
  ].join(';');

  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    const frameWindow = iframe.contentWindow;
    if (!doc || !frameWindow) {
      throw new Error('Failed to create rich copy iframe');
    }

    doc.open();
    doc.write(
      [
        '<!doctype html>',
        '<html>',
        '<head>',
        '<meta charset="UTF-8">',
        '<style>',
        'html,body{margin:0;padding:0;background:#fff;}',
        `body{width:${WECHAT_ARTICLE_WIDTH}px;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}`,
        'img,svg,canvas,video{max-width:100%;}',
        '</style>',
        '</head>',
        '<body>',
        html,
        '</body>',
        '</html>',
      ].join(''),
    );
    doc.close();

    const selection = frameWindow.getSelection();
    const range = doc.createRange();
    range.selectNodeContents(doc.body);
    selection?.removeAllRanges();
    selection?.addRange(range);
    frameWindow.focus();

    if (!doc.execCommand('copy')) {
      throw new Error('document.execCommand("copy") returned false');
    }
  } finally {
    restoreSelection(mainSelection, savedRanges, iframe.contentWindow?.getSelection());
    document.body.removeChild(iframe);
  }
};

const copyRichHtmlViaSelection = (html: string) => {
  try {
    copyRichHtmlViaIframeSelection(html);
  } catch (err) {
    console.warn('Iframe selection rich copy failed, falling back to document selection:', err);
    copyRichHtmlViaDocumentSelection(html);
  }
};

const copyRichHtml = async (
  html: string,
  plain: string,
  options: { preferSelection?: boolean } = {},
) => {
  if (!html.trim()) return;

  const writeClipboardItem = async () => {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      throw new Error('ClipboardItem rich copy is not available');
    }

    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ]);
  };

  if (options.preferSelection) {
    try {
      copyRichHtmlViaSelection(html);
      return;
    } catch (err) {
      console.warn('Selection rich copy failed, falling back to ClipboardItem:', err);
    }

    await writeClipboardItem();
    return;
  }

  let clipboardError: unknown = null;
  try {
    await writeClipboardItem();
    return;
  } catch (err) {
    clipboardError = err;
    console.warn('navigator.clipboard.write failed, falling back to selection copy:', err);
  }

  try {
    copyRichHtmlViaSelection(html);
  } catch (fallbackError) {
    if (clipboardError) {
      console.error('Clipboard rich copy failed before fallback:', clipboardError);
    }
    throw fallbackError;
  }
};

export const copyRichHtmlPayload = async (payloadPromise: Promise<CopyPayload>) => {
  let payloadCache: CopyPayload | null = null;
  const trackedPayload = payloadPromise.then((payload) => {
    payloadCache = payload;
    return payload;
  });

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      window.focus();
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': trackedPayload.then(
            (payload) => new Blob([payload.html], { type: 'text/html' }),
          ),
          'text/plain': trackedPayload.then(
            (payload) => new Blob([payload.plain], { type: 'text/plain' }),
          ),
        }),
      ]);
      return await trackedPayload;
    } catch (err) {
      console.warn('Promise-based rich copy failed, falling back to selection copy:', err);
    }
  }

  const payload = payloadCache ?? (await trackedPayload);
  await copyRichHtml(payload.html, payload.plain, {
    preferSelection: payload.hasEmbeddedImages,
  });
  return payload;
};

export const copyImageBlobPayload = async (
  imageBlobPromise: Promise<Blob>,
) => {
  const trackedImageBlob = imageBlobPromise.then((blob) => {
    if (!blob) throw new Error('Failed to create image blob');
    return blob;
  });

  let promiseWriteError: unknown = null;
  let concreteWriteError: unknown = null;

  try {
    if (!supportsImageClipboardWrite()) {
      throw new Error('Image clipboard write is not available in this browser');
    }
    window.focus();
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': trackedImageBlob,
      }),
    ]);
    await trackedImageBlob;
    return;
  } catch (err) {
    promiseWriteError = err;
  }

  const imageBlob = await trackedImageBlob;

  try {
    if (!supportsImageClipboardWrite()) {
      throw new Error('Image clipboard write is not available in this browser');
    }
    window.focus();
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': imageBlob,
      }),
    ]);
    return;
  } catch (err) {
    concreteWriteError = err;
  }

  try {
    if (window.parent !== window && window.parent.location.origin === window.location.origin) {
      const parentClipboardItem = (window.parent as typeof window & { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      const parentClipboard = window.parent.navigator.clipboard;
      if (typeof parentClipboardItem !== 'undefined' && parentClipboard?.write) {
        window.parent.focus();
        await parentClipboard.write([
          new parentClipboardItem({
            'image/png': imageBlob,
          }),
        ]);
        return;
      }
    }
  } catch (err) {
    console.warn('Parent window image clipboard retry failed:', err);
  }

  const finalError = concreteWriteError ?? promiseWriteError ?? new Error('Image clipboard write failed');
  console.error('Image clipboard write failed:', finalError);
  throw new ImageClipboardWriteError('Image clipboard write failed', finalError);
};
