import {
  createPortableRichMediaBlockHtml,
  createPortableRichMessageBlockHtml,
} from '@morndraft/core';
import type { CopyPayload } from './clipboardWriters';
import {
  MERMAID_IMAGE_BATCH_SIZE,
  WECHAT_ARTICLE_WIDTH,
  blobToDataUrl,
  createResponsiveImageHtml,
  getMermaidSvgs,
  getRenderedMermaidTrimRect,
  isMermaidSvg,
  svgToPngCapture,
} from './mermaidCapture';

type PreviewTheme = 'dark' | 'light';

const createElementFromHtml = (html: string) => {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement | null;
};

const getArtifactHeaderText = (
  block: HTMLElement,
  selector: '.aad-block-label' | '.aad-block-meta',
  fallback = '',
) => block.querySelector(selector)?.textContent?.trim() || fallback;

const replaceArtifactBlock = (block: HTMLElement, replacement: Element) => {
  const replaceTarget = block.parentElement?.tagName.toLowerCase() === 'pre'
    ? block.parentElement
    : block;
  replaceTarget.replaceWith(replacement);
};

export const replaceMermaidBlocksWithRichCopyShells = async (
  root: HTMLElement,
  theme: PreviewTheme,
  sourceRoot: HTMLElement = root,
) => {
  const mermaidBlocks = Array.from(
    root.querySelectorAll<HTMLElement>('[data-copy-role="mermaid-block"]'),
  );
  const sourceBlocks = Array.from(
    sourceRoot.querySelectorAll<HTMLElement>('[data-copy-role="mermaid-block"]'),
  );
  if (mermaidBlocks.length === 0) return false;
  let convertedCount = 0;

  for (let batchStart = 0; batchStart < mermaidBlocks.length; batchStart += MERMAID_IMAGE_BATCH_SIZE) {
    const batch = mermaidBlocks.slice(batchStart, batchStart + MERMAID_IMAGE_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (block, batchIndex) => {
        const blockIndex = batchStart + batchIndex;
        const label = getArtifactHeaderText(block, '.aad-block-label', 'Mermaid');
        const meta = getArtifactHeaderText(block, '.aad-block-meta');
        const svg = Array.from(block.querySelectorAll<SVGElement>('svg')).find(isMermaidSvg);
        let shellHtml: string;

        if (svg) {
          const sourceSvg = sourceBlocks[blockIndex]
            ? Array.from(sourceBlocks[blockIndex].querySelectorAll<SVGElement>('svg')).find(isMermaidSvg)
            : null;
          const trimRect =
            sourceSvg instanceof SVGSVGElement ? getRenderedMermaidTrimRect(sourceSvg) : null;
          const capture = await svgToPngCapture(svg, theme, trimRect);
          const imageUrl = await blobToDataUrl(capture.blob);
          shellHtml = createPortableRichMediaBlockHtml({
            label,
            meta,
            theme,
            mediaHtml: createResponsiveImageHtml(imageUrl, '', capture),
          });
        } else {
          shellHtml = createPortableRichMessageBlockHtml({
            label,
            meta,
            theme,
            message: (block.textContent || '').trim() || 'Mermaid diagram was not ready for rich copy.',
          });
        }

        const replacement = createElementFromHtml(shellHtml);
        if (replacement) {
          replacement.setAttribute('data-rich-copy-artifact', 'mermaid');
          replaceArtifactBlock(block, replacement);
        }
      }),
    );

    convertedCount += results.filter((r) => r.status === 'fulfilled').length;
  }

  if (convertedCount === 0 && mermaidBlocks.length > 0) {
    throw new Error(`Failed to convert all ${mermaidBlocks.length} Mermaid diagram(s) for rich copy`);
  }

  return convertedCount > 0;
};

export const buildMermaidImagesPayload = async (
  sourceRoot: HTMLElement,
  theme: PreviewTheme,
): Promise<CopyPayload> => {
  const svgs = getMermaidSvgs(sourceRoot);
  if (svgs.length === 0) {
    throw new Error('No Mermaid diagrams are ready to copy');
  }

  const imageHtml: string[] = [];
  for (const [index, svg] of svgs.entries()) {
    try {
      const trimRect = svg instanceof SVGSVGElement ? getRenderedMermaidTrimRect(svg) : null;
      const capture = await svgToPngCapture(svg, theme, trimRect);
      const imageUrl = await blobToDataUrl(capture.blob);
      imageHtml.push(createPortableRichMediaBlockHtml({
        label: 'Mermaid',
        theme,
        mediaHtml: createResponsiveImageHtml(imageUrl, '', capture),
      }));
    } catch (err) {
      console.warn(`Failed to convert Mermaid diagram #${index + 1} to PNG:`, err);
    }
  }

  if (imageHtml.length === 0) {
    throw new Error(`Failed to convert all ${svgs.length} Mermaid diagram(s) to PNG`);
  }

  const wrapper = document.createElement('section');
  wrapper.style.cssText = [
    `max-width:${WECHAT_ARTICLE_WIDTH}px`,
    'margin:0 auto',
    'box-sizing:border-box',
    'background:#ffffff',
  ].join(';');
  wrapper.innerHTML = imageHtml.join('');

  return {
    html: wrapper.outerHTML,
    plain: '',
    hasEmbeddedImages: true,
  };
};
