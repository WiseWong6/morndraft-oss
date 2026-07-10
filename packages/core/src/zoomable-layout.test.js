import assert from 'node:assert/strict';
import test from 'node:test';
import { getZoomPanLayout } from './zoomable-layout.js';

test('getZoomPanLayout keeps the unzoomed canvas at natural height', () => {
  const layout = getZoomPanLayout({
    fullWidth: true,
    naturalHeight: 280,
    naturalWidth: 420,
    scale: 1,
    viewportWidth: 680,
  });

  assert.equal(layout.scaledHeight, 280);
  assert.equal(layout.spacerHeight, 280);
  assert.equal(layout.scaledWidth, 420);
  assert.equal(layout.spacerWidth, 680);
  assert.equal(layout.contentLeft, 130);
  assert.equal(layout.contentTop, 0);
  assert.equal(layout.maxScrollLeft, 0);
});

test('getZoomPanLayout uses visual scaled height only after zooming', () => {
  const layout = getZoomPanLayout({
    naturalHeight: 280,
    naturalWidth: 420,
    scale: 3,
  });

  assert.equal(layout.spacerHeight, 840);
  assert.equal(layout.spacerWidth, 1260);
  assert.equal(layout.scaledHeight, 840);
});

test('getZoomPanLayout preserves full-width minimum while allowing scaled overflow', () => {
  const layout = getZoomPanLayout({
    fullWidth: true,
    naturalHeight: 200,
    naturalWidth: 300,
    scale: 2,
  });

  assert.equal(layout.spacerHeight, 400);
  assert.equal(layout.spacerWidth, 600);
  assert.equal(layout.minSpacerWidth, '100%');
});

test('getZoomPanLayout keeps scaled content within non-negative horizontal bounds', () => {
  const layout = getZoomPanLayout({
    fullWidth: true,
    naturalHeight: 280,
    naturalWidth: 420,
    scale: 3,
    viewportWidth: 680,
  });

  assert.equal(layout.scaledWidth, 1260);
  assert.equal(layout.spacerWidth, 1260);
  assert.equal(layout.visualLeft, 0);
  assert.equal(layout.contentLeft, 420);
  assert.equal(layout.maxScrollLeft, 580);
});

test('getZoomPanLayout centers small scaled content with center transform origin', () => {
  const layout = getZoomPanLayout({
    fullWidth: true,
    naturalHeight: 100,
    naturalWidth: 120,
    scale: 2,
    viewportWidth: 680,
  });

  assert.equal(layout.scaledWidth, 240);
  assert.equal(layout.spacerWidth, 680);
  assert.equal(layout.visualLeft, 220);
  assert.equal(layout.contentLeft, 280);
  assert.equal(layout.maxScrollLeft, 0);
});

test('getZoomPanLayout keeps non-full-width content inside the viewport spacer', () => {
  const layout = getZoomPanLayout({
    fullWidth: false,
    naturalHeight: 120,
    naturalWidth: 160,
    scale: 1.5,
    viewportWidth: 640,
  });

  assert.equal(layout.scaledWidth, 240);
  assert.equal(layout.spacerWidth, 640);
  assert.equal(layout.visualLeft, 200);
  assert.equal(layout.contentLeft, 240);
  assert.equal(layout.maxScrollLeft, 0);
});

test('getZoomPanLayout returns center-origin vertical offset without viewport expansion', () => {
  const layout = getZoomPanLayout({
    fullWidth: true,
    naturalHeight: 180,
    naturalWidth: 260,
    scale: 2,
    viewportWidth: 500,
  });

  assert.equal(layout.scaledWidth, 520);
  assert.equal(layout.scaledHeight, 360);
  assert.equal(layout.spacerWidth, 520);
  assert.equal(layout.spacerHeight, 360);
  assert.equal(layout.visualLeft, 0);
  assert.equal(layout.contentLeft, 130);
  assert.equal(layout.contentTop, 90);
  assert.equal(layout.maxScrollLeft, 20);
});
