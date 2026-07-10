import { mountMornDraftShell } from '@morndraft/web-shell';
import OssShell from './OssShell';

export const MORNDRAFT_WEB_OSS_APP = '@morndraft/web-oss';
export const MORNDRAFT_WEB_OSS_PROFILE = 'oss';
export const MORNDRAFT_WEB_OSS_ENTRY_MARKER = 'morndraft-app-entry:web-oss';

mountMornDraftShell({
  appEntryId: MORNDRAFT_WEB_OSS_ENTRY_MARKER,
  profileId: MORNDRAFT_WEB_OSS_PROFILE,
  App: OssShell,
});
