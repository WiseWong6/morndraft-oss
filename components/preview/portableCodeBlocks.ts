import { createPortableRichCodeBlockHtml } from '@morndraft/core';

type PreviewTheme = 'dark' | 'light';

export const PORTABLE_CODE_BLOCK_CLASS_ALLOWLIST = [
  'code-dot',
  'code-dots',
  'code-header',
  'code-lang',
  'code-snippet__fix',
  'code-snippet_outer',
];

const PRESERVE_LAYOUT_ATTR = 'data-copy-preserve-layout';

const getStableCodeLanguage = (value: string | null | undefined) => {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized || /^(code|text|plain|plaintext|\u4ee3\u7801|\u4ee3\u7801\u5757)$/i.test(normalized)) {
    return 'text';
  }
  const firstToken = normalized.split(/\s+/)[0]?.replace(/[^a-z0-9_+#.-]/g, '');
  return firstToken || 'text';
};

const getCodeBlockLanguage = (block: HTMLElement, codeBlock: HTMLElement) => {
  const label = block.querySelector<HTMLElement>(':scope > .aad-block-header .aad-block-label');
  if (label?.textContent) {
    return getStableCodeLanguage(label.textContent);
  }

  const languageClass = Array.from([
    ...codeBlock.classList,
    ...Array.from(codeBlock.querySelectorAll<HTMLElement>('[class*="language-"]')).flatMap(
      (element) => Array.from(element.classList),
    ),
  ]).find((className) => className.startsWith('language-'));

  return getStableCodeLanguage(languageClass?.replace(/^language-/, ''));
};

const getCodeBlockText = (codeBlock: HTMLElement) => {
  const clone = codeBlock.cloneNode(true) as HTMLElement;
  clone.querySelectorAll<HTMLElement>('br').forEach((br) => {
    br.replaceWith('\n');
  });
  return clone.innerText || clone.textContent || '';
};

const createElementFromHtml = (html: string) => {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement | null;
};

const createPortableCodeSnippet = (
  codeBlock: HTMLElement,
  _block: HTMLElement,
  language: string,
  theme: PreviewTheme,
) => {
  const snippet = createElementFromHtml(
    createPortableRichCodeBlockHtml({
      label: language,
      theme,
      code: getCodeBlockText(codeBlock),
    }),
  );
  if (!snippet) {
    const fallback = document.createElement('pre');
    fallback.setAttribute(PRESERVE_LAYOUT_ATTR, 'true');
    fallback.textContent = getCodeBlockText(codeBlock);
    return fallback;
  }
  return snippet;
};

export const replacePortableCodeBlocks = (root: HTMLElement, theme: PreviewTheme = 'light') => {
  const codeWrappers = Array.from(
    root.querySelectorAll<HTMLElement>('[data-copy-role="code-block"]'),
  );

  codeWrappers.forEach((block) => {
    const codeBlock = block.querySelector<HTMLElement>('.aad-code-block');
    if (!codeBlock) return;

    block.replaceWith(
      createPortableCodeSnippet(
        codeBlock,
        block,
        getCodeBlockLanguage(block, codeBlock),
        theme,
      ),
    );
  });

  root.querySelectorAll<HTMLElement>('.aad-code-block').forEach((codeBlock) => {
    if (codeBlock.closest('.code-snippet__fix')) return;
    codeBlock.replaceWith(
      createPortableCodeSnippet(
        codeBlock,
        codeBlock,
        getCodeBlockLanguage(codeBlock, codeBlock),
        theme,
      ),
    );
  });
};
