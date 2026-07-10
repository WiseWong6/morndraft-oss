import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveHtmlPreviewFitDimensions,
  resolveMeasuredHtmlPreviewExtent,
  resolveMeasuredHtmlPreviewWidth,
  resolveMeasuredHtmlPreviewWidthReport,
  resolveStableHtmlPreviewSize,
  shouldCommitHtmlPreviewSize,
} from './html-preview-size.js';

test('resolveMeasuredHtmlPreviewExtent ignores viewport-sized measurements when content is shorter', () => {
  const height = resolveMeasuredHtmlPreviewExtent({
    contentExtent: 248,
    scrollExtent: 400,
    rectExtent: 400,
    viewportExtent: 400,
  });

  assert.equal(height, 248);
});

test('resolveMeasuredHtmlPreviewExtent ignores viewport feedback with small body chrome deltas', () => {
  const height = resolveMeasuredHtmlPreviewExtent({
    contentExtent: 106,
    scrollExtent: 122,
    rectExtent: 122,
    viewportExtent: 106,
  });

  assert.equal(height, 106);
});

test('resolveMeasuredHtmlPreviewExtent ignores viewport feedback with large body padding deltas', () => {
  const height = resolveMeasuredHtmlPreviewExtent({
    contentExtent: 9400,
    scrollExtent: 9520,
    rectExtent: 9520,
    viewportExtent: 9400,
  });

  assert.equal(height, 9400);
});

test('resolveMeasuredHtmlPreviewExtent does not keep growing from a previous iframe height', () => {
  const height = resolveMeasuredHtmlPreviewExtent({
    contentExtent: 320,
    scrollExtent: 892,
    rectExtent: 892,
    viewportExtent: 820,
  });

  assert.equal(height, 320);
});

test('resolveMeasuredHtmlPreviewExtent keeps scroll-driven height for tall documents', () => {
  const height = resolveMeasuredHtmlPreviewExtent({
    contentExtent: 960,
    scrollExtent: 1200,
    rectExtent: 1200,
    viewportExtent: 400,
  });

  assert.equal(height, 1200);
});

test('resolveMeasuredHtmlPreviewExtent falls back to non-viewport rect measurements when needed', () => {
  const height = resolveMeasuredHtmlPreviewExtent({
    contentExtent: 0,
    scrollExtent: 0,
    rectExtent: 312,
    viewportExtent: 400,
  });

  assert.equal(height, 312);
});

test('resolveHtmlPreviewFitDimensions scales wide landscape documents into the available width', () => {
  const fit = resolveHtmlPreviewFitDimensions({
    contentWidth: 1600,
    contentHeight: 900,
    availableWidth: 512,
    minHeight: 80,
  });

  assert.equal(fit.scale, 0.32);
  assert.equal(fit.iframeWidth, 1600);
  assert.equal(fit.renderedWidth, 512);
  assert.equal(fit.renderedHeight, 288);
});

test('resolveHtmlPreviewFitDimensions scales 16:9 slide decks into the available width', () => {
  const fit = resolveHtmlPreviewFitDimensions({
    contentWidth: 1280,
    contentHeight: 720,
    availableWidth: 640,
    minHeight: 80,
  });

  assert.equal(fit.scale, 0.5);
  assert.equal(fit.iframeWidth, 1280);
  assert.equal(fit.renderedWidth, 640);
  assert.equal(fit.renderedHeight, 360);
});

test('resolveHtmlPreviewFitDimensions does not enlarge narrow natural content', () => {
  const fit = resolveHtmlPreviewFitDimensions({
    contentWidth: 320,
    contentHeight: 180,
    availableWidth: 512,
    minHeight: 80,
  });

  assert.equal(fit.scale, 1);
  assert.equal(fit.iframeWidth, 320);
  assert.equal(fit.renderedWidth, 320);
  assert.equal(fit.renderedHeight, 180);
});

test('resolveHtmlPreviewFitDimensions fills narrow embedded fragments', () => {
  const fit = resolveHtmlPreviewFitDimensions({
    contentWidth: 220,
    contentHeight: 180,
    availableWidth: 512,
    minHeight: 80,
    widthMode: 'fill',
  });

  assert.equal(fit.scale, 1);
  assert.equal(fit.iframeWidth, 512);
  assert.equal(fit.renderedWidth, 512);
  assert.equal(fit.renderedHeight, 180);
});

test('resolveHtmlPreviewFitDimensions still scales wide embedded fragments', () => {
  const fit = resolveHtmlPreviewFitDimensions({
    contentWidth: 1600,
    contentHeight: 900,
    availableWidth: 512,
    minHeight: 80,
    widthMode: 'fill',
  });

  assert.equal(fit.scale, 0.32);
  assert.equal(fit.iframeWidth, 1600);
  assert.equal(fit.renderedWidth, 512);
  assert.equal(fit.renderedHeight, 288);
});

test('resolveHtmlPreviewFitDimensions keeps fixed mobile HTML inside the stage width', () => {
  const fit = resolveHtmlPreviewFitDimensions({
    contentWidth: 790,
    contentHeight: 1200,
    availableWidth: 393,
    minHeight: 80,
  });

  assert.equal(fit.iframeWidth, 790);
  assert.equal(fit.renderedWidth, 393);
  assert.ok(fit.scale < 1);
});

test('resolveHtmlPreviewFitDimensions preserves tall mobile HTML height after width fit', () => {
  const fit = resolveHtmlPreviewFitDimensions({
    contentWidth: 920,
    contentHeight: 2400,
    availableWidth: 393,
    minHeight: 80,
  });

  assert.equal(fit.iframeWidth, 920);
  assert.equal(fit.renderedWidth, 393);
  assert.equal(fit.renderedHeight, 1026);
  assert.ok(fit.renderedHeight > 852);
});

test('resolveHtmlPreviewFitDimensions falls back safely when measurements are missing', () => {
  const fit = resolveHtmlPreviewFitDimensions({
    contentWidth: 0,
    contentHeight: Number.NaN,
    availableWidth: 512,
    minHeight: 80,
  });

  assert.equal(fit.scale, 1);
  assert.equal(fit.iframeWidth, null);
  assert.equal(fit.renderedWidth, null);
  assert.equal(fit.renderedHeight, 80);
});

test('resolveMeasuredHtmlPreviewWidth preserves centered visual overflow', () => {
  const width = resolveMeasuredHtmlPreviewWidth({
    contentExtent: 896,
    scrollExtent: 896,
    rectExtent: 512,
    visualExtent: 1280,
  });

  assert.equal(width, 1280);
});

test('resolveMeasuredHtmlPreviewWidthReport marks minimum fallback as viewport feedback', () => {
  const report = resolveMeasuredHtmlPreviewWidthReport({
    contentExtent: 0,
    scrollExtent: 790,
    rectExtent: 790,
    visualExtent: 790,
    viewportExtent: 790,
  });

  assert.equal(report.width, 1);
  assert.equal(report.widthKind, 'viewport-feedback');
});

test('resolveMeasuredHtmlPreviewWidthReport keeps fixed natural content width', () => {
  const report = resolveMeasuredHtmlPreviewWidthReport({
    contentExtent: 750,
    scrollExtent: 790,
    rectExtent: 790,
    visualExtent: 750,
    viewportExtent: 790,
  });

  assert.equal(report.width, 750);
  assert.equal(report.widthKind, 'content');
});

test('resolveMeasuredHtmlPreviewWidthReport treats viewport-bound measurements as feedback', () => {
  const report = resolveMeasuredHtmlPreviewWidthReport({
    contentExtent: 480,
    scrollExtent: 512,
    rectExtent: 512,
    visualExtent: 512,
    viewportExtent: 512,
  });

  assert.equal(report.width, 480);
  assert.equal(report.widthKind, 'content');
});

test('shouldCommitHtmlPreviewSize ignores small post-ready size jitter', () => {
  assert.equal(shouldCommitHtmlPreviewSize({
    currentHeight: 480,
    currentWidth: 393,
    hasSettled: false,
    nextHeight: 481,
    nextWidth: 394,
  }), true);

  assert.equal(shouldCommitHtmlPreviewSize({
    currentHeight: 480,
    currentWidth: 393,
    hasSettled: true,
    nextHeight: 482,
    nextWidth: 395,
  }), false);

  assert.equal(shouldCommitHtmlPreviewSize({
    currentHeight: 480,
    currentWidth: 393,
    hasSettled: true,
    nextHeight: 492,
    nextWidth: 393,
  }), true);
});

test('resolveStableHtmlPreviewSize preserves settled width through height-only updates', () => {
  assert.deepEqual(resolveStableHtmlPreviewSize({
    currentWidth: 600,
    hasSettled: true,
    nextHeight: 720,
    nextWidth: null,
  }), {
    height: 720,
    width: 600,
  });
});

test('resolveStableHtmlPreviewSize ignores settled viewport feedback height growth', () => {
  assert.deepEqual(resolveStableHtmlPreviewSize({
    currentHeight: 480,
    currentWidth: 600,
    hasSettled: true,
    heightKind: 'viewport-feedback',
    nextHeight: 720,
    nextWidth: 600,
  }), {
    height: 480,
    width: 600,
  });
});

test('resolveStableHtmlPreviewSize ignores settled viewport feedback height shrink', () => {
  assert.deepEqual(resolveStableHtmlPreviewSize({
    currentHeight: 720,
    currentWidth: 600,
    hasSettled: true,
    heightKind: 'viewport-feedback',
    nextHeight: 480,
    nextWidth: 600,
  }), {
    height: 720,
    width: 600,
  });
});

test('resolveStableHtmlPreviewSize ignores height changes from viewport width feedback', () => {
  assert.deepEqual(resolveStableHtmlPreviewSize({
    currentHeight: 720,
    currentWidth: 600,
    hasSettled: true,
    heightKind: 'content',
    nextHeight: 520,
    nextWidth: 600,
    widthKind: 'viewport-feedback',
  }), {
    height: 720,
    width: 600,
  });
});

test('resolveStableHtmlPreviewSize preserves real content height growth', () => {
  assert.deepEqual(resolveStableHtmlPreviewSize({
    currentHeight: 480,
    currentWidth: 600,
    hasSettled: true,
    heightKind: 'content',
    nextHeight: 720,
    nextWidth: 600,
  }), {
    height: 720,
    width: 600,
  });
});

test('resolveStableHtmlPreviewSize allows initial viewport feedback height', () => {
  assert.deepEqual(resolveStableHtmlPreviewSize({
    currentHeight: 80,
    currentWidth: null,
    hasSettled: false,
    heightKind: 'viewport-feedback',
    nextHeight: 520,
    nextWidth: null,
  }), {
    height: 520,
    width: null,
  });
});

test('resolveStableHtmlPreviewSize rejects post-ready width shrink feedback', () => {
  assert.deepEqual(resolveStableHtmlPreviewSize({
    currentWidth: 600,
    hasSettled: true,
    nextHeight: 720,
    nextWidth: 436,
  }), {
    height: 720,
    width: 600,
  });
});
