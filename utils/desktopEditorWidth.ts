export const DESKTOP_EDITOR_MIN_WIDTH = 280;
export const DEFAULT_DESKTOP_EDITOR_WIDTH = 420;
export const DESKTOP_PREVIEW_MIN_WIDTH_RATIO = 0.5;
export const DESKTOP_DRAFT_SIDEBAR_FALLBACK_WIDTH = 260;

export type DesktopEditorWidthBounds = {
  canExpand: boolean;
  maxWidth: number;
  minWidth: number;
};

type ResolveDesktopEditorWidthBoundsInput = {
  draftSidebarWidth: number | null | undefined;
  editorMinWidth?: number;
  mainWidth: number | null | undefined;
  previewMinWidthRatio?: number;
};

type InitialDesktopEditorWidthInput = {
  draftSidebarWidth?: number | null | undefined;
  preferredWidth?: number | null | undefined;
  viewportWidth: number | null | undefined;
};

const sanitizePositiveInteger = (value: number | null | undefined) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
};

const sanitizePositiveRatio = (value: number | null | undefined) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

export const resolveDesktopEditorWidthBounds = ({
  draftSidebarWidth,
  editorMinWidth = DESKTOP_EDITOR_MIN_WIDTH,
  mainWidth,
  previewMinWidthRatio = DESKTOP_PREVIEW_MIN_WIDTH_RATIO,
}: ResolveDesktopEditorWidthBoundsInput): DesktopEditorWidthBounds => {
  const measuredMainWidth = sanitizePositiveInteger(mainWidth);
  const measuredDraftSidebarWidth = sanitizePositiveInteger(draftSidebarWidth);
  const resolvedPreviewMinWidth = Math.round(measuredMainWidth * sanitizePositiveRatio(previewMinWidthRatio));
  const maxWidth = Math.max(
    0,
    measuredMainWidth - measuredDraftSidebarWidth - resolvedPreviewMinWidth,
  );
  const resolvedEditorMinWidth = Math.min(
    Math.max(1, sanitizePositiveInteger(editorMinWidth)),
    maxWidth,
  );

  return {
    canExpand: maxWidth > 0 && maxWidth >= resolvedEditorMinWidth,
    maxWidth,
    minWidth: resolvedEditorMinWidth,
  };
};

export const areDesktopEditorWidthBoundsEqual = (
  left: DesktopEditorWidthBounds,
  right: DesktopEditorWidthBounds,
) => (
  left.canExpand === right.canExpand &&
  left.maxWidth === right.maxWidth &&
  left.minWidth === right.minWidth
);

export const clampDesktopEditorWidth = (
  width: number | null | undefined,
  bounds: DesktopEditorWidthBounds,
) => {
  const requestedWidth = sanitizePositiveInteger(width);
  if (requestedWidth === 0 || bounds.maxWidth <= 0) return 0;
  if (requestedWidth < bounds.minWidth) return Math.min(bounds.minWidth, bounds.maxWidth);
  return Math.min(requestedWidth, bounds.maxWidth);
};

export const getInitialDesktopEditorWidth = ({
  draftSidebarWidth = DESKTOP_DRAFT_SIDEBAR_FALLBACK_WIDTH,
  preferredWidth,
  viewportWidth,
}: InitialDesktopEditorWidthInput) => {
  const measuredViewportWidth = sanitizePositiveInteger(viewportWidth);
  const bounds = resolveDesktopEditorWidthBounds({
    draftSidebarWidth,
    mainWidth: measuredViewportWidth,
  });
  const resolvedPreferredWidth = sanitizePositiveInteger(preferredWidth) ||
    bounds.maxWidth ||
    DEFAULT_DESKTOP_EDITOR_WIDTH;

  return clampDesktopEditorWidth(resolvedPreferredWidth, bounds);
};
