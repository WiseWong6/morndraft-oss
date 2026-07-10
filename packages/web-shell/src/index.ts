import React from 'react';
import ReactDOM from 'react-dom/client';

export const MORNDRAFT_WEB_SHELL_PACKAGE = '@morndraft/web-shell';

export type MornDraftWebShellProfile = 'oss' | 'personal' | 'pro-web' | 'ide';

export type MornDraftShellAppComponent = React.ComponentType;

export type MornDraftShellMountOptions = {
  appEntryId: string;
  profileId: string;
  App: MornDraftShellAppComponent;
  rootId?: string;
};

export function mountMornDraftShell({
  appEntryId,
  profileId,
  App,
  rootId = 'root',
}: MornDraftShellMountOptions): void {
  const rootElement = document.getElementById(rootId);
  if (!rootElement) {
    throw new Error(`Could not find ${rootId} element to mount MornDraft`);
  }

  document.documentElement.dataset.morndraftAppEntry = appEntryId;
  document.documentElement.dataset.morndraftProfile = profileId;

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(App),
    ),
  );
}
