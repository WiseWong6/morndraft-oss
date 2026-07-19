import { createPortableBlockHeaderHtml } from '@morndraft/core';

type PreviewTheme = 'dark' | 'light';

const STANDALONE_MERMAID_TOOLBAR_SELECTOR = '[data-morndraft-standalone-mermaid-toolbar]';

export const inlinePortableBlockHeaders = (root: HTMLElement, theme: PreviewTheme) => {
  root.querySelectorAll<HTMLElement>('.aad-collapsible-block > .aad-block-header').forEach((header) => {
    if (header.querySelector(STANDALONE_MERMAID_TOOLBAR_SELECTOR)) return;
    const label = header.querySelector('.aad-block-label')?.textContent?.trim() || 'Preview';
    const meta = header.querySelector('.aad-block-meta')?.textContent?.trim() || '';
    header.outerHTML = createPortableBlockHeaderHtml(label, theme, meta);
  });
};
