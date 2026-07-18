import type { HtmlPreviewRenderMode } from './htmlPreviewDocument';
import {
  HTML_PREVIEW_HEIGHT_EPSILON,
  HTML_PREVIEW_MAX_HEIGHT,
  HTML_PREVIEW_MIN_HEIGHT,
} from './htmlPreviewReporter';

type PreviewTheme = 'dark' | 'light';
export type HtmlPreviewCachedSize = { height: number; width: number | null };

const HTML_PREVIEW_SIZE_CACHE_LIMIT = 128;
const htmlPreviewSizeCache = new Map<string, HtmlPreviewCachedSize>();

export const hashHtmlPreviewCacheSource = (source: string) => {
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0;
  }
  return hash >>> 0;
};

export const buildHtmlPreviewSourceCacheKey = ({
  code,
  normalizedDeliveryWidth,
}: {
  code: string;
  normalizedDeliveryWidth: number | undefined;
}) => [
  'html-source',
  normalizedDeliveryWidth ?? 'natural',
  code.length,
  hashHtmlPreviewCacheSource(code),
].join(':');

export const buildHtmlPreviewSizeCacheKey = ({
  code,
  isMobilePreview,
  normalizedDeliveryWidth,
  renderMode,
  theme,
}: {
  code: string;
  isMobilePreview: boolean;
  normalizedDeliveryWidth: number | undefined;
  renderMode: HtmlPreviewRenderMode;
  theme: PreviewTheme;
}) => [
  renderMode,
  theme,
  isMobilePreview ? 'mobile' : 'desktop',
  normalizedDeliveryWidth ?? 'natural',
  code.length,
  hashHtmlPreviewCacheSource(code),
].join(':');

export const readCachedHtmlPreviewSize = (key: string) => {
  const cached = htmlPreviewSizeCache.get(key) ?? null;
  if (!cached) return null;
  htmlPreviewSizeCache.delete(key);
  htmlPreviewSizeCache.set(key, cached);
  return cached;
};

export const cacheHtmlPreviewSize = (key: string, size: HtmlPreviewCachedSize) => {
  if (size.height <= HTML_PREVIEW_MIN_HEIGHT + HTML_PREVIEW_HEIGHT_EPSILON) return;
  if (!htmlPreviewSizeCache.has(key) && htmlPreviewSizeCache.size >= HTML_PREVIEW_SIZE_CACHE_LIMIT) {
    const oldestKey = htmlPreviewSizeCache.keys().next().value;
    if (oldestKey) htmlPreviewSizeCache.delete(oldestKey);
  }
  htmlPreviewSizeCache.set(key, size);
};

// frameId 级（按 morndraft/HTML 块稳定 frameKey 派生的 id）最近真实高度缓存。
// 与 sizeCacheKey（按内容 hash）不同：同一块编辑文案时 frameId 不变，能复用上次真实高度作初始，
// 避免每次内容变化重挂载后 useRef/useState 回退到 MIN 造成的高度横跳（80→真实）。
const RECENT_HEIGHT_BY_FRAME_ID_LIMIT = 128;
const recentHeightByFrameId = new Map<string, number>();

export const readRecentHtmlPreviewHeightByFrameId = (frameId: string): number | null => {
  const cached = recentHeightByFrameId.get(frameId) ?? null;
  if (cached === null) return null;
  recentHeightByFrameId.delete(frameId);
  recentHeightByFrameId.set(frameId, cached);
  return cached;
};

export const cacheRecentHtmlPreviewHeightByFrameId = (frameId: string, height: number) => {
  if (!frameId || height <= HTML_PREVIEW_MIN_HEIGHT + HTML_PREVIEW_HEIGHT_EPSILON) return;
  if (!recentHeightByFrameId.has(frameId) && recentHeightByFrameId.size >= RECENT_HEIGHT_BY_FRAME_ID_LIMIT) {
    const oldestFrameId = recentHeightByFrameId.keys().next().value;
    if (oldestFrameId) recentHeightByFrameId.delete(oldestFrameId);
  }
  recentHeightByFrameId.set(frameId, height);
};

export const normalizeHtmlPreviewHeight = (height: number) => {
  if (!Number.isFinite(height)) return HTML_PREVIEW_MIN_HEIGHT;
  return Math.min(
    HTML_PREVIEW_MAX_HEIGHT,
    Math.max(HTML_PREVIEW_MIN_HEIGHT, Math.ceil(height)),
  );
};

export const normalizeHtmlPreviewWidth = (width: number | null | undefined) => {
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return null;
  return Math.ceil(width);
};

export const shouldIgnoreMobilePreviewMinHeightFallback = ({
  committedHeight,
  hasSettledHeight,
  isMobilePreview,
  nextHeight,
  requiresStableReady,
}: {
  committedHeight: number;
  hasSettledHeight: boolean;
  isMobilePreview: boolean;
  nextHeight: number;
  requiresStableReady: boolean;
}) => (
  isMobilePreview &&
  requiresStableReady &&
  hasSettledHeight &&
  nextHeight <= HTML_PREVIEW_MIN_HEIGHT + HTML_PREVIEW_HEIGHT_EPSILON &&
  committedHeight > HTML_PREVIEW_MIN_HEIGHT + HTML_PREVIEW_HEIGHT_EPSILON
);
