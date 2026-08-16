import React from 'react';
import { COPYRIGHT_NOTICE } from './publicCompliance';

type PublicComplianceFooterProps = {
  onAboutOpen?(): void;
};

export const PublicComplianceFooter: React.FC<PublicComplianceFooterProps> = ({ onAboutOpen }) => (
  <footer className="aad-preview-icp-footer" aria-label="MornDraft 版权信息">
    {onAboutOpen ? (
      <button
        type="button"
        className="aad-preview-filing-item aad-preview-copyright-notice aad-preview-copyright-button"
        onClick={onAboutOpen}
      >
        {COPYRIGHT_NOTICE}
      </button>
    ) : (
      <span className="aad-preview-filing-item aad-preview-copyright-notice">
        {COPYRIGHT_NOTICE}
      </span>
    )}
  </footer>
);
