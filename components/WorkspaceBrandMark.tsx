import React from 'react';
import { resolveMornDraftStaticAssetUrl } from '../utils/staticAssetUrl';

export const WorkspaceBrandMark: React.FC<{
  isDarkTheme: boolean;
}> = ({ isDarkTheme }) => (
  <span className="aad-workspace-brand-mark" role="img" aria-label="MornDraft">
    <img
      src={resolveMornDraftStaticAssetUrl(
        isDarkTheme ? 'morndraft-wordmark-dark.webp' : 'morndraft-wordmark-light.webp',
      )}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  </span>
);
