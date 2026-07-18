export type ArtifactFix = {
  id: string;
  labelZh?: string;
  labelEn?: string;
  scope?: string;
  range: { start: number; end: number };
  replacement: string;
  preview?: { before?: string; after?: string } | null;
};

export type ArtifactDiagnostic = {
  id: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  messageZh: string;
  messageEn?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  fix?: ArtifactFix;
  fixId?: string;
};

export type ArtifactFixPreviewLine = {
  id: string;
  line: number;
  labelZh?: string;
  labelEn?: string;
  before: string;
  after: string;
};

export type ArtifactFixReview = {
  id: string;
  mode: 'single' | 'all';
  source: string;
  nextSource: string;
  fixes: ArtifactFix[];
  previewLines: ArtifactFixPreviewLine[];
};

export type ArtifactAppliedFix = {
  id: string;
  mode: 'single' | 'all';
  source: string;
  nextSource: string;
  line: number;
  fixCount: number;
};
