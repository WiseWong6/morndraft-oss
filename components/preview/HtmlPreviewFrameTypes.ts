import type { ReactNode } from 'react';
import type { ArtifactPreviewTranslations } from '../../i18n';
import type { BlockCopyContentKind } from './BlockHeaderCopyAction';
import type { HtmlPreviewRenderMode } from './htmlPreviewDocument';
import type { MobileHtmlChromeMode } from './PreviewViewportContext';
import type { HtmlPreviewSelectionChange } from '../../utils/htmlPreviewBridge';
import type { MobileHtmlPreviewFallbackMode } from './useMobileHtmlPreviewImages';
import type { HtmlPreviewEditCommitMeta, HtmlPreviewEditCommitStrategy } from './useHtmlPreviewEditMode';

export type PreviewTheme = 'dark' | 'light';
export type HtmlPreviewSecurityMode = 'liveCompat' | 'publicStrict';

export type HtmlPreviewFrameProps = {
  code: string;
  copyContentKind?: BlockCopyContentKind; copySource?: string;
  deferMountUntilVisible?: boolean; deliveryWidth?: number;
  editCommitStrategy?: HtmlPreviewEditCommitStrategy;
  frameKey?: string; headerActions?: ReactNode; hideDefaultMeta?: boolean;
  enableFullscreen?: boolean;
  initialHeight?: number; isMobilePreview?: boolean; label?: string;
  lockInitialHeight?: boolean; meta?: string; mobileChromeMode?: MobileHtmlChromeMode;
  mobileFallbackMode?: MobileHtmlPreviewFallbackMode; renderMode?: HtmlPreviewRenderMode;
  securityMode?: HtmlPreviewSecurityMode;
  onPreviewReady?: () => void; onPreviewPendingChange?: (isPending: boolean) => void;
  canEdit?: boolean; isEditing?: boolean;
  onEditStart?: () => void; onEditCommit?: (newCode: string, meta?: HtmlPreviewEditCommitMeta) => void; onEditCancel?: () => void; onEditDraft?: (newCode: string) => void;
  onBlockActivate?: () => void;
  onSelectionChange?: (selection: HtmlPreviewSelectionChange) => void;
  t: ArtifactPreviewTranslations; theme: PreviewTheme;
};
