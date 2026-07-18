import React from 'react';
import type { ArtifactPreviewTranslations } from '../../i18n';
import {
  CollapsibleArtifactBlock,
  type CollapsibleArtifactBlockProps,
} from './CollapsibleArtifactBlock';
import { BlockHeaderCopyAction } from './BlockHeaderCopyAction';

const PrismCodeHighlighter = React.lazy(async () => {
  const module = await import('./PrismCodeHighlighter');
  return { default: module.PrismCodeHighlighter };
});

type CodeCollapsibleBlockProps = Omit<CollapsibleArtifactBlockProps, 'expandLabel' | 'collapseLabel'>;

const CodeCollapsibleBlock: React.FC<CodeCollapsibleBlockProps & {
  t: ArtifactPreviewTranslations;
}> = ({ t, ...props }) => (
  <CollapsibleArtifactBlock
    {...props}
    expandLabel={t.expandBlock}
    collapseLabel={t.collapseBlock}
  />
);

export const CodePreviewBlock: React.FC<{
  code: string;
  language: string;
  fallbackLabel: string;
  t: ArtifactPreviewTranslations;
}> = ({
  code,
  language,
  fallbackLabel,
  t,
}) => (
  <CodeCollapsibleBlock
    t={t}
    label={language || fallbackLabel}
    className="aad-code-frame"
    copyRole="code-block"
    resetKey={`code:${language}:${code}`}
    actions={<BlockHeaderCopyAction contentKind="code" text={code} t={t} />}
  >
    <React.Suspense
      fallback={(
        <pre className="aad-code-block">
          <code>{code}</code>
        </pre>
      )}
    >
      <PrismCodeHighlighter code={code} language={language} />
    </React.Suspense>
  </CodeCollapsibleBlock>
);
