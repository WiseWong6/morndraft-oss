import {
  createPortableRichCodeBlockHtml,
  selectPortableRichBlockText,
} from '@morndraft/core';

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

const getBlockBodyText = (block: HTMLElement) =>
  selectPortableRichBlockText({
    explicitText: block.dataset.copyText,
    fallbackText: block.querySelector('.aad-collapsible-body')?.textContent || block.textContent || '',
  });

const getArtifactErrorSourceText = (block: HTMLElement) => {
  const textarea = block.querySelector<HTMLTextAreaElement>('.aad-artifact-error-source-textarea');
  const sourceCode = block.querySelector<HTMLElement>('.aad-artifact-error-source-code');
  return selectPortableRichBlockText({
    explicitText: textarea?.value || textarea?.textContent || sourceCode?.textContent || block.dataset.copyText,
    fallbackText: block.querySelector('.aad-collapsible-body')?.textContent || block.textContent || '',
  });
};

export const replaceJsonBlocksWithRichCopyShells = (
  root: HTMLElement,
  theme: PreviewTheme,
) => {
  root.querySelectorAll<HTMLElement>('[data-copy-role="json-block"]').forEach((block) => {
    const isErrorFallback = block.classList.contains('aad-artifact-error-block');
    const label = isErrorFallback
      ? getArtifactHeaderText(block, '.aad-block-label', 'JSON')
      : 'JSON';
    const code = isErrorFallback ? getArtifactErrorSourceText(block) : getBlockBodyText(block);
    const html = createPortableRichCodeBlockHtml({ label, theme, code });
    const replacement = createElementFromHtml(html);
    replacement?.setAttribute('data-rich-copy-artifact', 'json');
    if (replacement) block.replaceWith(replacement);
  });
};

export const replaceFallbackArtifactBlocksWithRichCopyShells = (
  root: HTMLElement,
  theme: PreviewTheme,
) => {
  root.querySelectorAll<HTMLElement>(
    [
      '[data-copy-role="document-spec-error"]',
      '[data-copy-role="morndraft-flat-error"]',
    ].join(','),
  ).forEach((block) => {
    const label = getArtifactHeaderText(block, '.aad-block-label', 'Preview');
    const replacement = createElementFromHtml(
      createPortableRichCodeBlockHtml({
        label,
        theme,
        code: getArtifactErrorSourceText(block),
      }),
    );
    replacement?.setAttribute('data-rich-copy-artifact', 'code');
    if (replacement) block.replaceWith(replacement);
  });
};
