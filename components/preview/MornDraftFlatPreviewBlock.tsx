import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import {
  adaptMornDraftFlatComponentSource,
  createDefaultMornDraftFlatItem,
  formatMornDraftFlatDiagnosticMessage,
  getMornDraftFlatStyleFamily,
  MORNDRAFT_FLAT_COMPONENT_CAPABILITIES,
  parseMornDraftHtmlSourceStructure,
  patchMornDraftFlatSourceItems,
  patchMornDraftFlatSourceValues,
  renderSwissCatalogDocumentSpecToHtml,
  resolveSwissCatalogPreviewHeight,
  resolveSwissCatalogPreviewWidth,
  updateMornDraftHtmlSourceComponent,
} from '@morndraft/core';
import type { ArtifactPreviewTranslations } from '../../i18n';
import type { HtmlPreviewSelectionChange } from '../../utils/htmlPreviewBridge';
import {
  getMornDraftFlatLayoutDecision,
  type MornDraftFlatLayoutDecision,
  type PreviewRenderDeliveryAccess,
} from './deliveryAccess';
import { ArtifactErrorBlock } from './ArtifactErrorBlock';
import { BlockHeaderCopyAction, type BlockCopyContentKind } from './BlockHeaderCopyAction';
import { CollapsibleArtifactBlock } from './CollapsibleArtifactBlock';
import type { HtmlPreviewEditCommitMeta } from './useHtmlPreviewEditMode';
import type { PreviewSourceSelectionRange } from './ArtifactPreviewTypes';
import { recordHtmlPreviewRenderProbe } from './htmlPreviewDebug';

type HtmlPreviewComponentProps = {
  code: string;
  copyContentKind?: BlockCopyContentKind;
  copySource?: string;
  headerActions?: React.ReactNode;
  deliveryWidth?: number;
  frameKey?: string;
  label?: string;
  meta?: string;
  hideDefaultMeta?: boolean;
  initialHeight?: number;
  lockInitialHeight?: boolean;
  deferMountUntilVisible?: boolean;
  renderMode?: 'embedded' | 'raw';
  onPreviewReady?: () => void;
  canEdit?: boolean;
  isEditing?: boolean;
  onEditStart?: () => void;
  onEditCommit?: (newCode: string, meta?: HtmlPreviewEditCommitMeta) => void;
  onEditCancel?: () => void;
  onEditDraft?: (newCode: string) => void;
  editCommitStrategy?: 'cached-first' | 'iframe-snapshot-first';
  onBlockActivate?: () => void;
  onSelectionChange?: (selection: HtmlPreviewSelectionChange) => void;
};

type ArtifactDiagnostic = {
  id: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  messageZh?: string;
  messageEn?: string;
  line?: number;
  fix?: { id: string };
  fixId?: string;
};

type AdapterDiagnostic = {
  code: string;
  message: string;
  severity?: string;
  path?: string;
  line?: number;
  column?: number;
};

type MornDraftSourceChangeOptions = {
  commitPhase?: 'input' | 'idle' | 'final' | 'format' | 'structural';
  kind?: 'code' | 'style' | 'text';
  previousCode?: string;
  skipActiveBlockRefresh?: boolean;
};

const getBlockDiagnostic = (
  diagnostics: readonly ArtifactDiagnostic[],
  lineOffset: number,
  code: string,
) => {
  const lineCount = Math.max(1, code.split(/\r?\n/).length);
  const startLine = lineOffset > 0 ? lineOffset + 1 : 1;
  const endLine = startLine + lineCount;
  return diagnostics.find((diagnostic) => (
    diagnostic.code.startsWith('morndraft_flat.') &&
    diagnostic.line &&
    diagnostic.line >= startLine &&
    diagnostic.line <= endLine
  ));
};

const getAdapterErrorLine = (
  diagnostics: readonly AdapterDiagnostic[],
  lineOffset: number,
) => {
  const diagnostic = diagnostics.find((item) => item.line);
  if (!diagnostic?.line) return lineOffset > 0 ? lineOffset + 1 : 1;
  return diagnostic.line + lineOffset;
};

const normalizeMornDraftFlatDiagnosticMessage = (
  diagnostic: { code: string; message?: string },
) => {
  const formatted = formatMornDraftFlatDiagnosticMessage(diagnostic);
  if (typeof formatted === 'string') {
    return { zh: formatted, en: formatted };
  }
  const fallback = diagnostic.message || 'MornDraft flat input could not be rendered.';
  return {
    zh: formatted?.zh || formatted?.en || fallback,
    en: formatted?.en || formatted?.zh || fallback,
  };
};

const formatAdapterDiagnostics = (
  diagnostics: readonly AdapterDiagnostic[],
  locale: 'zh' | 'en',
) =>
  diagnostics
    .map((diagnostic) => {
      const message = normalizeMornDraftFlatDiagnosticMessage(diagnostic);
      const location = diagnostic.line
        ? ` line ${diagnostic.line}${diagnostic.column ? `:${diagnostic.column}` : ''}`
        : diagnostic.path ? ` ${diagnostic.path}` : '';
      return locale === 'zh'
        ? message.zh
        : `[${diagnostic.code}]${location} ${message.en}`;
    })
    .join('\n');

const getAccessDecisionMessage = (
  decision: MornDraftFlatLayoutDecision,
  t: ArtifactPreviewTranslations,
) => {
  if (decision.code === 'service-unavailable') return t.morndraftComponentAccessUnavailableMessage;
  if (decision.code === 'upgrade') return t.morndraftComponentProRequiredMessage;
  return decision.text;
};

const escapeHtmlText = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeReservedHeight = (height: number) => (
  Number.isFinite(height) ? Math.max(1, Math.round(height)) : 320
);

type MornDraftFlatSourceEditEntry = {
  range?: { start?: number; end?: number };
  value?: string;
};

type MornDraftFlatCapability = {
  mode?: string;
  minItems?: number;
  maxItems?: number;
  recommendedMaxItems?: number;
  supportedItemCounts?: readonly number[];
};

type MornDraftFlatStyleFamily = {
  id: string;
  label: string;
  layout: string;
  defaultVariant: string;
  variants: readonly { variant: string; label: string }[];
};

type MornDraftFlatStyleOption = {
  disabled: boolean;
  disabledReason?: string;
  label: string;
  variant: string;
};

type MornDraftFlatStyleMenuPosition = {
  top: number;
  right: number;
};

const STYLE_MENU_SIDE_MARGIN_PX = 8;
const STYLE_MENU_MAX_HEIGHT_PX = 280;
const STYLE_MENU_ITEM_HEIGHT_PX = 34;

const normalizeSelectionText = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();

const buildNormalizedSourceOffsets = (value: string) => {
  let text = '';
  const rawOffsets: number[] = [];
  let pendingSpace = false;
  let started = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (/\s/.test(char)) {
      if (started) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      text += ' ';
      rawOffsets.push(index - 1);
      pendingSpace = false;
    }
    text += char.toLocaleLowerCase();
    rawOffsets.push(index);
    started = true;
  }
  return { rawOffsets, text };
};

const findNormalizedOccurrence = (haystack: string, needle: string, occurrenceIndex: number) => {
  let remaining = Math.max(0, Math.trunc(occurrenceIndex));
  let offset = 0;
  while (offset < haystack.length) {
    const found = haystack.indexOf(needle, offset);
    if (found < 0) return -1;
    if (remaining === 0) return found;
    remaining -= 1;
    offset = found + Math.max(1, needle.length);
  }
  return -1;
};

const resolveMornDraftFlatSelectionRange = (
  selection: HtmlPreviewSelectionChange,
  sourceEditMap: Record<string, MornDraftFlatSourceEditEntry> | undefined,
  source: string,
): PreviewSourceSelectionRange | null => {
  const entry = selection.editPath ? sourceEditMap?.[selection.editPath] : undefined;
  const start = Number(entry?.range?.start);
  const end = Number(entry?.range?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const selectedText = normalizeSelectionText(selection.text);
  if (selectedText) {
    const rawValue = source.slice(start, end);
    const normalized = buildNormalizedSourceOffsets(rawValue);
    const matchStart = findNormalizedOccurrence(
      normalized.text,
      selectedText,
      selection.pathTextOccurrenceIndex ?? 0,
    );
    if (matchStart >= 0) {
      const matchEnd = matchStart + selectedText.length - 1;
      const rawStart = normalized.rawOffsets[matchStart];
      const rawEnd = normalized.rawOffsets[matchEnd];
      if (rawStart !== undefined && rawEnd !== undefined && rawEnd >= rawStart) {
        return { start: start + rawStart, end: start + rawEnd + 1 };
      }
    }
  }
  return { start, end };
};

const isMornDraftFlatDebugEnabled = () => {
  if (typeof window === 'undefined') return false;
  const debugWindow = window as Window & {
    __MORNDRAFT_DEBUG_PREVIEW?: boolean;
    __MORNDRAFT_DEBUG_MORN_DRAFT_FLAT?: boolean;
  };
  return Boolean(
    debugWindow.__MORNDRAFT_DEBUG_PREVIEW ||
    debugWindow.__MORNDRAFT_DEBUG_MORN_DRAFT_FLAT ||
    window.localStorage?.getItem('morndraft.debug.preview') === '1',
  );
};

const getDebugHash = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const debugMornDraftFlat = (event: string, payload: Record<string, unknown>) => {
  if (!isMornDraftFlatDebugEnabled()) return;
  console.info(`[morndraft-flat] ${event}`, payload);
};

const buildMornDraftFlatAccessPlaceholderHtml = (
  decision: MornDraftFlatLayoutDecision,
  message: string,
  reservedHeight: number,
) => {
  const height = normalizeReservedHeight(reservedHeight);
  const isChecking = decision.code === 'checking';
  const placeholderStyle = [
    'box-sizing:border-box',
    `height:${height}px`,
    `min-height:${height}px`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:24px',
    `background:${isChecking ? '#f8fafc' : '#fffaf2'}`,
    `color:${isChecking ? '#475569' : '#8a4b16'}`,
    "font:14px/1.7 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    'text-align:center',
  ].join(';');
  const spinnerStyle = [
    'box-sizing:border-box',
    'width:22px',
    'height:22px',
    'border-radius:999px',
    'border:2px solid rgba(71,85,105,0.2)',
    'border-top-color:#475569',
    'animation:morndraft-flat-access-spin 0.82s linear infinite',
    'margin:0 auto 12px',
  ].join(';');
  const bodyStyle = isChecking
    ? 'max-width:480px;font-weight:600;'
    : 'max-width:520px;font-weight:600;';
  const content = isChecking
    ? [
        '<style>@keyframes morndraft-flat-access-spin{to{transform:rotate(360deg);}}</style>',
        `<div style="${spinnerStyle}" aria-hidden="true"></div>`,
        `<div style="${bodyStyle}">${escapeHtmlText(message)}</div>`,
      ].join('\n')
    : `<div style="${bodyStyle}">${escapeHtmlText(message)}</div>`;
  return [
    `<section data-morndraft-flat-access-placeholder ${isChecking ? 'data-morndraft-flat-access-loading' : 'data-morndraft-flat-access-notice'} style="${placeholderStyle}">`,
    `  ${content}`,
    '</section>',
  ].join('\n');
};

const MornDraftFlatAccessPlaceholderBlock: React.FC<{
  copySource: string;
  decision: MornDraftFlatLayoutDecision;
  label: string;
  message: string;
  reservedHeight: number;
  t: ArtifactPreviewTranslations;
}> = ({
  copySource,
  decision,
  label,
  message,
  reservedHeight,
  t,
}) => {
  const height = normalizeReservedHeight(reservedHeight);
  const isChecking = decision.code === 'checking';
  return (
    <CollapsibleArtifactBlock
      label={label}
      className="aad-html-frame aad-morndraft-flat-access-block flex flex-col"
      copyRole="html-preview"
      resetKey={`morndraft-flat-access:${decision.code}:${height}:${copySource}`}
      actions={(
        <BlockHeaderCopyAction contentKind="html" text={copySource} t={t} />
      )}
      dataAttributes={{
        'data-morndraft-flat-access-block': decision.code,
      }}
      expandLabel={t.expandBlock}
      collapseLabel={t.collapseBlock}
    >
      <section
        className={[
          'aad-morndraft-flat-access-placeholder',
          isChecking ? 'is-checking' : 'is-notice',
        ].filter(Boolean).join(' ')}
        data-morndraft-flat-access-placeholder
        data-morndraft-flat-access-loading={isChecking ? 'true' : undefined}
        data-morndraft-flat-access-notice={!isChecking ? 'true' : undefined}
        style={{
          '--aad-morndraft-flat-access-height': `${height}px`,
        } as React.CSSProperties}
      >
        {isChecking ? (
          <div className="aad-morndraft-flat-access-spinner" aria-hidden="true" />
        ) : null}
        <div className="aad-morndraft-flat-access-message">{message}</div>
      </section>
    </CollapsibleArtifactBlock>
  );
};

const MORNDRAFT_FLAT_EDIT_PATH_ATTR = 'data-morndraft-edit-path';

const stripMornDraftFlatEditPaths = (documentSpec: any) => ({
  ...documentSpec,
  pages: Array.isArray(documentSpec?.pages)
    ? documentSpec.pages.map((page: any) => {
      const pageWithoutEditPaths = { ...(page ?? {}) };
      delete pageWithoutEditPaths.__morndraftEditPaths;
      return {
        ...pageWithoutEditPaths,
        items: Array.isArray(pageWithoutEditPaths.items)
          ? pageWithoutEditPaths.items.map((item: any) => {
            if (!item || typeof item !== 'object') return item;
            const itemWithoutEditPaths = { ...item };
            delete itemWithoutEditPaths.__morndraftEditPaths;
            return itemWithoutEditPaths;
          })
          : pageWithoutEditPaths.items,
      };
    })
    : documentSpec?.pages,
});

const extractMornDraftFlatTextEdits = (
  editedHtml: string,
  sourceEditMap: Record<string, { value?: string }> | undefined,
) => {
  if (typeof DOMParser === 'undefined' || !sourceEditMap) return [];
  const doc = new DOMParser().parseFromString(editedHtml, 'text/html');
  const edits = new Map<string, string>();
  doc.querySelectorAll(`[${MORNDRAFT_FLAT_EDIT_PATH_ATTR}]`).forEach((element) => {
    const path = element.getAttribute(MORNDRAFT_FLAT_EDIT_PATH_ATTR) || '';
    if (!path || !sourceEditMap[path]) return;
    const nextValue = element.textContent ?? '';
    if (nextValue !== sourceEditMap[path].value) edits.set(path, nextValue);
  });
  return Array.from(edits, ([path, value]) => ({ path, value }));
};

const extractMornDraftFlatTextEditsFromPathValues = (
  pathValues: Record<string, string> | undefined,
  sourceEditMap: Record<string, { value?: string }> | undefined,
) => {
  if (!pathValues || !sourceEditMap) return [];
  const edits = new Map<string, string>();
  Object.entries(pathValues).forEach(([path, value]) => {
    if (!sourceEditMap[path]) return;
    if (value !== sourceEditMap[path].value) edits.set(path, value);
  });
  return Array.from(edits, ([path, value]) => ({ path, value }));
};

const debugMornDraftFlatEdit = (message: string, payload?: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  if (
    !(window as Window & { __MORNDRAFT_EDIT_DEBUG?: boolean }).__MORNDRAFT_EDIT_DEBUG &&
    !isMornDraftFlatDebugEnabled()
  ) return;
  console.info(`[morndraft-flat-edit] ${message}`, payload ?? {});
};

const isItemsMutationSupported = (capability: MornDraftFlatCapability | undefined) =>
  capability?.mode === 'items-driven' || capability?.mode === 'bounded-items';

const getNumericCapabilityValue = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const normalizeItemCount = (items: unknown) => (Array.isArray(items) ? items.length : 0);

const getSupportedItemCounts = (capability: MornDraftFlatCapability | undefined) => (
  Array.isArray(capability?.supportedItemCounts)
    ? Array.from(new Set(
        capability.supportedItemCounts
          .filter((count) => Number.isFinite(count))
          .map((count) => Math.trunc(count)),
      )).sort((left, right) => left - right)
    : []
);

const patchMornDraftFlatSourceItemsToCount = ({
  action,
  items,
  layout,
  mutateFromStart,
  source,
  targetItemCount,
  variant,
}: {
  action: 'add' | 'remove';
  items: readonly unknown[];
  layout?: string;
  mutateFromStart: boolean;
  source: string;
  targetItemCount?: number;
  variant?: string;
}) => {
  let nextSource = source;
  let nextItems = [...items];
  const fallbackTarget = action === 'add' ? nextItems.length + 1 : nextItems.length - 1;
  const targetCount = Number.isFinite(targetItemCount)
    ? Math.max(0, Math.trunc(targetItemCount as number))
    : fallbackTarget;

  while (nextItems.length < targetCount) {
    const item = createDefaultMornDraftFlatItem({ layout, variant, items: nextItems });
    const patch = patchMornDraftFlatSourceItems(nextSource, {
      action: mutateFromStart ? 'prepend' : 'append',
      item,
    });
    if (!patch.ok || !('source' in patch) || !patch.changed) return patch;
    nextSource = patch.source;
    nextItems = mutateFromStart ? [item, ...nextItems] : [...nextItems, item];
  }

  while (nextItems.length > targetCount) {
    const patch = patchMornDraftFlatSourceItems(nextSource, {
      action: mutateFromStart ? 'remove-first' : 'remove-last',
    });
    if (!patch.ok || !('source' in patch) || !patch.changed) return patch;
    nextSource = patch.source;
    nextItems = mutateFromStart ? nextItems.slice(1) : nextItems.slice(0, -1);
  }

  return { ok: true, source: nextSource, changed: nextSource !== source };
};

const patchMornDraftFlatComponentItemsToCount = ({
  action,
  component,
  layout,
  mutateFromStart,
  targetItemCount,
  variant,
}: {
  action: 'add' | 'remove';
  component: Record<string, any>;
  layout?: string;
  mutateFromStart: boolean;
  targetItemCount?: number;
  variant?: string;
}) => {
  const currentItems = Array.isArray(component.items) ? component.items : [];
  let nextItems = [...currentItems];
  const fallbackTarget = action === 'add' ? nextItems.length + 1 : nextItems.length - 1;
  const targetCount = Number.isFinite(targetItemCount)
    ? Math.max(0, Math.trunc(targetItemCount as number))
    : fallbackTarget;

  while (nextItems.length < targetCount) {
    const item = createDefaultMornDraftFlatItem({ layout, variant, items: nextItems });
    nextItems = mutateFromStart ? [item, ...nextItems] : [...nextItems, item];
  }

  while (nextItems.length > targetCount) {
    nextItems = mutateFromStart ? nextItems.slice(1) : nextItems.slice(0, -1);
  }

  return {
    changed: nextItems.length !== currentItems.length,
    items: nextItems,
  };
};

export const resolveMornDraftFlatStyleOptions = (
  family: MornDraftFlatStyleFamily | null | undefined,
  renderDeliveryAccess: PreviewRenderDeliveryAccess | undefined,
  t: ArtifactPreviewTranslations,
): MornDraftFlatStyleOption[] => {
  if (!family) return [];
  return family.variants.map((item) => {
    const decision = getMornDraftFlatLayoutDecision(
      renderDeliveryAccess,
      t,
      family.layout,
      item.variant,
    );
    return {
      disabled: !decision.isAllowed,
      label: item.label,
      variant: item.variant,
    };
  });
};

const MornDraftFlatHeaderActions: React.FC<{
  canPatchSource: boolean;
  capability?: MornDraftFlatCapability;
  family?: MornDraftFlatStyleFamily | null;
  itemCount: number;
  items: readonly unknown[];
  styleOptions: readonly MornDraftFlatStyleOption[];
  variant?: string;
  onAddItem: (targetItemCount?: number) => void;
  onRemoveItem: (targetItemCount?: number) => void;
  onSetVariant: (variant: string) => void;
}> = ({
  canPatchSource,
  capability,
  family,
  itemCount,
  items,
  styleOptions,
  variant,
  onAddItem,
  onRemoveItem,
  onSetVariant,
}) => {
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MornDraftFlatStyleMenuPosition | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const hasStyleOptions = Boolean(canPatchSource && family && styleOptions.length > 1);
  const canMutateItems = canPatchSource && isItemsMutationSupported(capability);
  const supportedItemCounts = getSupportedItemCounts(capability);
  const hasSupportedItemCounts = supportedItemCounts.length > 0;
  const supportedItemCountLabel = supportedItemCounts.join(' / ');
  const minItems = (hasSupportedItemCounts ? supportedItemCounts[0] : undefined) ?? getNumericCapabilityValue(capability?.minItems) ?? 1;
  const hardMaxItems = getNumericCapabilityValue(capability?.maxItems);
  const recommendedMaxItems = getNumericCapabilityValue(capability?.recommendedMaxItems);
  const uiMaxItems = recommendedMaxItems ?? hardMaxItems;
  const nextAddItemCount = hasSupportedItemCounts
    ? supportedItemCounts.find((count) => count > itemCount)
    : undefined;
  const nextRemoveItemCount = hasSupportedItemCounts
    ? [...supportedItemCounts].reverse().find((count) => count < itemCount)
    : undefined;
  const removeDisabled = !canMutateItems || (hasSupportedItemCounts ? nextRemoveItemCount === undefined : itemCount <= minItems);
  const addDisabled = !canMutateItems || (hasSupportedItemCounts ? nextAddItemCount === undefined : (uiMaxItems !== undefined && itemCount >= uiMaxItems));
  const activeVariant = styleOptions.find((item) => item.variant === variant);

  const closeStyleMenu = useCallback(() => {
    setStyleMenuOpen(false);
    setMenuPosition(null);
  }, []);

  const getMenuPosition = useCallback((): MornDraftFlatStyleMenuPosition | null => {
    if (typeof window === 'undefined') return null;
    const button = buttonRef.current;
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    const estimatedMenuHeight = Math.min(
      STYLE_MENU_MAX_HEIGHT_PX,
      Math.max(STYLE_MENU_ITEM_HEIGHT_PX, (styleOptions.length * STYLE_MENU_ITEM_HEIGHT_PX) + 8),
    );
    const hasRoomBelow = (window.innerHeight - rect.bottom - STYLE_MENU_SIDE_MARGIN_PX) >= estimatedMenuHeight;
    const top = hasRoomBelow
      ? rect.bottom
      : Math.max(STYLE_MENU_SIDE_MARGIN_PX, rect.top - estimatedMenuHeight);
    return {
      top: Math.round(top),
      right: Math.max(STYLE_MENU_SIDE_MARGIN_PX, Math.round(window.innerWidth - rect.right)),
    };
  }, [styleOptions.length]);

  const updateMenuPosition = useCallback(() => {
    if (!styleMenuOpen) return;
    setMenuPosition(getMenuPosition());
  }, [getMenuPosition, styleMenuOpen]);

  useEffect(() => {
    if (!styleMenuOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      const target = event.target;
      if (target instanceof Element && target.closest('.aad-morndraft-flat-style-menu')) return;
      closeStyleMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeStyleMenu();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [closeStyleMenu, styleMenuOpen]);

  useEffect(() => {
    if (!styleMenuOpen) return undefined;
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [styleMenuOpen, updateMenuPosition]);

  if (!hasStyleOptions && !canMutateItems) return null;

  const stopMenuEvent = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleStyleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    stopMenuEvent(event);
    setStyleMenuOpen((open) => {
      const nextOpen = !open;
      setMenuPosition(nextOpen ? getMenuPosition() : null);
      return nextOpen;
    });
  };

  const handleVariantClick = (option: MornDraftFlatStyleOption) => (event: React.MouseEvent<HTMLButtonElement>) => {
    stopMenuEvent(event);
    if (option.disabled) return;
    closeStyleMenu();
    if (option.variant !== variant) onSetVariant(option.variant);
  };

  const handleAddItem = (event: React.MouseEvent<HTMLButtonElement>) => {
    stopMenuEvent(event);
    if (addDisabled) return;
    onAddItem(hasSupportedItemCounts ? nextAddItemCount : undefined);
  };

  const handleRemoveItem = (event: React.MouseEvent<HTMLButtonElement>) => {
    stopMenuEvent(event);
    if (removeDisabled) return;
    onRemoveItem(hasSupportedItemCounts ? nextRemoveItemCount : undefined);
  };

  const styleMenu = styleMenuOpen && menuPosition && family ? (
    <div
      className="aad-toolbar-menu aad-morndraft-flat-style-menu"
      role="menu"
      aria-label="切换 MornDraft 样式"
      style={{
        maxHeight: `calc(100vh - ${STYLE_MENU_SIDE_MARGIN_PX * 2}px)`,
        overflowY: 'auto',
        position: 'fixed',
        top: `${menuPosition.top}px`,
        right: `${menuPosition.right}px`,
        zIndex: 70,
      }}
      onClick={stopMenuEvent}
    >
      {styleOptions.map((item) => (
        <button
          key={item.variant}
          type="button"
          className={`aad-toolbar-menu-item ${item.variant === variant ? 'is-active' : ''} ${item.disabled ? 'is-disabled' : ''}`.trim()}
          role="menuitem"
          disabled={item.disabled}
          aria-disabled={item.disabled}
          onClick={handleVariantClick(item)}
        >
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <>
      <div
        ref={wrapperRef}
        className="aad-morndraft-flat-header-actions"
        data-copy-remove="true"
        data-morndraft-item-count={items.length}
      >
        {hasStyleOptions && family && (
          <button
            ref={buttonRef}
            type="button"
            className="aad-block-copy-action aad-morndraft-flat-style-button"
            title={`切换${family.label}样式`}
            aria-label={`切换${family.label}样式`}
            aria-expanded={styleMenuOpen}
            aria-haspopup="menu"
            onClick={handleStyleToggle}
          >
            <span>{activeVariant?.label ?? '样式'}</span>
            <ChevronDown size={12} />
          </button>
        )}
        {canMutateItems && (
          <span className="aad-morndraft-flat-item-controls" aria-label="MornDraft items 控制">
            <button
              type="button"
              className="aad-icon-button aad-morndraft-flat-item-button"
              title={hasSupportedItemCounts
                ? `减少 item，仅支持 ${supportedItemCountLabel} 个`
                : `减少 item，最少 ${minItems} 个`}
              aria-label="减少 item"
              disabled={removeDisabled}
              onClick={handleRemoveItem}
            >
              <Minus size={13} />
            </button>
            <button
              type="button"
              className="aad-icon-button aad-morndraft-flat-item-button"
              title={hasSupportedItemCounts
                ? `增加 item，仅支持 ${supportedItemCountLabel} 个`
                : recommendedMaxItems
                ? `增加 item，建议最多 ${recommendedMaxItems} 个`
                : hardMaxItems
                  ? `增加 item，最多 ${hardMaxItems} 个`
                  : '增加 item'}
              aria-label="增加 item"
              disabled={addDisabled}
              onClick={handleAddItem}
            >
              <Plus size={13} />
            </button>
          </span>
        )}
      </div>
      {styleMenu && typeof document !== 'undefined' ? createPortal(styleMenu, document.body) : styleMenu}
    </>
  );
};

export const MornDraftHtmlSourcePreviewBlock: React.FC<{
  code: string;
  frameKey?: string;
  renderDeliveryAccess?: PreviewRenderDeliveryAccess;
  HtmlPreviewComponent: React.ComponentType<HtmlPreviewComponentProps>;
  canEdit?: boolean;
  onCodeChange?: (newCode: string, options?: MornDraftSourceChangeOptions) => void;
  onBlockActivate?: () => void;
  onSelectionChange?: (selection: HtmlPreviewSelectionChange) => void;
  t: ArtifactPreviewTranslations;
}> = ({
  code,
  frameKey,
  renderDeliveryAccess,
  HtmlPreviewComponent,
  canEdit = false,
  onCodeChange,
  onBlockActivate,
  onSelectionChange,
  t,
}) => {
  recordHtmlPreviewRenderProbe({ code, frameKey, kind: 'morndraft-html-source' });
  const [renderCode, setRenderCode] = useState(code);
  const [htmlEditing, setHtmlEditing] = useState(false);
  const sourceCodeForPatchRef = useRef(code);
  const pendingInternalSourceEchoesRef = useRef(new Set<string>());
  const latestInternalPatchSourceRef = useRef<string | null>(null);

  useEffect(() => {
    const pendingInternalEchoes = pendingInternalSourceEchoesRef.current;
    if (pendingInternalEchoes.delete(code)) {
      if (latestInternalPatchSourceRef.current === code) {
        sourceCodeForPatchRef.current = code;
      }
      return;
    }
    pendingInternalEchoes.clear();
    latestInternalPatchSourceRef.current = null;
    sourceCodeForPatchRef.current = code;
    setRenderCode(code);
  }, [code]);

  const structure = useMemo(() => parseMornDraftHtmlSourceStructure(renderCode), [renderCode]);
  const metadata = structure.metadata as { layout?: unknown; variant?: unknown } | null;
  const component = structure.ok && structure.component && typeof structure.component === 'object'
    ? structure.component as Record<string, any>
    : null;
  const layout = typeof component?.layout === 'string'
    ? component.layout
    : typeof metadata?.layout === 'string' ? metadata.layout : undefined;
  const variant = typeof component?.variant === 'string'
    ? component.variant
    : typeof metadata?.variant === 'string' ? metadata.variant : undefined;
  const pair = layout && variant ? `${layout}/${variant}` : null;
  const capability = pair
    ? MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[pair as keyof typeof MORNDRAFT_FLAT_COMPONENT_CAPABILITIES] as MornDraftFlatCapability | undefined
    : undefined;
  const family = getMornDraftFlatStyleFamily(layout, variant);
  const styleOptions = resolveMornDraftFlatStyleOptions(family, renderDeliveryAccess, t);
  const flatItems = Array.isArray(component?.items) ? component.items : [];
  const canPatchStructure = Boolean(canEdit && onCodeChange && component);
  const documentSpec = structure.validation?.ok ? structure.validation.documentSpec : null;
  const deliveryWidth = documentSpec ? resolveSwissCatalogPreviewWidth(documentSpec) : undefined;
  const reservedHeight = documentSpec ? resolveSwissCatalogPreviewHeight(documentSpec) : undefined;
  const htmlSourceEditModel = useMemo(() => {
    if (!component) return null;
    const source = JSON.stringify(component, null, 2);
    const validation = adaptMornDraftFlatComponentSource(source);
    if (!validation.ok || !validation.sourceEditMap || !Object.keys(validation.sourceEditMap).length) return null;
    const rendered = renderSwissCatalogDocumentSpecToHtml(validation.documentSpec);
    if (!rendered.ok) return null;
    return {
      html: rendered.html,
      source,
      sourceEditMap: validation.sourceEditMap,
    };
  }, [component]);
  const canUseStructuredHtmlSourceEdit = Boolean(canEdit && onCodeChange && htmlSourceEditModel);
  const layoutDecision = getMornDraftFlatLayoutDecision(
    renderDeliveryAccess,
    t,
    layout,
    variant,
  );

  const commitInternalSourceChange = useCallback((newCode: string, options?: MornDraftSourceChangeOptions) => {
    const previousCode = sourceCodeForPatchRef.current;
    setRenderCode(newCode);
    sourceCodeForPatchRef.current = newCode;
    pendingInternalSourceEchoesRef.current.add(newCode);
    latestInternalPatchSourceRef.current = newCode;
    onCodeChange?.(newCode, { ...options, previousCode });
  }, [onCodeChange]);

  if (!structure.ok && structure.reason === 'invalid-component-metadata') {
    const adapterDiagnostics: AdapterDiagnostic[] = structure.diagnostics.length
      ? structure.diagnostics
      : [{ code: 'morndraft_flat.output_invalid', severity: 'error', message: 'MornDraft flat input could not be rendered.' }];
    const errorLine = getAdapterErrorLine(adapterDiagnostics, 0);
    const message = formatAdapterDiagnostics(adapterDiagnostics, t.locale);

    return (
      <ArtifactErrorBlock
        t={t}
        label={t.morndraftComponentInvalid}
        line={errorLine}
        message={message}
        className="aad-json-block aad-json-error aad-document-spec-error"
        copyRole="morndraft-html-source-error"
        resetKey={`morndraft-html-source-error:${renderCode}`}
        canEditSource={Boolean(canEdit && onCodeChange)}
        sourceCode={renderCode}
        sourceLanguage="html"
        sourceStartLine={1}
        onSourceCodeChange={commitInternalSourceChange}
      />
    );
  }

  const handleSetFlatStyle = (nextVariant: string) => {
    if (!canPatchStructure || !nextVariant || nextVariant === variant) return;
    const patch = updateMornDraftHtmlSourceComponent(sourceCodeForPatchRef.current, (nextComponent: Record<string, any>) => {
      nextComponent.variant = nextVariant;
    });
    if (!patch.ok || !patch.changed) return;
    commitInternalSourceChange(patch.html, { commitPhase: 'structural', kind: 'style' });
  };

  const handleMutateFlatItems = (action: 'add' | 'remove', targetItemCount?: number) => {
    if (!canPatchStructure) return;
    const mutateFromStart = layout === 'map' && variant === 'pyramid-inverted';
    const patch = updateMornDraftHtmlSourceComponent(sourceCodeForPatchRef.current, (nextComponent: Record<string, any>) => {
      const nextItems = patchMornDraftFlatComponentItemsToCount({
        action,
        component: nextComponent,
        layout,
        mutateFromStart,
        targetItemCount,
        variant,
      });
      if (nextItems.changed) nextComponent.items = nextItems.items;
    });
    if (!patch.ok || !patch.changed) return;
    commitInternalSourceChange(patch.html, { commitPhase: 'structural', kind: 'code' });
  };

  const handleHtmlEditCommit = (newCode: string, meta?: HtmlPreviewEditCommitMeta) => {
    setHtmlEditing(false);
    if (!newCode || newCode === sourceCodeForPatchRef.current) return;
    if (canUseStructuredHtmlSourceEdit && htmlSourceEditModel) {
      const pathValueEdits = extractMornDraftFlatTextEditsFromPathValues(
        meta?.pathValues,
        htmlSourceEditModel.sourceEditMap,
      );
      const edits = pathValueEdits.length
        ? pathValueEdits
        : extractMornDraftFlatTextEdits(newCode, htmlSourceEditModel.sourceEditMap);
      debugMornDraftFlatEdit('html source commit received', {
        commitSource: meta?.commitSource,
        editCount: edits.length,
        pathValueCount: meta?.pathValues ? Object.keys(meta.pathValues).length : undefined,
        usedPathValues: pathValueEdits.length > 0,
      });
      if (!edits.length) return;
      const sourcePatch = patchMornDraftFlatSourceValues(htmlSourceEditModel.source, edits);
      if (!sourcePatch.ok || !('source' in sourcePatch) || !sourcePatch.changed) {
        setRenderCode(sourceCodeForPatchRef.current);
        return;
      }
      const patchedValidation = adaptMornDraftFlatComponentSource(sourcePatch.source);
      if (!patchedValidation.ok) {
        setRenderCode(sourceCodeForPatchRef.current);
        return;
      }
      const htmlPatch = updateMornDraftHtmlSourceComponent(
        sourceCodeForPatchRef.current,
        () => patchedValidation.component,
      );
      if (!htmlPatch.ok) {
        setRenderCode(sourceCodeForPatchRef.current);
        return;
      }
      if (htmlPatch.changed) commitInternalSourceChange(htmlPatch.html, { commitPhase: 'final', kind: 'text' });
      return;
    }
    commitInternalSourceChange(newCode, { commitPhase: 'final', kind: 'code' });
  };

  if (!layoutDecision.isAllowed) {
    const height = normalizeReservedHeight(reservedHeight ?? 320);
    return (
      <MornDraftFlatAccessPlaceholderBlock
        copySource={renderCode}
        decision={layoutDecision}
        label={t.morndraftComponent}
        message={getAccessDecisionMessage(layoutDecision, t)}
        reservedHeight={height}
        t={t}
      />
    );
  }

  return (
    <HtmlPreviewComponent
      code={canUseStructuredHtmlSourceEdit && htmlSourceEditModel ? htmlSourceEditModel.html : renderCode}
      deliveryWidth={deliveryWidth}
      frameKey={frameKey}
      initialHeight={reservedHeight}
      label={t.morndraftComponent}
      hideDefaultMeta
      copyContentKind="html"
      copySource={renderCode}
      headerActions={(
        <MornDraftFlatHeaderActions
          canPatchSource={canPatchStructure}
          capability={capability}
          family={family}
          itemCount={normalizeItemCount(flatItems)}
          items={flatItems}
          styleOptions={styleOptions}
          variant={variant}
          onAddItem={(targetItemCount) => handleMutateFlatItems('add', targetItemCount)}
          onRemoveItem={(targetItemCount) => handleMutateFlatItems('remove', targetItemCount)}
          onSetVariant={handleSetFlatStyle}
        />
      )}
      renderMode="raw"
      deferMountUntilVisible
      canEdit={Boolean(canEdit && onCodeChange)}
      isEditing={htmlEditing}
      onEditStart={() => setHtmlEditing(true)}
      onEditCommit={handleHtmlEditCommit}
      onEditCancel={() => setHtmlEditing(false)}
      editCommitStrategy="iframe-snapshot-first"
      onBlockActivate={onBlockActivate}
      onSelectionChange={onSelectionChange}
    />
  );
};

export const MornDraftFlatPreviewBlock: React.FC<{
  code: string;
  frameKey?: string;
  lineOffset?: number;
  renderDeliveryAccess?: PreviewRenderDeliveryAccess;
  HtmlPreviewComponent: React.ComponentType<HtmlPreviewComponentProps>;
  diagnostics?: readonly ArtifactDiagnostic[];
  isAiFixBusy?: boolean;
  onBeginFixReview?: (fixId: string) => void;
  onRequestAiFix?: (diagnostic: ArtifactDiagnostic) => void;
  repairMode?: 'ai' | 'deterministic';
  canEdit?: boolean;
  onCodeChange?: (newCode: string, options?: MornDraftSourceChangeOptions) => void;
  onSelectionChange?: (
    selection: HtmlPreviewSelectionChange,
    sourceSelectionRange?: PreviewSourceSelectionRange | null,
  ) => void;
  t: ArtifactPreviewTranslations;
}> = ({
  code,
  frameKey,
  lineOffset = 0,
  renderDeliveryAccess,
  HtmlPreviewComponent,
  diagnostics = [],
  isAiFixBusy = false,
  onBeginFixReview,
  onRequestAiFix,
  repairMode = 'deterministic',
  canEdit = false,
  onCodeChange,
  onSelectionChange,
  t,
}) => {
  const [renderCode, setRenderCode] = useState(code);
  const [flatEditing, setFlatEditing] = useState(false);
  const sourceCodeForPatchRef = useRef(code);
  const pendingInternalSourceEchoesRef = useRef(new Set<string>());
  const latestInternalPatchSourceRef = useRef<string | null>(null);

  useEffect(() => {
    const pendingInternalEchoes = pendingInternalSourceEchoesRef.current;
    if (pendingInternalEchoes.delete(code)) {
      if (latestInternalPatchSourceRef.current === code) {
        sourceCodeForPatchRef.current = code;
      }
      return;
    }
    pendingInternalEchoes.clear();
    latestInternalPatchSourceRef.current = null;
    sourceCodeForPatchRef.current = code;
    setRenderCode(code);
  }, [code]);

  const result = useMemo(() => adaptMornDraftFlatComponentSource(renderCode), [renderCode]);
  const commitInternalSourceChange = useCallback((newCode: string, options?: MornDraftSourceChangeOptions) => {
    const previousCode = sourceCodeForPatchRef.current;
    setRenderCode(newCode);
    sourceCodeForPatchRef.current = newCode;
    pendingInternalSourceEchoesRef.current.add(newCode);
    latestInternalPatchSourceRef.current = newCode;
    onCodeChange?.(newCode, { ...options, previousCode });
  }, [onCodeChange]);
  const handleRawSourceChange = commitInternalSourceChange;

  if (result.ok) {
    const metadata = result.metadata as { layout?: unknown; variant?: unknown };
    const layout = typeof metadata.layout === 'string' ? metadata.layout : undefined;
    const variant = typeof metadata.variant === 'string' ? metadata.variant : undefined;
    const deliveryWidth = resolveSwissCatalogPreviewWidth(result.documentSpec);
    const reservedHeight = resolveSwissCatalogPreviewHeight(result.documentSpec);
    const layoutDecision = getMornDraftFlatLayoutDecision(
      renderDeliveryAccess,
      t,
      layout,
      variant,
    );

    if (!layoutDecision.isAllowed) {
      debugMornDraftFlat('access-placeholder', {
        accountPlan: renderDeliveryAccess?.entitlement?.account_plan ?? null,
        codeHash: getDebugHash(renderCode),
        decision: layoutDecision.code,
        deliveryWidth,
        frameKey: frameKey ?? null,
        hasEntitlement: Boolean(renderDeliveryAccess?.entitlement),
        isLoading: Boolean(renderDeliveryAccess?.isLoading),
        layout: layout ?? null,
        reservedHeight,
        tier: layoutDecision.tier,
        variant: variant ?? null,
      });
      return (
        <HtmlPreviewComponent
          code={buildMornDraftFlatAccessPlaceholderHtml(
            layoutDecision,
            getAccessDecisionMessage(layoutDecision, t),
            reservedHeight,
          )}
          deliveryWidth={deliveryWidth}
          frameKey={frameKey}
          initialHeight={reservedHeight}
          lockInitialHeight
          label={t.morndraftComponent}
          hideDefaultMeta
          copyContentKind="morndraft"
          copySource={renderCode}
          deferMountUntilVisible
        />
      );
    }

    const canUseFlatTextEdit = Boolean(
      canEdit &&
      onCodeChange &&
      result.sourceEditMap &&
      Object.keys(result.sourceEditMap).length,
    );
    const pair = layout && variant ? `${layout}/${variant}` : '';
    const capability = pair
      ? MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[pair as keyof typeof MORNDRAFT_FLAT_COMPONENT_CAPABILITIES] as MornDraftFlatCapability | undefined
      : undefined;
    const family = layout && variant
      ? getMornDraftFlatStyleFamily(layout, variant) as MornDraftFlatStyleFamily | null
      : null;
    const styleOptions = resolveMornDraftFlatStyleOptions(family, renderDeliveryAccess, t);
    const normalizedInput = result.normalizedInput as { items?: unknown[] } | null;
    const flatItems = Array.isArray(normalizedInput?.items) ? normalizedInput.items : [];
    const renderSpec = canUseFlatTextEdit
      ? result.documentSpec
      : stripMornDraftFlatEditPaths(result.documentSpec);
    const rendered = renderSwissCatalogDocumentSpecToHtml(renderSpec);
    if (rendered.ok) {
      debugMornDraftFlat('allowed-render', {
        canEdit: canUseFlatTextEdit,
        codeHash: getDebugHash(renderCode),
        deliveryWidth,
        frameKey: frameKey ?? null,
        isLoading: Boolean(renderDeliveryAccess?.isLoading),
        layout: layout ?? null,
        reservedHeight,
        sourceEditPathCount: result.sourceEditMap ? Object.keys(result.sourceEditMap).length : 0,
        variant: variant ?? null,
      });
      const applyFlatHtmlEdit = (newHtml: string, meta?: HtmlPreviewEditCommitMeta) => {
        setFlatEditing(false);
        if (!canUseFlatTextEdit) {
          debugMornDraftFlatEdit('commit ignored', { reason: 'flat text edit unavailable' });
          return;
        }
        debugMornDraftFlatEdit('pathValues vs sourceEditMap', {
          pathValues: meta?.pathValues,
          mapValues: Object.fromEntries(
            Object.entries(result.sourceEditMap ?? {}).map(([k, v]) => [k, (v as { value?: string })?.value]),
          ),
        });
        const pathValueEdits = extractMornDraftFlatTextEditsFromPathValues(meta?.pathValues, result.sourceEditMap);
        const edits = pathValueEdits.length
          ? pathValueEdits
          : extractMornDraftFlatTextEdits(newHtml, result.sourceEditMap);
        debugMornDraftFlatEdit('commit received', {
          commitSource: meta?.commitSource,
          editCount: edits.length,
          markerCount: meta?.markerCount,
          pathValueCount: meta?.pathValues ? Object.keys(meta.pathValues).length : undefined,
          sourcePathCount: Object.keys(result.sourceEditMap ?? {}).length,
          usedPathValues: pathValueEdits.length > 0,
        });
        if (!edits.length) {
          debugMornDraftFlatEdit('edits empty — aborting patch', {
            pathValueKeys: meta?.pathValues ? Object.keys(meta.pathValues) : undefined,
            sourceEditMapKeys: Object.keys(result.sourceEditMap ?? {}),
            newHtmlLength: newHtml.length,
          });
          return;
        }
        const patch = patchMornDraftFlatSourceValues(sourceCodeForPatchRef.current, edits);
        debugMornDraftFlatEdit('patch result', {
          changed: patch.ok && 'changed' in patch ? patch.changed : false,
          ok: patch.ok,
        });
        if (!patch.ok) {
          setRenderCode(sourceCodeForPatchRef.current);
          return;
        }
        if (patch.ok && 'source' in patch && patch.changed) {
          commitInternalSourceChange(patch.source, { commitPhase: 'final', kind: 'text' });
        }
      };
      const handleSetFlatStyle = (nextVariant: string) => {
        if (!canUseFlatTextEdit || !nextVariant || nextVariant === variant) return;
        const patch = patchMornDraftFlatSourceValues(sourceCodeForPatchRef.current, [
          { path: '$.variant', value: nextVariant },
        ]);
        if (!patch.ok || !('source' in patch) || !patch.changed) return;
        const validation = adaptMornDraftFlatComponentSource(patch.source);
        if (!validation.ok) {
          debugMornDraftFlatEdit('style patch rejected', { nextVariant });
          return;
        }
        commitInternalSourceChange(patch.source, { commitPhase: 'structural', kind: 'style' });
      };
      const handleAddFlatItem = (targetItemCount?: number) => {
        if (!canUseFlatTextEdit) return;
        const mutateFromStart = layout === 'map' && variant === 'pyramid-inverted';
        const patch = patchMornDraftFlatSourceItemsToCount({
          action: 'add',
          items: flatItems,
          layout,
          mutateFromStart,
          source: sourceCodeForPatchRef.current,
          targetItemCount,
          variant,
        });
        if (!patch.ok || !('source' in patch) || !patch.changed) return;
        const validation = adaptMornDraftFlatComponentSource(patch.source);
        if (!validation.ok) {
          debugMornDraftFlatEdit('item add rejected', {
            diagnostics: validation.diagnostics.map((diagnostic) => diagnostic.code),
          });
          return;
        }
        commitInternalSourceChange(patch.source, { commitPhase: 'structural', kind: 'code' });
      };
      const handleRemoveFlatItem = (targetItemCount?: number) => {
        if (!canUseFlatTextEdit) return;
        const mutateFromStart = layout === 'map' && variant === 'pyramid-inverted';
        const patch = patchMornDraftFlatSourceItemsToCount({
          action: 'remove',
          items: flatItems,
          layout,
          mutateFromStart,
          source: sourceCodeForPatchRef.current,
          targetItemCount,
          variant,
        });
        if (!patch.ok || !('source' in patch) || !patch.changed) return;
        const validation = adaptMornDraftFlatComponentSource(patch.source);
        if (!validation.ok) {
          debugMornDraftFlatEdit('item remove rejected', {
            diagnostics: validation.diagnostics.map((diagnostic) => diagnostic.code),
          });
          return;
        }
        commitInternalSourceChange(patch.source, { commitPhase: 'structural', kind: 'code' });
      };
      const handleFlatSelectionChange = (selection: HtmlPreviewSelectionChange) => {
        onSelectionChange?.(
          selection,
          resolveMornDraftFlatSelectionRange(selection, result.sourceEditMap, renderCode),
        );
      };
      return (
        <HtmlPreviewComponent
          code={rendered.html}
          deliveryWidth={deliveryWidth}
          frameKey={frameKey}
          initialHeight={reservedHeight}
          label={t.morndraftComponent}
          hideDefaultMeta
          copyContentKind="morndraft"
          copySource={renderCode}
          deferMountUntilVisible
          headerActions={(
            <MornDraftFlatHeaderActions
              canPatchSource={canUseFlatTextEdit}
              capability={capability}
              family={family}
              itemCount={normalizeItemCount(normalizedInput?.items)}
              items={flatItems}
              styleOptions={styleOptions}
              variant={variant}
              onAddItem={handleAddFlatItem}
              onRemoveItem={handleRemoveFlatItem}
              onSetVariant={handleSetFlatStyle}
            />
          )}
          canEdit={canUseFlatTextEdit}
          isEditing={flatEditing}
          onEditStart={canUseFlatTextEdit ? () => setFlatEditing(true) : undefined}
          onEditCommit={canUseFlatTextEdit ? applyFlatHtmlEdit : undefined}
          editCommitStrategy={canUseFlatTextEdit ? 'iframe-snapshot-first' : undefined}
          onSelectionChange={handleFlatSelectionChange}
        />
      );
    }
  }

  const adapterDiagnostics: AdapterDiagnostic[] = result.diagnostics.length
    ? result.diagnostics
    : [{ code: 'morndraft_flat.output_invalid', severity: 'error', message: 'MornDraft flat input could not be rendered.' }];
  const errorLine = getAdapterErrorLine(adapterDiagnostics, lineOffset);
  const blockDiagnostic = getBlockDiagnostic(diagnostics, lineOffset, renderCode);
  const blockDiagnosticMessage = blockDiagnostic
    ? (t.locale === 'zh'
        ? blockDiagnostic.messageZh || blockDiagnostic.messageEn
        : blockDiagnostic.messageEn || blockDiagnostic.messageZh)
    : null;
  const message = blockDiagnosticMessage || formatAdapterDiagnostics(adapterDiagnostics, t.locale);

  return (
    <ArtifactErrorBlock
      t={t}
      label={t.morndraftComponentInvalid}
      line={blockDiagnostic?.line ?? errorLine}
      message={message}
      className="aad-json-block aad-json-error aad-document-spec-error"
      copyRole="morndraft-flat-error"
      resetKey={`morndraft-flat-error:${renderCode}`}
      diagnostic={blockDiagnostic}
      isAiFixBusy={isAiFixBusy}
      onBeginFixReview={onBeginFixReview}
      onRequestAiFix={onRequestAiFix}
      repairMode={repairMode}
      canEditSource={Boolean(canEdit && onCodeChange)}
      sourceCode={renderCode}
      sourceLanguage="morndraft"
      sourceStartLine={lineOffset > 0 ? lineOffset + 1 : 1}
      onSourceCodeChange={handleRawSourceChange}
    />
  );
};
