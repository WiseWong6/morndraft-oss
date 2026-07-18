import React, { useMemo } from 'react';
import {
  createMornDraftHtmlSource,
  resolveSwissCatalogPreviewHeight,
  resolveSwissCatalogPreviewWidth,
} from '@morndraft/core';
import type { FinalInsertCommand } from './finalInsertMenuRegistry';
import { getHtmlPreviewIframeSandbox } from './htmlPreviewSecurityPolicy';

const PREVIEW_MAX_WIDTH = 288;
const PREVIEW_SLOT_HEIGHT = 156;
const PREVIEW_MAX_HEIGHT = PREVIEW_SLOT_HEIGHT;
const PREVIEW_MIN_HEIGHT = 92;
const SWISS_CATALOG_BODY_GUTTER = 32;
const PREVIEW_CACHE_LIMIT = 64;
const PREVIEW_CENTERING_STYLE_MARKER = 'data-final-insert-morndraft-preview-centering="true"';

export type FinalInsertMornDraftPreviewModel = {
  frameHeight: number;
  frameWidth: number;
  html: string;
  previewHeight: number;
  previewWidth: number;
  scale: number;
};

const previewModelCache = new Map<string, FinalInsertMornDraftPreviewModel | null>();

export const canPreviewFinalInsertMornDraftCommand = (
  command: FinalInsertCommand | null | undefined,
) => Boolean(
  command?.category === 'MornDraft' &&
  command.mornDraftComponent,
);

const rememberPreviewModel = (
  cacheKey: string,
  model: FinalInsertMornDraftPreviewModel | null,
) => {
  if (previewModelCache.size >= PREVIEW_CACHE_LIMIT) {
    const firstKey = previewModelCache.keys().next().value;
    if (firstKey) previewModelCache.delete(firstKey);
  }
  previewModelCache.set(cacheKey, model);
  return model;
};

const createPreviewCenteredHtml = (html: string, frameHeight: number) => {
  const minHeight = Math.max(1, Math.ceil(frameHeight));
  const style = `<style ${PREVIEW_CENTERING_STYLE_MARKER}>
body {
  min-height: ${minHeight}px !important;
  justify-content: center !important;
  align-items: center !important;
}
</style>`;
  return html.includes('</head>') ? html.replace('</head>', `${style}\n</head>`) : `${style}\n${html}`;
};

export const resolveFinalInsertMornDraftPreviewModel = (
  command: FinalInsertCommand,
): FinalInsertMornDraftPreviewModel | null => {
  if (!canPreviewFinalInsertMornDraftCommand(command)) return null;
  const cacheKey = `${command.id}:${JSON.stringify(command.mornDraftComponent)}`;
  if (previewModelCache.has(cacheKey)) {
    return previewModelCache.get(cacheKey) ?? null;
  }

  const result = createMornDraftHtmlSource(command.mornDraftComponent, { cssMode: 'inline' });
  if (!result.ok || !result.documentSpec || !result.html) return rememberPreviewModel(cacheKey, null);

  const frameWidth = resolveSwissCatalogPreviewWidth(result.documentSpec) + SWISS_CATALOG_BODY_GUTTER;
  const frameHeight = resolveSwissCatalogPreviewHeight(result.documentSpec);
  const scale = Math.min(1, PREVIEW_MAX_WIDTH / frameWidth, PREVIEW_MAX_HEIGHT / frameHeight);
  const previewWidth = Math.max(1, Math.ceil(frameWidth * scale));
  const previewHeight = Math.max(PREVIEW_MIN_HEIGHT, Math.ceil(frameHeight * scale));

  return rememberPreviewModel(cacheKey, {
    frameHeight,
    frameWidth,
    html: createPreviewCenteredHtml(result.html, frameHeight),
    previewHeight,
    previewWidth,
    scale,
  });
};

export const FinalInsertMornDraftPreview: React.FC<{
  command: FinalInsertCommand;
}> = ({ command }) => {
  const model = useMemo(
    () => resolveFinalInsertMornDraftPreviewModel(command),
    [command],
  );
  if (!model) return null;

  return (
    <div
      className="aad-final-insert-morndraft-preview"
      aria-hidden="true"
      data-final-insert-morndraft-preview="true"
      data-preview-command-id={command.id}
    >
      <div
        className="aad-final-insert-morndraft-preview-stage"
        style={{
          '--aad-final-insert-morndraft-preview-slot-height': `${PREVIEW_SLOT_HEIGHT}px`,
          '--aad-final-insert-morndraft-preview-height': `${model.previewHeight}px`,
          '--aad-final-insert-morndraft-preview-width': `${model.previewWidth}px`,
        } as React.CSSProperties}
      >
        <div
          className="aad-final-insert-morndraft-preview-frame-shell"
          style={{
            height: `${model.previewHeight}px`,
            width: `${model.previewWidth}px`,
          }}
        >
          <iframe
            title={`${command.label} preview`}
            tabIndex={-1}
            srcDoc={model.html}
            sandbox={getHtmlPreviewIframeSandbox('srcdoc', 'strict')}
            scrolling="no"
            className="aad-final-insert-morndraft-preview-frame"
            style={{
              height: `${model.frameHeight}px`,
              transform: `scale(${model.scale})`,
              width: `${model.frameWidth}px`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
