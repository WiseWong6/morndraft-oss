import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHtmlPreviewBridgeScript,
  HTML_PREVIEW_BRIDGE_SOURCE,
  isHtmlPreviewBridgeMessage,
} from './htmlPreviewBridge';

test('html preview bridge script reports real element bounds and listens for resize requests', () => {
  const script = buildHtmlPreviewBridgeScript('frame-1');

  assert.match(script, /data-morndraft-html-preview-bridge/);
  assert.match(script, /window\.parent\.postMessage/);
  assert.match(script, /maxWidth=Math\.max\(maxWidth,rect\.width\)/);
  assert.match(script, /visualWidth=hasRect\?maxRight-minLeft:0/);
  assert.match(script, /lastViewportHeight=0/);
  assert.match(script, /lastHeightKind='content'/);
  assert.match(script, /function resolveExtent\(contentExtent,scrollExtent,rectExtent,viewportExtent,minExtent\)/);
  assert.match(script, /var tolerance=160/);
  assert.match(script, /var height=resolveExtent\(visualHeight,scrollHeight,rectHeight,viewportHeight,1\)/);
  assert.match(script, /function clipRectToVisibleAncestors\(element,rect,body,html\)/);
  assert.match(script, /\^\(auto\|clip\|hidden\|scroll\)\$/);
  assert.match(script, /rect=clipRectToVisibleAncestors\(element,element\.getBoundingClientRect\(\),body,html\)/);
  assert.match(script, /Math\.abs\(heightDelta-viewportDelta\)<=2/);
  assert.match(script, /lastHeightKind==='viewport-feedback'&&Math\.abs\(height-lastHeight\)<=2/);
  assert.match(script, /heightKind='viewport-feedback'/);
  assert.match(script, /heightKind:heightKind/);
  assert.match(script, /data\.kind==='measure'/);
  assert.doesNotMatch(script, /data\.kind==='edit-request'/);
  assert.doesNotMatch(script, /data\.kind==='edit-commit-request'/);
  assert.doesNotMatch(script, /contentEditable|contenteditable/);
  assert.doesNotMatch(script, /post\('edit-(?:intent|draft|commit|ready|started|cancel|error)'/);
  assert.match(script, /Object\.assign\(\{\},payload\|\|\{\},\{source:SOURCE,kind:kind,id:FRAME_ID\}\)/);
  assert.match(script, /var MORNDRAFT_FLAT_EDIT_PATH_ATTR='data-morndraft-edit-path'/);
  assert.match(script, /function reportPointerSelectionTarget\(event\)\{[\s\S]*?post\('activate'\);[\s\S]*?postSelectionPayload\(payload\)/);
  assert.match(script, /post\('selection-change',payload\)/);
  assert.match(script, /function postSelectionPayload\(payload\)/);
  assert.match(script, /function reportPointerSelectionTarget\(event\)/);
  assert.match(script, /document\.addEventListener\('selectionchange',scheduleSelectionChange\)/);
  assert.match(script, /document\.addEventListener\('pointerdown',reportPointerSelectionTarget,true\)/);
  assert.match(script, /document\.addEventListener\('pointerup',scheduleSelectionChange,true\)/);
  assert.doesNotMatch(script, /allow-same-origin/);
});

test('html preview bridge messages require source and frame id and reject all live edit messages', () => {
  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'activate',
  }, 'frame-1'), true);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-2',
    kind: 'activate',
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'size',
    width: 1280,
    height: 720,
    widthKind: 'content',
    heightKind: 'viewport-feedback',
  }, 'frame-1'), true);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'edit-draft',
    html: '<p>Draft</p>',
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'size',
    width: 1280,
    height: 720,
    widthKind: 'content',
  }, 'frame-1'), true);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-2',
    kind: 'size',
    width: 1280,
    height: 720,
    widthKind: 'content',
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'size',
    width: 1280,
    height: 720,
    widthKind: 'unexpected',
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'size',
    width: 1280,
    height: 720,
    widthKind: 'content',
    heightKind: 'unexpected',
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'edit-intent',
    x: 0,
    y: 42,
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'edit-intent',
    x: -1,
    y: 42,
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'edit-ready',
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'edit-started',
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'edit-commit',
    html: '<p>Edited</p>',
    requestId: 'commit-1',
    markerCount: 1,
    pathValues: { '$.title': 'Edited' },
    commitSource: 'iframe-snapshot',
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'selection-change',
    text: 'Selected title',
    textOccurrenceIndex: 2,
    editPath: '$.title',
    pathTextOccurrenceIndex: 0,
  }, 'frame-1'), true);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'edit-ready',
    markerCount: 3,
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'edit-commit',
    html: '<p>Edited</p>',
    requestId: 'commit-1',
    pathValues: { '$.title': 42 },
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'edit-commit',
    html: '<p>Forged</p>',
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'selection-change',
    text: 'Selected title',
    textOccurrenceIndex: '2',
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'edit-commit',
    html: '<p>Edited</p>',
    requestId: 42,
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'edit-commit',
    html: 42,
  }, 'frame-1'), false);

  assert.equal(isHtmlPreviewBridgeMessage({
    source: HTML_PREVIEW_BRIDGE_SOURCE,
    id: 'frame-1',
    kind: 'edit-error',
    message: 42,
  }, 'frame-1'), false);
});
