import { capturePublicPreviewPng } from './capture';
import { buildPublicPreviewPdf } from './pdf';
import { buildPublicStandaloneHtml } from './standalone';
import {
  PublicDeliveryError,
  type PublicDeliveryAdapter,
  type PublicDeliveryInput,
  type PublicPngCapture,
} from './types';

// WebKit can consume a download URL after the synthetic click has returned.
// Keep it alive briefly, but always revoke it within a fixed bound.
const DOWNLOAD_OBJECT_URL_CLEANUP_MS = 1_000;

const isDeliveryInput = (
  input: PublicDeliveryInput | PublicPngCapture | Blob,
): input is PublicDeliveryInput => 'previewRoot' in input;

const resolvePngBlob = async (input: PublicDeliveryInput | PublicPngCapture | Blob) => {
  if (input instanceof Blob) return input;
  if (isDeliveryInput(input)) return (await capturePublicPreviewPng(input)).blob;
  return input.blob;
};

export const downloadPublicBlob = (blob: Blob, fileName: string) => {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    throw new PublicDeliveryError('download-unavailable', '当前环境不支持浏览器文件下载。');
  }
  const safeFileName = fileName.trim() || 'morndraft-export';
  let url: string | undefined;
  let anchor: HTMLAnchorElement | undefined;
  let revokeScheduled = false;
  const revokeUrl = () => {
    if (!url) return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Cleanup is best effort and must not mask the original download error.
    }
  };
  const removeAnchor = () => {
    if (!anchor) return;
    try {
      anchor.remove();
    } catch {
      try {
        anchor.parentNode?.removeChild(anchor);
      } catch {
        // Cleanup is best effort and must not mask the original download error.
      }
    }
  };
  try {
    url = URL.createObjectURL(blob);
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeFileName;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(revokeUrl, DOWNLOAD_OBJECT_URL_CLEANUP_MS);
    revokeScheduled = true;
  } catch (error) {
    if (!revokeScheduled) revokeUrl();
    throw new PublicDeliveryError('download-unavailable', '文件下载启动失败，请重试。', { cause: error });
  } finally {
    removeAnchor();
  }
};

export const copyPublicPng = async (input: PublicDeliveryInput | PublicPngCapture | Blob) => {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  const ClipboardItemConstructor = globalThis.ClipboardItem;
  if (!clipboard?.write || typeof ClipboardItemConstructor === 'undefined') {
    throw new PublicDeliveryError(
      'clipboard-unavailable',
      '当前浏览器不支持复制图片，请使用“下载 PNG”。',
    );
  }

  let sourceFailure: unknown;
  const pngBlob = resolvePngBlob(input).then((sourceBlob) => {
    if (isDeliveryInput(input)) input.assertCurrent?.();
    if (sourceBlob.type && sourceBlob.type !== 'image/png') {
      throw new PublicDeliveryError('invalid-png', '复制图片只能使用 PNG 产物。');
    }
    return sourceBlob.type === 'image/png'
      ? sourceBlob
      : new Blob([sourceBlob], { type: 'image/png' });
  }).catch((error: unknown) => {
    sourceFailure = error;
    throw error;
  });
  void pngBlob.catch(() => undefined);
  try {
    // Clipboard write must begin inside the original click activation. The
    // ClipboardItem promise lets capture finish asynchronously without losing
    // that activation in browsers that enforce it strictly.
    await clipboard.write([new ClipboardItemConstructor({ 'image/png': pngBlob })]);
    await pngBlob;
    if (isDeliveryInput(input)) input.assertCurrent?.();
  } catch (error) {
    if (sourceFailure) throw sourceFailure;
    throw new PublicDeliveryError(
      'clipboard-unavailable',
      '图片复制失败，请使用“下载 PNG”。',
      { cause: error },
    );
  }
};

const getPublicDeliveryFileBase = (title: string) => {
  const normalized = title
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, '-')
    .replace(/\s+/gu, ' ')
    .replace(/[. ]+$/gu, '')
    .trim();
  return normalized.slice(0, 96) || 'morndraft-export';
};

export const createBrowserPublicDeliveryAdapter = (): PublicDeliveryAdapter => ({
  copyImage: async (input) => {
    await copyPublicPng(input);
  },
  downloadImage: async (input) => {
    const capture = await capturePublicPreviewPng(input);
    input.assertCurrent?.();
    downloadPublicBlob(capture.blob, `${getPublicDeliveryFileBase(input.title)}.png`);
  },
  downloadPdf: async (input) => {
    const pdf = await buildPublicPreviewPdf(input);
    input.assertCurrent?.();
    downloadPublicBlob(pdf, `${getPublicDeliveryFileBase(input.title)}.pdf`);
  },
  downloadHtml: async (input) => {
    const html = await buildPublicStandaloneHtml(input);
    input.assertCurrent?.();
    downloadPublicBlob(
      new Blob([html], { type: 'text/html;charset=utf-8' }),
      `${getPublicDeliveryFileBase(input.title)}.html`,
    );
  },
});
