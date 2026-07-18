import React from 'react';
import type { ArtifactDiagnostic, ArtifactFix } from './diagnosticTypes';
import type { EditorTranslations } from '../../i18n';
import { DiagnosticConsoleButton } from '../DiagnosticConsoleButton';

export const EditorDiagnosticConsole: React.FC<{
  diagnostics: readonly ArtifactDiagnostic[];
  fixes: readonly ArtifactFix[];
  isOpen: boolean;
  onToggle: () => void;
  t: EditorTranslations;
}> = ({ diagnostics, fixes, isOpen, onToggle, t }) => (
  <DiagnosticConsoleButton
    diagnostics={diagnostics}
    fixCount={fixes.length}
    getTitle={t.diagnosticConsoleTitle}
    isOpen={isOpen}
    onToggle={onToggle}
  />
);
