import {
  parseMarkdownImage,
  serializeMarkdownImage,
} from '@morndraft/core';
import {
  copyImageBlobPayload,
  copyRichHtmlPayload,
  type CopyPayload,
} from './clipboardWriters';

export type PreviewImageReference = {
  alt: string;
  html: string;
  markdown: string;
  title: string;
  url: string;
};

export type PreviewImageCopyResult = 'image' | 'reference';

type CopyPreviewImageReferenceOptions = {
  copyFallback?: (payload: CopyPayload) => Promise<unknown>;
  copyImage?: (imageBlobPromise: Promise<Blob>) => Promise<unknown>;
  fetchImpl?: typeof fetch;
};

const createSingleLineSourceRange = (source: string) => ({
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: source.length + 1,
});

const escapeHtmlAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const buildPreviewImageHtml = ({ alt, title, url }: Pick<PreviewImageReference, 'alt' | 'title' | 'url'>) => (
  `<img src="${escapeHtmlAttribute(url)}" alt="${escapeHtmlAttribute(alt)}"${title ? ` title="${escapeHtmlAttribute(title)}"` : ''}>`
);

export const parsePreviewMarkdownImageReference = (source: string): PreviewImageReference | null => {
  const trimmed = String(source ?? '').trim();
  if (!trimmed || trimmed.includes('\n')) return null;
  const image = parseMarkdownImage(trimmed, createSingleLineSourceRange(trimmed));
  if (!image.ok || !('alt' in image) || !('title' in image) || !('url' in image)) return null;
  const imageReference = {
    alt: String(image.alt ?? ''),
    title: String(image.title ?? ''),
    url: String(image.url ?? ''),
  };
  const markdown = serializeMarkdownImage(imageReference);
  if (!markdown) return null;
  return {
    alt: imageReference.alt,
    html: buildPreviewImageHtml(imageReference),
    markdown,
    title: imageReference.title,
    url: imageReference.url,
  };
};

const parseHtmlImageWithDomParser = (html: string): PreviewImageReference | null => {
  if (typeof DOMParser === 'undefined') return null;
  const document = new DOMParser().parseFromString(html, 'text/html');
  const image = document.querySelector('img[src]');
  const url = image?.getAttribute('src')?.trim() ?? '';
  if (!url) return null;
  const markdown = serializeMarkdownImage({
    alt: image?.getAttribute('alt') ?? 'image',
    title: image?.getAttribute('title') ?? '',
    url,
  });
  return markdown ? parsePreviewMarkdownImageReference(markdown) : null;
};

const parseHtmlImageWithPattern = (html: string): PreviewImageReference | null => {
  const match = String(html ?? '').match(/<img\b[^>]*\bsrc\s*=\s*("[^"]+"|'[^']+'|[^\s>]+)[^>]*>/i);
  if (!match) return null;
  const tag = match[0];
  const strip = (value: string) => {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  };
  const getAttr = (name: string) => {
    const attrMatch = tag.match(new RegExp(`\\b${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i'));
    return attrMatch ? strip(attrMatch[1] ?? '') : '';
  };
  const url = strip(match[1] ?? '');
  const markdown = serializeMarkdownImage({
    alt: getAttr('alt') || 'image',
    title: getAttr('title'),
    url,
  });
  return markdown ? parsePreviewMarkdownImageReference(markdown) : null;
};

export const parsePreviewHtmlImageReference = (html: string): PreviewImageReference | null =>
  parseHtmlImageWithDomParser(html) ?? parseHtmlImageWithPattern(html);

export const resolvePreviewImageClipboardReference = ({
  html,
  plain,
}: {
  html?: string;
  plain?: string;
}): PreviewImageReference | null =>
  parsePreviewMarkdownImageReference(plain ?? '') ?? parsePreviewHtmlImageReference(html ?? '');

const canvasToPngBlob = (canvas: HTMLCanvasElement) => (
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode image as PNG.'));
    }, 'image/png');
  })
);

const convertImageBlobToPng = async (blob: Blob) => {
  if (blob.type === 'image/png') return blob;
  if (typeof document === 'undefined') throw new Error('Browser image conversion is unavailable.');
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.decoding = 'async';
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Failed to decode image for clipboard copy.'));
      element.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, image.naturalWidth || image.width);
    canvas.height = Math.max(1, image.naturalHeight || image.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable for image clipboard copy.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasToPngBlob(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const fetchPreviewImageAsPng = async (url: string, fetchImpl: typeof fetch = fetch) => {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Image download failed (${response.status}).`);
  return convertImageBlobToPng(await response.blob());
};

export const copyPreviewImageReference = async (
  reference: PreviewImageReference,
  options: CopyPreviewImageReferenceOptions = {},
): Promise<PreviewImageCopyResult> => {
  const copyImage = options.copyImage ?? copyImageBlobPayload;
  const copyFallback = options.copyFallback ?? ((payload: CopyPayload) => copyRichHtmlPayload(Promise.resolve(payload)));
  const imageBlobPromise = fetchPreviewImageAsPng(reference.url, options.fetchImpl);
  try {
    await copyImage(imageBlobPromise);
    return 'image';
  } catch (error) {
    imageBlobPromise.catch(() => undefined);
    console.warn('Image pixel clipboard copy failed, falling back to image reference copy:', error);
  }
  await copyFallback({
    hasEmbeddedImages: true,
    html: reference.html,
    plain: reference.markdown,
  });
  return 'reference';
};
