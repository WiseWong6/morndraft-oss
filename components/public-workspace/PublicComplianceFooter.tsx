import React from 'react';
import {
  COPYRIGHT_NOTICE,
  ICP_FILING_NUMBER,
  ICP_FILING_URL,
  PUBLIC_SECURITY_FILING_ICON_SRC,
  PUBLIC_SECURITY_FILING_NUMBER,
} from './publicCompliance';

type PublicComplianceFooterProps = {
  onAboutOpen?(): void;
};

export const PublicComplianceFooter: React.FC<PublicComplianceFooterProps> = ({ onAboutOpen }) => (
  <footer className="aad-preview-icp-footer" aria-label="网站备案信息">
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
    <span className="aad-preview-filing-item aad-preview-public-security-filing">
      <img
        className="aad-preview-public-security-icon"
        src={PUBLIC_SECURITY_FILING_ICON_SRC}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      />
      <span>{PUBLIC_SECURITY_FILING_NUMBER}</span>
    </span>
    <a
      className="aad-preview-filing-item"
      href={ICP_FILING_URL}
      target="_blank"
      rel="noreferrer"
    >
      {ICP_FILING_NUMBER}
    </a>
  </footer>
);
