import type React from 'react';
import type {
  PublicDeliveryAdapter,
  PublicDeliveryContentType,
  PublicDeliveryTheme,
} from '@morndraft/public-delivery';

export type {
  PublicDeliveryAdapter,
  PublicDeliveryInput,
} from '@morndraft/public-delivery';

export type PublicWorkspaceLocale = 'zh' | 'en';
export type PublicWorkspaceTheme = PublicDeliveryTheme;
export type PublicWorkspaceMode = 'source' | 'final';

export type PublicContentType = PublicDeliveryContentType;

export type SourceChangeMeta = {
  origin: 'source' | 'final' | 'import' | 'syntax' | 'insert' | 'ai';
  resetDocument?: boolean;
};

export type ImportedDocument = {
  source: string;
  suggestedTitle?: string;
};

export interface PublicImportAdapter {
  importFiles(files: readonly File[]): Promise<ImportedDocument>;
}

export type PublicAiAction = 'generate' | 'modify' | 'summarize' | 'fix';

export interface PublicAiAdapter {
  request(input: {
    action: PublicAiAction;
    instruction?: string;
    source?: string;
    selectedText?: string;
    visibleText?: string;
    signal?: AbortSignal;
  }): Promise<{ text: string; finishReason?: string }>;
}

export type PublicSyntaxEntry = {
  id: string;
  label: string;
  source: string | (() => string | Promise<string>);
};

export type PublicFlatInsertEntry = {
  id: string;
  label: string;
  keywords?: readonly string[];
  source: string | (() => string | Promise<string>);
};

export type PublicTextSelection = {
  start: number;
  end: number;
  text: string;
  sourceText?: string;
  source: string;
};

export type PublicFinalRendererProps = {
  source: string;
  documentEpoch: number;
  locale: PublicWorkspaceLocale;
  theme: PublicWorkspaceTheme;
  onSourceChange(next: string, meta: SourceChangeMeta): void;
  onSelectionChange?(selection: PublicTextSelection | null): void;
  onAiGenerateRequest?(range: { start: number; end: number }): void;
};

export type PublicWorkspaceProps = {
  source: string;
  documentEpoch: number;
  onSourceChange(next: string, meta: SourceChangeMeta): void;
  importAdapter: PublicImportAdapter;
  aiAdapter?: PublicAiAdapter;
  deliveryAdapter?: PublicDeliveryAdapter;
  locale?: PublicWorkspaceLocale;
  theme?: PublicWorkspaceTheme;
  syntaxEntries?: readonly PublicSyntaxEntry[];
  flatInsertEntries?: readonly PublicFlatInsertEntry[];
  initialMode?: PublicWorkspaceMode;
  title?: string;
  finalRenderer?: React.ComponentType<PublicFinalRendererProps>;
  onLocaleChange?(locale: PublicWorkspaceLocale): void;
  onThemeChange?(theme: PublicWorkspaceTheme): void;
  onAboutOpen?(): void;
  onAiSettingsOpen?(): void;
};
