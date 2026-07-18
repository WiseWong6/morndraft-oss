import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isActiveBlockPreviewMarkdownPatchEcho,
  isSkippableLocalPreviewPatchEcho,
  resolvePreviewRenderResetKey,
  type PreviewMarkdownPatchKind,
  type PreviewSourcePatchEcho,
} from './previewMarkdownPatchMeta';

const codePatchKind: PreviewMarkdownPatchKind = 'code';
const aiPatchKind: PreviewMarkdownPatchKind = 'ai';

const localBoldEcho: PreviewSourcePatchEcho = {
  baseSource: 'Alpha beta',
  sequence: 1,
  source: 'Alpha **beta**',
  meta: {
    blockId: 'paragraph:1:1',
    kind: 'bold',
    origin: 'preview-markdown-edit',
    renderScope: 'active-block',
    transactionId: 1,
  },
};

const localItalicEcho: PreviewSourcePatchEcho = {
  baseSource: 'Alpha beta',
  sequence: 2,
  source: 'Alpha *beta*',
  meta: {
    blockId: 'paragraph:1:1',
    kind: 'italic',
    origin: 'preview-markdown-edit',
    renderScope: 'active-block',
    transactionId: 2,
  },
};

const localCodeEcho: PreviewSourcePatchEcho = {
  baseSource: 'Before',
  sequence: 3,
  source: 'Before\n\n```ts\nconst answer = 42;\n```',
  meta: {
    blockId: 'code-block:2:1',
    kind: codePatchKind,
    origin: 'preview-markdown-edit',
    renderScope: 'active-block',
    skipActiveBlockRefresh: true,
    transactionId: 3,
  },
};

const localStructuralCodeEcho: PreviewSourcePatchEcho = {
  baseSource: '```html\n<section data-count="3"></section>\n```',
  sequence: 5,
  source: '```html\n<section data-count="4"></section>\n```',
  meta: {
    blockId: 'code-block:morndraftHtmlSource:iframe:0',
    commitPhase: 'structural',
    kind: codePatchKind,
    origin: 'preview-markdown-edit',
    renderScope: 'active-block',
    skipActiveBlockRefresh: true,
    transactionId: 5,
  },
};

const localAiEcho: PreviewSourcePatchEcho = {
  baseSource: 'Before AI',
  sequence: 4,
  source: 'After AI',
  meta: {
    blockId: 'document:preview-markdown',
    kind: aiPatchKind,
    origin: 'preview-markdown-edit',
    renderScope: 'active-block',
    transactionId: 4,
  },
};

test('local artifact patch echo skips the document render even when its fence gains lines', () => {
  const lineChangingStructuralEcho: PreviewSourcePatchEcho = {
    ...localStructuralCodeEcho,
    baseSource: '```html\n<section>before</section>\n```\n\n```html\n<section>later</section>\n```',
    source: '```html\n<section>before</section>\n<span>new row</span>\n```\n\n```html\n<section>later</section>\n```',
  };
  assert.equal(isSkippableLocalPreviewPatchEcho({
    previewCode: lineChangingStructuralEcho.source,
    sourcePatchEcho: lineChangingStructuralEcho,
  }), true);
  assert.equal(isSkippableLocalPreviewPatchEcho({
    previewCode: localCodeEcho.source,
    sourcePatchEcho: localCodeEcho,
  }), true);
  assert.equal(isSkippableLocalPreviewPatchEcho({
    previewCode: localBoldEcho.source,
    sourcePatchEcho: localBoldEcho,
  }), false);
  assert.equal(isSkippableLocalPreviewPatchEcho({
    previewCode: lineChangingStructuralEcho.source,
    sourcePatchEcho: {
      ...lineChangingStructuralEcho,
      meta: {
        ...lineChangingStructuralEcho.meta,
        forceDocumentRefresh: true,
      },
    },
  }), false, 'an explicit full-document refresh must not be skipped');
  assert.equal(isSkippableLocalPreviewPatchEcho({
    previewCode: lineChangingStructuralEcho.source,
    sourcePatchEcho: {
      ...lineChangingStructuralEcho,
      meta: {
        ...lineChangingStructuralEcho.meta,
        kind: 'structure',
      },
    },
  }), false, 'adding or deleting a complete fence still rebuilds the document');
});

test('active-block preview markdown patch echo keeps global preview reset key stable', () => {
  assert.equal(
    isActiveBlockPreviewMarkdownPatchEcho({
      previewCode: 'Alpha **beta**',
      sourcePatchEcho: localBoldEcho,
    }),
    true,
  );

  assert.equal(
    isActiveBlockPreviewMarkdownPatchEcho({
      previewCode: 'Alpha beta',
      sourcePatchEcho: localBoldEcho,
    }),
    true,
  );

  assert.equal(
    resolvePreviewRenderResetKey({
      previousResetKey: 'Alpha beta',
      previewCode: 'Alpha **beta**',
      sourcePatchEcho: localBoldEcho,
    }),
    'Alpha beta',
  );

  assert.equal(
    isActiveBlockPreviewMarkdownPatchEcho({
      previewCode: 'After AI',
      sourcePatchEcho: localAiEcho,
    }),
    true,
  );

  assert.equal(
    resolvePreviewRenderResetKey({
      previousResetKey: 'Alpha beta',
      previewCode: 'Alpha beta',
      sourcePatchEcho: localBoldEcho,
    }),
    'Alpha beta',
  );

  assert.equal(
    resolvePreviewRenderResetKey({
      previousResetKey: 'Alpha beta',
      previewCode: 'Alpha *beta*',
      sourcePatchEcho: localItalicEcho,
    }),
    'Alpha beta',
  );
});

test('code shortcut patch echo can skip active block refresh without changing reset key', () => {
  assert.equal(localCodeEcho.meta.kind, 'code');
  assert.equal(localCodeEcho.meta.skipActiveBlockRefresh, true);
  assert.equal(
    isActiveBlockPreviewMarkdownPatchEcho({
      previewCode: localCodeEcho.source,
      sourcePatchEcho: localCodeEcho,
    }),
    true,
  );
  assert.equal(
    resolvePreviewRenderResetKey({
      previousResetKey: 'Before',
      previewCode: localCodeEcho.source,
      sourcePatchEcho: localCodeEcho,
    }),
    'Before',
  );
});

test('structural active-block code patch echo keeps Final preview reset stable', () => {
  assert.equal(localStructuralCodeEcho.meta.commitPhase, 'structural');
  assert.equal(localStructuralCodeEcho.meta.forceDocumentRefresh, undefined);
  assert.equal(localStructuralCodeEcho.meta.kind, 'code');
  assert.equal(localStructuralCodeEcho.meta.skipActiveBlockRefresh, true);
  assert.equal(
    isActiveBlockPreviewMarkdownPatchEcho({
      previewCode: localStructuralCodeEcho.source,
      sourcePatchEcho: localStructuralCodeEcho,
    }),
    true,
  );
  assert.equal(
    resolvePreviewRenderResetKey({
      previousResetKey: localStructuralCodeEcho.baseSource,
      previewCode: localStructuralCodeEcho.source,
      sourcePatchEcho: localStructuralCodeEcho,
    }),
    localStructuralCodeEcho.baseSource,
  );
});

test('external or stale preview changes still advance the global preview reset key', () => {
  assert.equal(
    isActiveBlockPreviewMarkdownPatchEcho({
      previewCode: 'External edit',
      sourcePatchEcho: localBoldEcho,
    }),
    false,
  );

  assert.equal(
    resolvePreviewRenderResetKey({
      previousResetKey: 'Alpha beta',
      previewCode: 'External edit',
      sourcePatchEcho: null,
    }),
    'External edit',
  );

  assert.equal(
    resolvePreviewRenderResetKey({
      previousResetKey: 'Alpha beta',
      previewCode: 'External edit',
      sourcePatchEcho: localBoldEcho,
    }),
    'External edit',
  );
});
