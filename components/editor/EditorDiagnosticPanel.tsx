import React from 'react';
import { DiagnosticConsolePanel } from '../DiagnosticConsolePanel';
import type { EditorTranslations } from '../../i18n';
import type { ArtifactDiagnostic } from './diagnosticTypes';

export const EditorDiagnosticPanel: React.FC<{
  diagnostics: readonly ArtifactDiagnostic[];
  fixCount: number;
  locale: 'zh' | 'en';
  onBeginFixReviewAll?: () => void;
  onClose?: () => void;
  onRequestLineFocus?: (line: number) => void;
  t: EditorTranslations;
}> = (props) => <DiagnosticConsolePanel {...props} />;
