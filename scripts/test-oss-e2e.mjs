#!/usr/bin/env node
/* global AbortController, Buffer, Element, HTMLButtonElement, HTMLElement, Navigator, URL, clearTimeout, console, document, fetch, getComputedStyle, localStorage, navigator, process, requestAnimationFrame, sessionStorage, setTimeout, window */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PDFDocument, PDFName } from 'pdf-lib';
import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const outputDir = path.join(projectDir, 'output', 'playwright', 'oss-e2e');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const readCandidateArg = () => {
  const index = process.argv.indexOf('--candidate');
  if (index < 0 || !process.argv[index + 1]) return '.';
  return process.argv[index + 1];
};

const candidateDir = path.resolve(projectDir, readCandidateArg());

export const findUnexpectedMornDraftApiRequests = (requestUrls, appUrl) => {
  const appOrigin = new URL(appUrl).origin;
  return requestUrls.filter((requestUrl) => {
    const parsed = new URL(requestUrl);
    const isMornDraftFirstParty = parsed.hostname === 'morndraft.com'
      || parsed.hostname.endsWith('.morndraft.com');
    return parsed.pathname.startsWith('/api/') && (
      parsed.origin === appOrigin || isMornDraftFirstParty
    );
  });
};

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd ?? candidateDir,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`));
  });
});

const listen = (server) => new Promise((resolve, reject) => {
  const failed = (error) => reject(error);
  server.once('error', failed);
  server.listen(0, '127.0.0.1', () => {
    server.removeListener('error', failed);
    const address = server.address();
    if (!address || typeof address === 'string') {
      reject(new Error('Server did not expose a TCP port.'));
      return;
    }
    resolve(address.port);
  });
});

const closeServer = (server) => new Promise((resolve) => {
  if (!server?.listening) {
    resolve();
    return;
  }
  server.close(() => resolve());
  server.closeIdleConnections?.();
});

const waitForUrl = async (url, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`, { cause: lastError });
};

const waitForFrameWithSelector = async (page, selector, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      if (await frame.locator(selector).count()) return frame;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`Timed out waiting for portable frame selector: ${selector}`);
};

const waitForFrameWithUrl = async (page, pattern, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frame = page.frames().find(candidate => (
      candidate !== page.mainFrame() && pattern.test(candidate.url())
    ));
    if (frame) return frame;
    await page.waitForTimeout(50);
  }
  throw new Error(`Timed out waiting for portable frame URL: ${pattern}`);
};

const decodeHtmlAttribute = (value) => value
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&');

const extractPortableDocumentSrcdoc = (html) => {
  const match = html.match(
    /<iframe\b class="morndraft-public-document-frame"[^>]*\ssrcdoc="([^"]*)"><\/iframe>/u,
  );
  assert.ok(match?.[1], 'Portable HTML is missing the opaque public document frame.');
  return decodeHtmlAttribute(match[1]);
};

const stopChild = async (child) => {
  if (!child) return;
  const treeIsAlive = () => {
    if (process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch {
        return false;
      }
    }
    return child.exitCode === null && child.signalCode === null;
  };
  const waitForTreeExit = async (timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (treeIsAlive() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return !treeIsAlive();
  };
  const killTree = (signal) => {
    if (process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // The process may not have reached its detached group yet.
      }
    }
    child.kill(signal);
  };
  if (!treeIsAlive()) return;
  killTree('SIGTERM');
  if (await waitForTreeExit(3_000)) return;
  killTree('SIGKILL');
  await waitForTreeExit(3_000);
};

const createAiMock = () => {
  const requests = [];
  const responses = {
    'oss-generate-model': '# Generated from OSS AI',
    'oss-modify-model': 'Modified selection from OSS AI',
    'oss-summarize-model': 'Summary from OSS AI',
  };
  const server = createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', 'authorization, content-type');
    response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({ authorization: request.headers.authorization, body, url: request.url });
    const serializedBody = JSON.stringify(body);
    const isSlowRaceRequest = serializedBody.includes('OSS race request A');
    const isFastRaceRequest = serializedBody.includes('OSS race request B');
    if (isSlowRaceRequest) await new Promise((resolve) => setTimeout(resolve, 450));
    if (isFastRaceRequest) await new Promise((resolve) => setTimeout(resolve, 20));
    const text = isSlowRaceRequest
      ? 'Stale response from OSS race A'
      : isFastRaceRequest
        ? 'Fresh response from OSS race B'
        : responses[body.model];
    if (!text) {
      response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":{"message":"unknown model"}}');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: text } }],
    }));
  });
  return { requests, server };
};

const createDeliveryFixtureServer = () => {
  const slowCssDelayMs = 850;
  const requests = {
    activeMediaImage: 0,
    cloneImage: 0,
    escapedImportCss: 0,
    invalidCssEncoding: 0,
    invalidCssMime: 0,
    invalidFont: 0,
    invalidRaster: 0,
    mediaContextCss: 0,
    inactivePrintImage: 0,
    noCorsCss: 0,
    noCorsImage: 0,
    noscriptCss: 0,
    noscriptImage: 0,
    proactiveLinkImage: 0,
    slowCss: 0,
    slowImage: 0,
  };
  const noCorsPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAU0OBRsAAAAASUVORK5CYII=',
    'base64',
  );
  const activeMediaPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGNUPZ7xn4GBgYGJAQoAIyUCV0FmzREAAAAASUVORK5CYII=',
    'base64',
  );
  const invalidRaster = Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x00, 0xff, 0xd9,
  ]);
  const invalidFont = Buffer.alloc(44);
  invalidFont.write('wOFF', 0, 'ascii');
  invalidFont.writeUInt32BE(44, 8);
  invalidFont.writeUInt16BE(1, 12);
  const invalidCssEncoding = Buffer.concat([
    Buffer.from('.invalid-css-encoding{color:rgb(31, 117, 199)}', 'utf8'),
    Buffer.from([0xff]),
  ]);
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/escaped-import.css') {
      requests.escapedImportCss += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-type': 'text/css; charset=utf-8',
      });
      response.end('.escaped-import-card{color:rgb(23, 87, 145)}');
      return;
    }
    if (requestUrl.pathname === '/proactive-link.png') {
      requests.proactiveLinkImage += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-length': activeMediaPng.byteLength,
        'content-type': 'image/png',
      });
      response.end(activeMediaPng);
      return;
    }
    if (requestUrl.pathname === '/clone-image.png') {
      requests.cloneImage += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-length': activeMediaPng.byteLength,
        'content-type': 'image/png',
      });
      response.end(activeMediaPng);
      return;
    }
    if (requestUrl.pathname === '/noscript-image.png') {
      requests.noscriptImage += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-length': activeMediaPng.byteLength,
        'content-type': 'image/png',
      });
      response.end(activeMediaPng);
      return;
    }
    if (requestUrl.pathname === '/noscript-style.css') {
      requests.noscriptCss += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-type': 'text/css; charset=utf-8',
      });
      response.end('.noscript-control{color:rgb(73, 29, 181)}');
      return;
    }
    if (requestUrl.pathname === '/invalid-raster.jpg') {
      requests.invalidRaster += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-length': invalidRaster.byteLength,
        'content-type': 'image/jpeg',
      });
      response.end(invalidRaster);
      return;
    }
    if (requestUrl.pathname === '/invalid-font.woff') {
      requests.invalidFont += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-length': invalidFont.byteLength,
        'content-type': 'font/woff',
      });
      response.end(invalidFont);
      return;
    }
    if (requestUrl.pathname === '/invalid-css-mime.css') {
      requests.invalidCssMime += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
      });
      response.end('.invalid-css-mime{color:rgb(191, 47, 83)}');
      return;
    }
    if (requestUrl.pathname === '/invalid-css-encoding.css') {
      requests.invalidCssEncoding += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-length': invalidCssEncoding.byteLength,
        'content-type': 'text/css; charset=utf-8',
      });
      response.end(invalidCssEncoding);
      return;
    }
    if (requestUrl.pathname === '/media-context.css') {
      requests.mediaContextCss += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-type': 'text/css; charset=utf-8',
      });
      response.end([
        'html,body{margin:0;min-height:480px;background:#102030}',
        'body{display:grid;place-items:center}',
        '.media-context-card{width:240px;height:140px;background:#cc3366 url("./active-media.png") center/cover no-repeat}',
        '@media print{.media-context-card{background-image:url("./inactive-print.png?source=linked")}}',
      ].join(''));
      return;
    }
    if (requestUrl.pathname === '/active-media.png') {
      requests.activeMediaImage += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-length': activeMediaPng.byteLength,
        'content-type': 'image/png',
      });
      response.end(activeMediaPng);
      return;
    }
    if (requestUrl.pathname === '/inactive-print.png') {
      requests.inactivePrintImage += 1;
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-length': noCorsPng.byteLength,
        'content-type': 'image/png',
      });
      response.end(noCorsPng);
      return;
    }
    if (requestUrl.pathname === '/slow-layout.css') {
      requests.slowCss += 1;
      response.setHeader('access-control-allow-origin', '*');
      response.setHeader('cache-control', 'no-store');
      response.setHeader('content-type', 'text/css; charset=utf-8');
      setTimeout(() => {
        if (response.destroyed) return;
        response.end([
          ':root,html{margin:0;min-height:480px;background:#102030}',
          'body{margin:0;min-height:480px;display:grid;place-items:center;background:#102030}',
          '.slow-card{width:240px;height:140px;background:#12a4e6}',
        ].join(''));
      }, slowCssDelayMs);
      return;
    }
    if (requestUrl.pathname === '/slow-image.png') {
      requests.slowImage += 1;
      response.setHeader('access-control-allow-origin', '*');
      response.setHeader('cache-control', 'no-store');
      response.setHeader('content-type', 'image/png');
      setTimeout(() => {
        if (response.destroyed) return;
        response.end(noCorsPng);
      }, slowCssDelayMs);
      return;
    }
    if (requestUrl.pathname === '/no-cors.png') {
      requests.noCorsImage += 1;
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': noCorsPng.byteLength,
        'content-type': 'image/png',
      });
      response.end(noCorsPng);
      return;
    }
    if (requestUrl.pathname === '/no-cors.css') {
      requests.noCorsCss += 1;
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'text/css; charset=utf-8',
      });
      response.end('html,body{background:#7a1d4e}.no-cors-card{width:220px;height:120px;background:#efcc44}');
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
  });
  return { requests, server, slowCssDelayMs };
};

const installDeliveryResourceAudit = async (page) => {
  // Install only in the top-level app document. BrowserContext.addInitScript
  // also targets every sandboxed author iframe; Chromium then reports the test
  // probe itself as blocked script execution in deliberately scriptless frames.
  await page.evaluate(() => {
    if (window.__ossDeliveryResourceAudit) return;
    const activeObjectUrls = new Set();
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    const audit = {
      activeObjectUrls,
      abortCalls: [],
      added: {
        captureHosts: 0,
        html2canvasContainers: 0,
        modernSandboxes: 0,
        staticCaptureFrames: 0,
      },
      createdObjectUrls: 0,
      deliveryEvents: [],
      runtimeSnapshots: [],
      runtimeErrors: [],
      revokedObjectUrls: 0,
    };
    const pushBounded = (items, value) => {
      items.push(value);
      if (items.length > 24) items.shift();
    };
    const describeDeliveryButtons = () => Array.from(document.querySelectorAll('.md-public-delivery button, [data-preview-toolbar-menu-layer] button'))
      .map((button) => ({
        disabled: button.disabled,
        testId: button.getAttribute('data-testid') ?? '',
        text: button.textContent?.trim() ?? '',
      }));
    const originalAbort = AbortController.prototype.abort;
    AbortController.prototype.abort = function auditedAbort(reason) {
      pushBounded(audit.abortCalls, {
        message: reason instanceof Error ? reason.message : String(reason ?? ''),
        stack: new Error('AbortController.abort audit').stack?.split('\n').slice(1, 7).join('\n') ?? '',
      });
      return originalAbort.call(this, reason);
    };
    URL.createObjectURL = (blob) => {
      const value = originalCreateObjectUrl(blob);
      audit.createdObjectUrls += 1;
      activeObjectUrls.add(value);
      return value;
    };
    URL.revokeObjectURL = (value) => {
      audit.revokedObjectUrls += 1;
      activeObjectUrls.delete(value);
      originalRevokeObjectUrl(value);
    };
    window.__ossDeliveryResourceAudit = audit;
    window.addEventListener('error', (event) => {
      pushBounded(audit.runtimeErrors, { kind: 'error', message: String(event.message ?? '') });
    });
    window.addEventListener('unhandledrejection', (event) => {
      pushBounded(audit.runtimeErrors, {
        kind: 'unhandledrejection',
        message: event.reason instanceof Error ? event.reason.message : String(event.reason ?? ''),
      });
    });
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('.md-public-delivery button, [data-preview-toolbar-menu-layer] button') : null;
      if (!target) return;
      pushBounded(audit.deliveryEvents, {
        buttons: describeDeliveryButtons(),
        event: `click:${target.getAttribute('data-testid') ?? ''}`,
      });
    }, true);

    const selectors = [
      ['captureHosts', '[data-morndraft-public-capture-host="true"]'],
      ['html2canvasContainers', '.html2canvas-container'],
      ['modernSandboxes', 'iframe[id^="__SANDBOX__"]'],
      ['staticCaptureFrames', 'iframe[sandbox="allow-same-origin"][aria-hidden="true"]'],
    ];
    const snapshotCaptureRuntimeState = (host) => {
      const root = host.shadowRoot;
      const canvas = root?.querySelector('[data-oss-runtime-canvas]');
      if (!(canvas instanceof window.HTMLCanvasElement)) return;
      const input = root.querySelector('[data-oss-runtime-input]');
      const checkbox = root.querySelector('[data-oss-runtime-checkbox]');
      const textarea = root.querySelector('[data-oss-runtime-textarea]');
      const select = root.querySelector('[data-oss-runtime-select]');
      const details = root.querySelector('[data-oss-runtime-details]');
      let canvasPixel = [];
      try {
        canvasPixel = [...canvas.getContext('2d').getImageData(1, 1, 1, 1).data];
      } catch (error) {
        canvasPixel = [`error:${error instanceof Error ? error.message : String(error)}`];
      }
      pushBounded(audit.runtimeSnapshots, {
        canvasPixel,
        checkboxAttribute: checkbox?.hasAttribute('checked') ?? false,
        checkboxChecked: checkbox instanceof window.HTMLInputElement ? checkbox.checked : null,
        checkboxIndeterminate: checkbox instanceof window.HTMLInputElement ? checkbox.indeterminate : null,
        detailsAttribute: details?.hasAttribute('open') ?? false,
        detailsOpen: details instanceof window.HTMLDetailsElement ? details.open : null,
        inputAttribute: input?.getAttribute('value') ?? null,
        inputValue: input instanceof window.HTMLInputElement ? input.value : null,
        selectedAttributes: select instanceof window.HTMLSelectElement
          ? Array.from(select.options, option => option.hasAttribute('selected'))
          : [],
        selectedValues: select instanceof window.HTMLSelectElement
          ? Array.from(select.selectedOptions, option => option.value)
          : [],
        textareaText: textarea?.textContent ?? null,
        textareaValue: textarea instanceof window.HTMLTextAreaElement ? textarea.value : null,
      });
    };
    const countNode = (node) => {
      if (node.nodeType !== 1) return;
      for (const [key, selector] of selectors) {
        if (node.matches(selector)) audit.added[key] += 1;
        audit.added[key] += node.querySelectorAll(selector).length;
      }
      if (node.matches('[data-morndraft-public-capture-host="true"]')) {
        snapshotCaptureRuntimeState(node);
      }
    };
    const startObserver = () => {
      if (!document.documentElement) return;
      const observer = new window.MutationObserver((records) => {
        records.forEach((record) => record.addedNodes.forEach(countNode));
        if (records.some((record) => (
          record.target instanceof Element && record.target.closest('.md-public-delivery')
        ))) {
          pushBounded(audit.deliveryEvents, { buttons: describeDeliveryButtons(), event: 'mutation' });
        }
      });
      observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
      audit.observer = observer;
    };
    if (document.documentElement) startObserver();
    else window.addEventListener('DOMContentLoaded', startObserver, { once: true });
  });
};

const readDeliveryResourceAudit = (page) => page.evaluate(() => {
  const audit = window.__ossDeliveryResourceAudit;
  return {
    activeObjectUrls: audit?.activeObjectUrls.size ?? -1,
    captureHosts: document.querySelectorAll('[data-morndraft-public-capture-host="true"]').length,
    captureHostsAdded: audit?.added.captureHosts ?? -1,
    createdObjectUrls: audit?.createdObjectUrls ?? -1,
    hiddenDownloadAnchors: document.querySelectorAll('a[download]').length,
    html2canvasContainers: document.querySelectorAll('.html2canvas-container').length,
    html2canvasContainersAdded: audit?.added.html2canvasContainers ?? -1,
    modernSandboxes: document.querySelectorAll('iframe[id^="__SANDBOX__"]').length,
    modernSandboxesAdded: audit?.added.modernSandboxes ?? -1,
    revokedObjectUrls: audit?.revokedObjectUrls ?? -1,
    runtimeSnapshot: audit?.runtimeSnapshots.at(-1) ?? null,
    runtimeSnapshotCount: audit?.runtimeSnapshots.length ?? -1,
    staticCaptureFrames: document.querySelectorAll('iframe[sandbox="allow-same-origin"][aria-hidden="true"]').length,
    staticCaptureFramesAdded: audit?.added.staticCaptureFrames ?? -1,
  };
});

const ACTIVE_DELIVERY_RESOURCE_KEYS = Object.freeze([
  'activeObjectUrls',
  'captureHosts',
  'hiddenDownloadAnchors',
  'html2canvasContainers',
  'modernSandboxes',
  'staticCaptureFrames',
]);

const readActiveDeliveryResources = (snapshot) => Object.fromEntries(
  ACTIVE_DELIVERY_RESOURCE_KEYS.map((key) => [key, snapshot[key]]),
);

const assertZeroDeliveryResourceBaseline = (baseline, label) => {
  for (const key of ACTIVE_DELIVERY_RESOURCE_KEYS) {
    assert.equal(baseline[key], 0, `${label} started with active ${key}.`);
  }
};

const assertNoActiveDeliveryResources = async (page, baseline, label) => {
  try {
    await page.waitForFunction((expected) => {
      const audit = window.__ossDeliveryResourceAudit;
      return (
        (audit?.activeObjectUrls.size ?? -1) === expected.activeObjectUrls &&
        document.querySelectorAll('[data-morndraft-public-capture-host="true"]').length === expected.captureHosts &&
        document.querySelectorAll('a[download]').length === expected.hiddenDownloadAnchors &&
        document.querySelectorAll('.html2canvas-container').length === expected.html2canvasContainers &&
        document.querySelectorAll('iframe[id^="__SANDBOX__"]').length === expected.modernSandboxes &&
        document.querySelectorAll('iframe[sandbox="allow-same-origin"][aria-hidden="true"]').length === expected.staticCaptureFrames
      );
    }, baseline, { timeout: 5_000 });
  } catch (cause) {
    const current = await readDeliveryResourceAudit(page);
    throw new Error(
      `${label} did not return to its delivery resource baseline: expected=${JSON.stringify(readActiveDeliveryResources(baseline))} current=${JSON.stringify(readActiveDeliveryResources(current))}`,
      { cause },
    );
  }
  const current = await readDeliveryResourceAudit(page);
  for (const key of ACTIVE_DELIVERY_RESOURCE_KEYS) {
    assert.equal(current[key], baseline[key], `${label} leaked ${key}.`);
  }
};

const clickByTestId = async (page, testId) => {
  if (testId.startsWith('oss-delivery-')) {
    // Delivery actions live inside the Copy/Export dropdown menus of the 7.10
    // toolbar; open the owning menu before targeting the item.
    const menuButton = page.locator(
      testId === 'oss-delivery-copy-image' ? '.aad-preview-copy-button' : '.aad-preview-share-button',
    );
    await menuButton.waitFor({ state: 'visible', timeout: 5_000 });
    if (await menuButton.getAttribute('aria-expanded') !== 'true') await menuButton.click();
  }
  const target = page.getByTestId(testId);
  await assert.doesNotReject(target.waitFor({ state: 'visible', timeout: 5_000 }), `Missing OSS E2E selector: data-testid=${testId}`);
  await target.click();
};

const sourceModeButton = (page) => page.locator('[data-testid="oss-workspace-mode-toggle"]');

const waitForDeliveryIdle = async (page) => {
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll('.md-public-delivery button, [data-preview-toolbar-menu-layer] button'));
    return buttons.every((button) => (
      button instanceof HTMLButtonElement &&
      !button.disabled &&
      !button.classList.contains('is-loading')
    ));
  });
};

const openMoreMenu = async (page) => {
  const moreButton = page.locator('.aad-preview-more-button');
  await moreButton.waitFor({ state: 'visible', timeout: 5_000 });
  if (await moreButton.getAttribute('aria-expanded') !== 'true') await moreButton.click();
  await page.locator('.aad-oss-more-menu').waitFor({ state: 'visible' });
};

const setWorkspaceLocale = async (page, locale) => {
  const expectedLang = locale === 'en' ? 'en' : 'zh-CN';
  if (await page.evaluate(() => document.documentElement.lang) !== expectedLang) {
    await openMoreMenu(page);
    await page.getByRole('menuitem', { name: /^(?:系统语言|System language)/u }).click();
  }
  await page.waitForFunction((expected) => document.documentElement.lang === expected, expectedLang);
};

const setWorkspaceTheme = async (page, theme) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await page.evaluate(() => document.documentElement.dataset.theme) === theme) break;
    await openMoreMenu(page);
    await page.getByRole('menuitem', { name: /^(?:系统主题|System theme)/u }).click();
  }
  await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
};

const expectAiResult = async (page, expectedText) => {
  const result = page.getByTestId('oss-ai-result');
  await result.waitFor({ state: 'visible' });
  await assert.doesNotReject(result.getByText(expectedText, { exact: false }).waitFor());
};

const armImportCompletion = async (page) => {
  await page.evaluate(() => {
    window.__ossImportCycle?.observer?.disconnect();
    const cycle = {
      observer: undefined,
      outcome: '',
      sawNoOutcome: !document.querySelector('.md-public-status--done, .md-public-status--error'),
    };
    const inspect = () => {
      const done = document.querySelector('.md-public-status--done');
      const error = document.querySelector('.md-public-status--error');
      if (!done && !error) cycle.sawNoOutcome = true;
      if (!cycle.sawNoOutcome) return;
      if (done) cycle.outcome = 'done';
      if (error) cycle.outcome = `error:${error.textContent ?? ''}`;
      if (cycle.outcome) cycle.observer?.disconnect();
    };
    cycle.observer = new window.MutationObserver(inspect);
    cycle.observer.observe(document.body, { childList: true, subtree: true });
    window.__ossImportCycle = cycle;
  });
};

const waitForImportCompletion = async (page, expected = 'done') => {
  await page.waitForFunction(() => Boolean(window.__ossImportCycle?.outcome));
  const outcome = await page.evaluate(() => window.__ossImportCycle?.outcome ?? '');
  if (expected === 'error') {
    assert.match(outcome, /^error:/u, `Local import unexpectedly succeeded: ${outcome}`);
    return outcome;
  }
  assert.equal(outcome, 'done', `Local import did not complete successfully: ${outcome}`);
  return outcome;
};

const runAboutDialogFlow = async (page) => {
  const workspace = page.locator('[data-public-workspace="true"]');
  await openMoreMenu(page);
  const about = page.getByRole('menuitem', { name: /^(About|关于)$/u });
  await about.click();
  const dialog = page.getByRole('dialog', { name: 'MornDraft' });
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await workspace.getAttribute('aria-hidden'), 'true');
  assert.equal(await workspace.evaluate((element) => element.inert), true);
  assert.equal(
    await dialog.evaluate((element) => element.contains(document.activeElement) && document.activeElement !== element),
    true,
    'About dialog did not move focus inside the dialog.',
  );
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await workspace.getAttribute('aria-hidden'), null);
  assert.equal(await workspace.evaluate((element) => element.inert), false);
  assert.equal(
    await page.evaluate(() => document.activeElement === document.body),
    true,
    'Closed About dialog did not release focus back to the page.',
  );
};

const runPublicShowcaseSurfaceFlow = async (page) => {
  await page.locator('.aad-preview-syntax-samples-button').click();
  const syntaxMenu = page.getByRole('menu', { name: /^(Syntax|语法)$/u });
  await syntaxMenu.waitFor({ state: 'visible' });
  await syntaxMenu.getByRole('menuitem', { name: 'MornDraft', exact: true }).click();

  const flatBlocks = page.locator('[data-public-preview-root="true"] [data-public-flat="true"]');
  await page.waitForFunction((expected) => (
    document.querySelectorAll('[data-public-preview-root="true"] [data-public-flat="true"]').length === expected
  ), 29, { timeout: 15_000 });
  assert.equal(await flatBlocks.count(), 29, 'The real Syntax surface did not render all 29 MornDraft showcases.');
  const syntaxFrames = flatBlocks.locator('iframe.md-public-html-frame');
  assert.equal(await syntaxFrames.count(), 29, 'A MornDraft Syntax showcase was not rendered through the flat HTML frame.');
  assert.match(
    await syntaxFrames.first().getAttribute('srcdoc') ?? '',
    /data-morndraft-source="morndraft-flat"/u,
    'The first MornDraft Syntax showcase lost its public flat marker.',
  );

  const sourceButton = sourceModeButton(page);
  const finalButton = page.getByRole('button', { name: /^(Final|最终效果)$/u });
  await sourceButton.click();
  const sourceEditor = page.locator('.aad-editor-input').first();
  const syntaxSource = await sourceEditor.inputValue();
  assert.equal(
    syntaxSource.match(/^## \d{2}\. /gmu)?.length ?? 0,
    29,
    'The MornDraft Syntax source did not contain 29 numbered showcases.',
  );
  assert.equal(
    syntaxSource.match(/data-morndraft-source="morndraft-flat"/gu)?.length ?? 0,
    29,
    'The MornDraft Syntax source did not preserve 29 public flat markers.',
  );

  await sourceEditor.fill('/');
  const insertMenu = page.getByRole('menu', { name: /^(Insert content|插入内容)$/u });
  await insertMenu.waitFor({ state: 'visible' });
  const slashItems = insertMenu.getByRole('menuitem');
  await page.waitForFunction(() => (
    document.querySelectorAll('[role="menu"][aria-label="插入内容"] [role="menuitem"], [role="menu"][aria-label="Insert content"] [role="menuitem"]').length >= 31
  ));
  const slashLabels = (await slashItems.allTextContents()).map((label) => label.trim());
  const aiGenerate = insertMenu.getByTestId('oss-ai-generate');
  const aiLabel = await aiGenerate.count() ? (await aiGenerate.innerText()).trim() : '';
  assert.ok(slashLabels.includes('Markdown table'), 'The slash menu lost its Markdown table entry.');
  const flatLabels = slashLabels.filter((label) => label !== 'Markdown table' && label !== aiLabel);
  assert.equal(flatLabels.length, 30, 'The real slash menu did not expose all 30 MornDraft flat entries.');

  const representativeLabel = flatLabels[0];
  assert.ok(representativeLabel, 'The slash menu has no representative MornDraft flat entry.');
  await insertMenu.getByRole('menuitem', { name: representativeLabel, exact: true }).first().click();
  await page.waitForFunction(() => {
    const editor = document.querySelector('.md-public-source-editor textarea');
    return editor instanceof window.HTMLTextAreaElement
      && editor.value.includes('data-morndraft-source="morndraft-flat"')
      && !editor.value.trimStart().startsWith('/');
  });
  const insertedSource = await sourceEditor.inputValue();
  assert.match(insertedSource, /^```html$/mu, 'The slash entry did not insert a fenced HTML block.');
  assert.match(insertedSource, /<!-- morndraft:structure /u, 'The slash entry lost its MornDraft structure metadata.');
  assert.match(insertedSource, /data-morndraft-source="morndraft-flat"/u, 'The slash entry lost its public flat marker.');

  await finalButton.click();
  const insertedFlatBlock = page.locator('[data-public-preview-root="true"] [data-public-flat="true"]');
  await insertedFlatBlock.waitFor({ state: 'visible' });
  assert.equal(await insertedFlatBlock.count(), 1, 'The representative slash entry did not render as one flat block.');
  const insertedFrame = insertedFlatBlock.locator('iframe.md-public-html-frame');
  await insertedFrame.waitFor({ state: 'attached' });
  assert.match(
    await insertedFrame.getAttribute('srcdoc') ?? '',
    /data-morndraft-source="morndraft-flat"/u,
    'The representative slash entry did not reach the Final renderer.',
  );
};

const dispatchNoisyImageDrop = (page, {
  dimension,
  documentName,
  dropSelector = '[data-public-workspace="true"]',
  imageName,
  source,
}) => page.evaluate(async (fixture) => {
  const canvas = document.createElement('canvas');
  canvas.width = fixture.dimension;
  canvas.height = fixture.dimension;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable for the import fixture.');
  const pixels = context.createImageData(canvas.width, canvas.height);
  let seed = 0x6d2b79f5;
  for (let index = 0; index < pixels.data.length; index += 4) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    pixels.data[index] = seed & 255;
    pixels.data[index + 1] = (seed >>> 8) & 255;
    pixels.data[index + 2] = (seed >>> 16) & 255;
    pixels.data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const image = await new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Could not encode the import fixture.')),
    'image/png',
  ));
  const transfer = new window.DataTransfer();
  transfer.items.add(new window.File([fixture.source], fixture.documentName, { type: 'text/markdown' }));
  transfer.items.add(new window.File([image], fixture.imageName, { type: 'image/png' }));
  const dropTarget = document.querySelector(fixture.dropSelector);
  if (!dropTarget) throw new Error(`Public drop target is unavailable: ${fixture.dropSelector}`);
  dropTarget.dispatchEvent(new window.DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }));
  dropTarget.dispatchEvent(new window.DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  dropTarget.dispatchEvent(new window.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  return image.size;
}, { dimension, documentName, dropSelector, imageName, source });

const dispatchTextDrop = (page, {
  documentName,
  dropSelector = '[data-public-preview-root="true"]',
  source,
}) => page.evaluate((fixture) => {
  const transfer = new window.DataTransfer();
  transfer.items.add(new window.File(
    [fixture.source],
    fixture.documentName,
    { type: 'text/markdown' },
  ));
  const dropTarget = document.querySelector(fixture.dropSelector);
  if (!dropTarget) throw new Error(`Public drop target is unavailable: ${fixture.dropSelector}`);
  dropTarget.dispatchEvent(new window.DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }));
  dropTarget.dispatchEvent(new window.DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  dropTarget.dispatchEvent(new window.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
}, { documentName, dropSelector, source });

const selectRenderedOccurrence = async (block, needle, occurrence) => {
  let selectionResult;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    selectionResult = await block.first().evaluate((root, input) => {
      root.focus({ preventScroll: true });
      const walker = root.ownerDocument.createTreeWalker(root, 4);
      const textNodes = [];
      let combined = '';
      let current = walker.nextNode();
      while (current) {
        textNodes.push({ node: current, start: combined.length, text: current.textContent ?? '' });
        combined += current.textContent ?? '';
        current = walker.nextNode();
      }
      let start = -1;
      let cursor = 0;
      for (let index = 0; index <= input.occurrence; index += 1) {
        start = combined.indexOf(input.needle, cursor);
        if (start < 0) return { combined, error: 'needle-not-found', selected: '' };
        cursor = start + input.needle.length;
      }
      const end = start + input.needle.length;
      const startEntry = textNodes.find((entry) => start >= entry.start && start <= entry.start + entry.text.length);
      const endEntry = [...textNodes].reverse().find((entry) => end >= entry.start && end <= entry.start + entry.text.length);
      if (!startEntry || !endEntry) return { combined, error: 'range-node-not-found', selected: '' };
      const range = root.ownerDocument.createRange();
      range.setStart(startEntry.node, start - startEntry.start);
      range.setEnd(endEntry.node, end - endEntry.start);
      const selection = root.ownerDocument.getSelection();
      selection?.removeAllRanges();
      selection?.setBaseAndExtent(
        startEntry.node,
        start - startEntry.start,
        endEntry.node,
        end - endEntry.start,
      );
      const rangeText = range.toString();
      const selected = selection?.toString() ?? '';
      if (selected === input.needle) {
        root.dispatchEvent(new (root.ownerDocument.defaultView).MouseEvent('mouseup', { bubbles: true }));
      }
      // React may synchronously re-render the editable block after mouseup and
      // clear the native Selection. Return what the browser selected before that
      // state update while still dispatching mouseup so the app records it.
      return {
        combined,
        endOffset: end - endEntry.start,
        rangeCount: selection?.rangeCount ?? 0,
        rangeText,
        selected,
        startOffset: start - startEntry.start,
        textNodes: textNodes.map((entry) => entry.text),
      };
    }, { needle, occurrence });
    if (selectionResult.selected === needle) break;
    await block.page().waitForTimeout(50);
  }
  assert.equal(
    selectionResult.selected,
    needle,
    `Could not select rendered occurrence ${occurrence} of ${needle}: ${JSON.stringify(selectionResult)}`,
  );
};

const runImportFlow = async (page, canonicalFlatSource) => {
  const input = page.locator('input.md-public-file-input');
  const sourceButton = sourceModeButton(page);
  const finalButton = page.getByRole('button', { name: /^(Final|最终效果)$/u });
  const fixtures = [
    { name: 'fixture.md', mimeType: 'text/markdown', source: '# Imported Markdown', marker: 'Imported Markdown' },
    {
      name: 'fixture.json5',
      mimeType: 'application/json',
      source: "// top comment\n{kind:'json5', trailing:true,}",
      marker: "kind:'json5'",
      kind: 'json',
      finalEdit: "// edited in Final\n{kind:'json5-edited', trailing:true,}",
      finalMarker: "kind:'json5-edited'",
    },
    { name: 'fixture.mermaid', mimeType: 'text/plain', source: 'flowchart LR\nImport-->Final', marker: 'Import-->Final' },
    {
      name: 'fixture.html',
      mimeType: 'text/html',
      source: '<!doctype html><html><body>Imported HTML</body></html>',
      marker: 'Imported HTML',
      kind: 'html',
      finalEdit: '<!doctype html><html><body>HTML edited in Final</body></html>',
      finalMarker: 'HTML edited in Final',
    },
    {
      name: 'fixture-flat.md',
      mimeType: 'text/markdown',
      source: `# Imported flat\n\n${canonicalFlatSource}`,
      marker: 'data-morndraft-source="morndraft-flat"',
      kind: 'flat',
    },
  ];
  for (const fixture of fixtures) {
    await armImportCompletion(page);
    await input.setInputFiles({
      name: fixture.name,
      mimeType: fixture.mimeType,
      buffer: Buffer.from(fixture.source),
    });
    await waitForImportCompletion(page);
    await sourceButton.click();
    assert.match(await page.locator('.md-public-source-editor textarea').first().inputValue(), new RegExp(fixture.marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    await finalButton.click();
    await page.locator('[data-public-preview-root="true"]').waitFor({ state: 'visible' });
    if (fixture.kind === 'json' || fixture.kind === 'html') {
      assert.equal(await page.locator('[data-public-final="true"]').getAttribute('data-document-kind'), fixture.kind);
    }
    if (fixture.kind === 'flat') {
      const flatFrame = page.locator('[data-public-preview-root="true"] iframe.md-public-html-frame');
      await flatFrame.waitFor({ state: 'attached' });
      assert.match(await flatFrame.getAttribute('srcdoc') ?? '', /data-morndraft-source="morndraft-flat"/u);
      assert.equal(
        await page.locator('[data-testid="oss-flat-final-field"]').count(),
        0,
        'The 7·10 baseline keeps structured mixed-fence editing out of the initial public release.',
      );
    }
    if (fixture.finalEdit) {
      await page.locator('.md-public-final-edit-toggle').click();
      const finalEditor = page.locator('[data-public-final="true"] .md-public-source-editor textarea');
      await finalEditor.fill(fixture.finalEdit);
      await page.locator('.md-public-final-edit-toggle').click();
      await sourceButton.click();
      assert.match(await page.locator('.md-public-source-editor textarea').first().inputValue(), new RegExp(fixture.finalMarker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
      await finalButton.click();
    }
  }

  await sourceButton.click();
  const previousSource = await page.locator('.md-public-source-editor textarea').first().inputValue();
  const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgQIAKfRZ8QAAAABJRU5ErkJggg==', 'base64');
  const rejectedAttachments = [
    { name: 'unreferenced.json5', mimeType: 'application/json', source: "{kind:'json5'}" },
    { name: 'unreferenced.mmd', mimeType: 'text/plain', source: 'flowchart LR\nA-->B' },
    { name: 'unreferenced.html', mimeType: 'text/html', source: '<!doctype html><html><body>HTML</body></html>' },
  ];
  for (const fixture of rejectedAttachments) {
    await armImportCompletion(page);
    await input.setInputFiles([
      { name: fixture.name, mimeType: fixture.mimeType, buffer: Buffer.from(fixture.source) },
      { name: 'unreferenced.png', mimeType: 'image/png', buffer: onePixelPng },
    ]);
    await waitForImportCompletion(page, 'error');
    await sourceButton.click();
    assert.equal(
      await page.locator('.md-public-source-editor textarea').first().inputValue(),
      previousSource,
      `${fixture.name} was corrupted by an unreferenced image attachment.`,
    );
  }

  await finalButton.click();
  await page.locator('[data-public-preview-root="true"]').waitFor({ state: 'visible' });
  await armImportCompletion(page);
  const originalImageBytes = await dispatchNoisyImageDrop(page, {
    dimension: 900,
    documentName: 'with-image.md',
    dropSelector: '[data-public-preview-root="true"]',
    imageName: 'noise.png',
    source: '# Imported image\n\n![noise](./noise.png)',
  });
  await waitForImportCompletion(page);
  assert.ok(originalImageBytes > 2 * 1024 * 1024, 'The browser fixture did not exercise real image compression.');
  await sourceButton.click();
  const importedImageSource = await page.locator('.md-public-source-editor textarea').first().inputValue();
  const importedImageMatch = importedImageSource.match(/data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=]+)/iu);
  assert.ok(importedImageMatch, 'Dropped local image was not embedded as a data URL.');
  const compressedImageBytes = Buffer.from(importedImageMatch[1], 'base64').byteLength;
  assert.ok(compressedImageBytes <= 2 * 1024 * 1024, 'Embedded image exceeds the 2 MiB public import limit.');
  assert.ok(compressedImageBytes < originalImageBytes, 'Dropped image was not actually compressed.');
  assert.doesNotMatch(importedImageSource, /\.\/noise\.png/u);
  await finalButton.click();
  const importedImage = page.locator('[data-public-preview-root="true"] img[alt="noise"]');
  await importedImage.waitFor({ state: 'visible' });
  assert.match(await importedImage.getAttribute('src') ?? '', /^data:image\/[a-z0-9.+-]+;base64,/iu);
  const filenameFirstDownload = await assertDownload(
    page,
    'oss-delivery-download-html',
    '.html',
    (content) => assert.match(content.toString('utf8'), /Imported image/u),
  );
  assert.equal(
    filenameFirstDownload.download.suggestedFilename(),
    'with-image.html',
    'Imported delivery did not prefer the local document filename.',
  );
  const filenameFirstPng = await assertDownload(
    page,
    'oss-delivery-download-png',
    '.png',
    (content) => assert.deepEqual(
      [...content.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    ),
  );
  assert.equal(
    filenameFirstPng.download.suggestedFilename(),
    'with-image.png',
    'Imported PNG delivery did not prefer the local document filename.',
  );
  const filenameFirstPdf = await assertDownload(
    page,
    'oss-delivery-download-pdf',
    '.pdf',
    (content) => assertA4ImagePdf(content, 'Imported filename PDF'),
  );
  assert.equal(
    filenameFirstPdf.download.suggestedFilename(),
    'with-image.pdf',
    'Imported PDF delivery did not prefer the local document filename.',
  );

  await armImportCompletion(page);
  await dispatchTextDrop(page, {
    documentName: '',
    source: '\n\n# First content heading\n\nFallback title body.',
  });
  await waitForImportCompletion(page);
  const firstLineDownload = await assertDownload(
    page,
    'oss-delivery-download-html',
    '.html',
    (content) => assert.match(content.toString('utf8'), /First content heading/u),
  );
  assert.equal(
    firstLineDownload.download.suggestedFilename(),
    'First content heading.html',
    'Imported delivery did not fall back to the first content line.',
  );

  await page.locator('.aad-preview-syntax-samples-button').click();
  await page.getByRole('menu', { name: /^(Syntax|语法)$/u }).getByRole('menuitem').first().click();
  await page.waitForFunction(() => (
    document.querySelector('.aad-workspace-brand-mark')?.getAttribute('aria-label') === 'MornDraft'
  ));
  const resetTitleDownload = await assertDownload(
    page,
    'oss-delivery-download-html',
    '.html',
    () => undefined,
  );
  assert.equal(
    resetTitleDownload.download.suggestedFilename(),
    'MornDraft.html',
    'A non-import document reset retained a stale imported filename.',
  );

  await sourceButton.click();
  await armImportCompletion(page);
  const slowImportBytes = await dispatchNoisyImageDrop(page, {
    dimension: 1200,
    documentName: 'slow-import.md',
    imageName: 'slow-noise.png',
    source: '# Stale slow import\n\n![slow](./slow-noise.png)',
  });
  assert.ok(slowImportBytes > originalImageBytes, 'Import race fixture was not slower than the baseline image.');
  await input.setInputFiles({
    name: 'newer-import.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Newer import wins'),
  });
  await waitForImportCompletion(page);
  await sourceButton.click();
  const sourceAfterNewerImport = page.locator('.md-public-source-editor textarea').first();
  assert.equal(await sourceAfterNewerImport.inputValue(), '# Newer import wins');
  await page.waitForTimeout(2_500);
  assert.equal(
    await sourceAfterNewerImport.inputValue(),
    '# Newer import wins',
    'A late local import overwrote a newer import result.',
  );
};

const runAiFlow = async (page, mockBaseUrl, aiRequests) => {
  if (!await page.getByTestId('oss-ai-settings-open').isVisible()) {
    await openMoreMenu(page);
  }
  await clickByTestId(page, 'oss-ai-settings-open');
  await page.locator('input[name="baseUrl"]').fill(`${mockBaseUrl}/v1`);
  await page.locator('input[name="apiKey"]').fill('oss-e2e-key');
  await page.locator('input[name="model-generate"]').fill('oss-generate-model');
  await page.locator('input[name="model-modify"]').fill('oss-modify-model');
  await page.locator('input[name="model-summarize"]').fill('oss-summarize-model');
  await page.locator('form.public-ai-settings button[type="submit"]').click();

  const stored = await page.evaluate(() => ({
    local: localStorage.getItem('morndraft.oss.aiConfig.v1'),
    session: sessionStorage.getItem('morndraft.oss.aiConfig.session.v1'),
  }));
  assert.doesNotMatch(stored.local ?? '', /oss-e2e-key/u, 'Default storage must not persist the API Key.');
  assert.match(stored.session ?? '', /oss-e2e-key/u, 'Session storage must keep the API Key for this tab.');

  const sourceMode = sourceModeButton(page);
  if (await sourceMode.count()) await sourceMode.click();
  const sourceEditor = page.locator('.md-public-source-editor textarea').first();
  await sourceEditor.fill('/AI');
  await clickByTestId(page, 'oss-ai-generate');
  await page.getByTestId('oss-ai-instruction').fill('Generate an OSS heading');
  await page.getByRole('dialog').getByRole('button', { name: /^(Send|发送)$/u }).click();
  await expectAiResult(page, 'Generated from OSS AI');
  await clickByTestId(page, 'oss-ai-adopt');

  await sourceEditor.waitFor({ state: 'visible' });
  const foldedImagePayloadTail = 'QkFTRTY0TEVBS1RBSUw=';
  const localImageData = `data:image/png;base64,${'A'.repeat(2_000)}\n\t${foldedImagePayloadTail}`;
  const onePixelBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const percentEncodedImagePayloadTail = onePixelBase64.slice(24);
  const percentEncodedImageData = `data:image/png;base64,${onePixelBase64.slice(0, 24)}%0A${percentEncodedImagePayloadTail}`;
  const percentEncodedImageFence = [
    '```html',
    `<img id="oss-percent-encoded-ai-image" src="${percentEncodedImageData}" alt="encoded">`,
    '```',
  ].join('\n');
  const arbitraryDataPayloadTail = 'QVJCSVRSQVJZX0xPQ0FMX0FTU0VU';
  const arbitraryDataUrl = `data:application/octet-stream;base64,${arbitraryDataPayloadTail}`;
  const rawHtmlSource = `${percentEncodedImageFence}\n\nRaw HTML repeat target`;
  await sourceEditor.fill(rawHtmlSource);
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  const percentEncodedImageFrame = await waitForFrameWithSelector(page, '#oss-percent-encoded-ai-image');
  const percentEncodedImage = percentEncodedImageFrame.locator('#oss-percent-encoded-ai-image');
  await percentEncodedImage.evaluate((image) => new Promise((resolve, reject) => {
    if (image.complete) {
      if (image.naturalWidth === 1 && image.naturalHeight === 1) resolve();
      else reject(new Error(`Percent-encoded image decoded at ${image.naturalWidth}x${image.naturalHeight}.`));
      return;
    }
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error('Percent-encoded image failed to load.')), { once: true });
  }));
  assert.deepEqual(
    await percentEncodedImage.evaluate((image) => [image.naturalWidth, image.naturalHeight]),
    [1, 1],
    'Chromium did not decode the percent-encoded 1x1 PNG fixture.',
  );
  let renderedBlock = page.locator('[data-public-final-block="true"]').filter({ hasText: 'Raw HTML repeat target' });
  await renderedBlock.waitFor({ state: 'visible' });
  await selectRenderedOccurrence(renderedBlock, 'repeat', 0);
  const requestsBeforeRawHtmlModify = aiRequests.length;
  await clickByTestId(page, 'oss-ai-modify');
  await page.getByTestId('oss-ai-instruction').fill('This raw HTML request must be refused');
  await page.getByRole('dialog').getByRole('button', { name: /^(Send|发送)$/u }).click();
  await page.getByRole('dialog').getByRole('alert').filter({ hasText: /stopped|停止/u }).waitFor({ state: 'visible' });
  assert.equal(
    aiRequests.length,
    requestsBeforeRawHtmlModify,
    'A source-backed raw HTML modify request reached the AI provider.',
  );
  await page.getByRole('dialog').getByRole('button', { name: /^(Close|关闭)$/u }).click();

  await sourceMode.click();
  await sourceEditor.fill(`Sensitive local resource ${arbitraryDataUrl} must stay in this browser.`);
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  renderedBlock = page.locator('[data-public-final-block="true"]').filter({ hasText: 'Sensitive local resource' });
  await renderedBlock.waitFor({ state: 'visible' });
  await selectRenderedOccurrence(renderedBlock, 'octet-stream', 0);
  const requestsBeforeArbitraryDataModify = aiRequests.length;
  await clickByTestId(page, 'oss-ai-modify');
  await page.getByTestId('oss-ai-instruction').fill('This arbitrary local data URL request must be refused');
  await page.getByRole('dialog').getByRole('button', { name: /^(Send|发送)$/u }).click();
  await page.getByRole('dialog').getByRole('alert').filter({ hasText: /stopped|停止/u }).waitFor({ state: 'visible' });
  assert.equal(
    aiRequests.length,
    requestsBeforeArbitraryDataModify,
    'A selection touching an arbitrary local data URL reached the AI provider.',
  );
  await page.getByRole('dialog').getByRole('button', { name: /^(Close|关闭)$/u }).click();

  await sourceMode.click();
  const percentEncodedImageMarkdown = `![encoded](${percentEncodedImageData})`;
  const sourceBeforeModify = `Local resource: ${arbitraryDataUrl}\n\n![local](${localImageData})\n\n${percentEncodedImageMarkdown}\n\nFirst target\n\nSecond repeat repeat repeat`;
  const sourceAfterModify = `Local resource: ${arbitraryDataUrl}\n\n![local](${localImageData})\n\n${percentEncodedImageMarkdown}\n\nFirst target\n\nSecond Modified selection from OSS AI repeat repeat`;
  await sourceEditor.fill(sourceBeforeModify);
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  const percentEncodedMarkdownImage = page.locator('img[alt="encoded"]');
  await percentEncodedMarkdownImage.waitFor({ state: 'visible' });
  await percentEncodedMarkdownImage.evaluate((image) => new Promise((resolve, reject) => {
    if (image.complete) {
      if (image.naturalWidth === 1 && image.naturalHeight === 1) resolve();
      else reject(new Error(`Percent-encoded Markdown image decoded at ${image.naturalWidth}x${image.naturalHeight}.`));
      return;
    }
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error('Percent-encoded Markdown image failed to load.')), { once: true });
  }));
  assert.deepEqual(
    await percentEncodedMarkdownImage.evaluate((image) => [image.naturalWidth, image.naturalHeight]),
    [1, 1],
    'Chromium did not decode the percent-encoded Markdown PNG fixture.',
  );
  renderedBlock = page.locator('[data-public-final-block="true"]').filter({ hasText: 'Second repeat repeat repeat' });
  await renderedBlock.waitFor({ state: 'visible' });
  await selectRenderedOccurrence(renderedBlock, 'repeat', 0);
  await clickByTestId(page, 'oss-ai-modify');
  await page.getByTestId('oss-ai-instruction').fill('Make the selection clearer');
  await page.getByRole('dialog').getByRole('button', { name: /^(Send|发送)$/u }).click();
  await expectAiResult(page, 'Modified selection from OSS AI');
  await clickByTestId(page, 'oss-ai-adopt');

  await sourceMode.click();
  assert.equal(await sourceEditor.inputValue(), sourceAfterModify);
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  renderedBlock = page.locator('[data-public-final-block="true"]').filter({ hasText: 'Second Modified selection from OSS AI repeat repeat' });
  await renderedBlock.waitFor({ state: 'visible' });
  await selectRenderedOccurrence(renderedBlock, 'repeat', 1);
  await clickByTestId(page, 'oss-ai-summarize');
  await expectAiResult(page, 'Summary from OSS AI');
  await page.getByRole('dialog').getByRole('button', { name: /^(Close|关闭)$/u }).click();
  await sourceMode.click();
  assert.equal(
    await sourceEditor.inputValue(),
    sourceAfterModify,
    'Summarize must remain read-only and leave Source unchanged.',
  );

  await sourceEditor.fill('/AI');
  await clickByTestId(page, 'oss-ai-generate');
  await page.getByTestId('oss-ai-instruction').fill('Generate stale adoption evidence');
  await page.getByRole('dialog').getByRole('button', { name: /^(Send|发送)$/u }).click();
  await expectAiResult(page, 'Generated from OSS AI');
  const sourceChangedAfterResult = '# Source changed after the AI result';
  await page.evaluate((nextSource) => {
    const textarea = document.querySelector('.md-public-source-editor textarea');
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (!(textarea instanceof window.HTMLTextAreaElement) || !valueSetter) {
      throw new Error('The Source editor is unavailable for the stale-adoption fixture.');
    }
    valueSetter.call(textarea, nextSource);
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
  }, sourceChangedAfterResult);
  await page.waitForFunction(
    (nextSource) => document.querySelector('.md-public-source-editor textarea')?.value === nextSource,
    sourceChangedAfterResult,
  );
  await clickByTestId(page, 'oss-ai-adopt');
  await page.getByRole('dialog').getByRole('alert').filter({ hasText: /Source.*changed|Source 已变化/u }).waitFor({ state: 'visible' });
  await page.getByRole('dialog').getByRole('button', { name: /^(Close|关闭)$/u }).click();
  assert.equal(
    await sourceEditor.inputValue(),
    sourceChangedAfterResult,
    'A stale AI result overwrote Source after the document changed.',
  );

  await sourceEditor.fill('/AI');
  await clickByTestId(page, 'oss-ai-generate');
  await page.getByTestId('oss-ai-instruction').fill('OSS race request A');
  await page.getByRole('dialog').getByRole('button', { name: /^(Send|发送)$/u }).click();
  await page.getByRole('dialog').getByRole('status').waitFor({ state: 'visible' });
  await page.waitForTimeout(75);
  await page.getByRole('dialog').getByRole('button', { name: /^(Cancel|取消)$/u }).click();
  await page.getByRole('dialog').getByRole('alert').waitFor({ state: 'visible' });
  await page.getByRole('dialog').getByRole('button', { name: /^(Close|关闭)$/u }).click();

  await sourceEditor.fill('');
  await sourceEditor.fill('/AI');
  await clickByTestId(page, 'oss-ai-generate');
  await page.getByTestId('oss-ai-instruction').fill('OSS race request B');
  await page.getByRole('dialog').getByRole('button', { name: /^(Send|发送)$/u }).click();
  await expectAiResult(page, 'Fresh response from OSS race B');
  await page.waitForTimeout(500);
  const raceResult = page.getByTestId('oss-ai-result');
  assert.match(await raceResult.innerText(), /Fresh response from OSS race B/u);
  assert.doesNotMatch(await raceResult.innerText(), /Stale response from OSS race A/u);
  await page.getByRole('dialog').getByRole('button', { name: /^(Close|关闭)$/u }).click();
};

const assertOss710VisualBaseline = async (page, { mobile = false } = {}) => {
  await page.locator('.md-public-format-row .aad-preview-format-toolbar').waitFor({ state: 'visible' });
  const geometry = await page.evaluate(() => {
    const readRect = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing visual baseline element: ${selector}`);
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      };
    };
    const workspace = document.querySelector('[data-public-workspace="true"]');
    const main = document.querySelector('.md-public-main');
    const surface = document.querySelector('.md-public-final-surface.aad-document-surface');
    if (!(workspace instanceof HTMLElement) || !(main instanceof HTMLElement) || !(surface instanceof HTMLElement)) {
      throw new Error('The 7·10 visual baseline fixture is incomplete.');
    }
    return {
      format: readRect('.md-public-format-row'),
      header: readRect('.md-public-toolbar'),
      main: readRect('.md-public-main'),
      surface: readRect('.md-public-final-surface.aad-document-surface'),
      canvasColor: getComputedStyle(main).backgroundColor,
      paperColor: getComputedStyle(surface).backgroundColor,
      paperRadius: getComputedStyle(surface).borderRadius,
      viewportWidth: window.innerWidth,
      workspaceClientWidth: workspace.clientWidth,
      workspaceScrollWidth: workspace.scrollWidth,
    };
  });
  assert.ok(Math.abs(geometry.header.height - 48) <= 1, `7·10 header height drifted to ${geometry.header.height}px.`);
  assert.ok(Math.abs(geometry.format.top - 48) <= 1, `7·10 format row starts at ${geometry.format.top}px.`);
  assert.ok(Math.abs(geometry.format.height - 42) <= 1, `7·10 format row height drifted to ${geometry.format.height}px.`);
  assert.ok(Math.abs(geometry.main.top - 90) <= 1, `7·10 canvas starts at ${geometry.main.top}px.`);
  assert.equal(geometry.paperRadius, '0px', 'The A4 paper regained rounded application chrome.');
  assert.notEqual(geometry.canvasColor, geometry.paperColor, 'The 7·10 canvas and white paper lost their visual separation.');
  assert.ok(
    geometry.workspaceScrollWidth <= geometry.workspaceClientWidth + 1,
    `The workspace leaks horizontal overflow: ${geometry.workspaceScrollWidth}/${geometry.workspaceClientWidth}.`,
  );
  if (mobile) {
    assert.ok(
      geometry.surface.width <= geometry.viewportWidth - 15 && geometry.surface.width >= geometry.viewportWidth - 18,
      `Mobile paper width drifted to ${geometry.surface.width}px at ${geometry.viewportWidth}px.`,
    );
  } else {
    assert.ok(Math.abs(geometry.surface.width - 794) <= 1, `Desktop A4 paper width drifted to ${geometry.surface.width}px.`);
  }
  const filing = await page.locator('.aad-preview-icp-footer').innerText();
  assert.match(filing, /粤ICP备2026082169号-1/u);
  assert.match(filing, /粤公网安备44030002014257号/u);
  assert.doesNotMatch(filing, /深圳明日回声科技有限公司/u);
};

const runFinalEditingFlow = async (page) => {
  const sourceButton = sourceModeButton(page);
  await sourceButton.click();
  const sourceEditor = page.locator('.md-public-source-editor textarea').first();
  await sourceEditor.fill([
    '# Stable heading',
    '',
    'Editable paragraph before the iframe.',
    '',
    '```html',
    '<!doctype html><html><body>stable iframe</body></html>',
    '```',
    '',
    'Markdown after the iframe.',
  ].join('\n'));
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  const previewRoot = page.locator('[data-public-preview-root="true"]');
  await previewRoot.waitFor({ state: 'visible' });
  const frame = previewRoot.locator('iframe.md-public-html-frame');
  await frame.waitFor({ state: 'attached' });
  await frame.evaluate((element) => { window.__ossStableFrame = element.contentWindow; });

  assert.equal(await previewRoot.count(), 1, 'Final editing must keep the rendered preview root mounted.');
  const editable = previewRoot.locator('[data-public-final-editable="true"]').filter({ hasText: 'Editable paragraph' });
  await editable.waitFor({ state: 'visible' });
  assert.equal(await editable.getAttribute('contenteditable'), 'true');
  await editable.fill('Precisely patched paragraph before the iframe.');
  await assertDownload(page, 'oss-delivery-download-html', '.html', (content) => {
    const html = content.toString('utf8');
    assert.doesNotMatch(html, /data-morndraft-delivery-exclude|contenteditable=["']true["']/u);
    assert.doesNotMatch(
      html,
      /class=["'][^"']*md-public-(?:flat-editor|html-fence-editor|final-edit-toolbar)[^"']*["']/u,
    );
    assert.match(html, /Precisely patched paragraph before the iframe\./u);
  });
  const identityPreserved = await frame.evaluate((element) => element.contentWindow === window.__ossStableFrame);
  assert.equal(identityPreserved, true, 'An adjacent Markdown patch remounted an unchanged HTML iframe.');

  await sourceButton.click();
  assert.match(await sourceEditor.inputValue(), /Precisely patched paragraph before the iframe\./u);
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
};

const collectDownloadTimeoutDiagnostics = async (page) => {
  let timeoutId;
  const diagnostics = page.evaluate(() => {
    const safeText = (value, maxLength = 240) => String(value ?? '')
      .replace(/Bearer\s+[^\s]+/giu, 'Bearer [redacted]')
      .replace(/((?:api[-_ ]?)?key\s*[:=]\s*)[^\s]+/giu, '$1[redacted]')
      .trim()
      .slice(0, maxLength);
    const dimensions = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        client: [element.clientWidth, element.clientHeight],
        offset: [element.offsetWidth, element.offsetHeight],
        rect: [Math.round(rect.width), Math.round(rect.height)],
        scroll: [element.scrollWidth, element.scrollHeight],
      };
    };
    const describeFrame = (frame) => {
      let content = { accessible: false, readyState: 'inaccessible', root: null };
      try {
        const frameDocument = frame.contentDocument;
        content = {
          accessible: Boolean(frameDocument),
          readyState: frameDocument?.readyState ?? 'missing',
          root: dimensions(frameDocument?.documentElement ?? null),
        };
      } catch {
        // An opaque author iframe is expected to be inaccessible here.
      }
      return {
        className: safeText(frame.className, 120),
        connected: frame.isConnected,
        content,
        dimensions: dimensions(frame),
        hidden: frame.hidden,
        id: safeText(frame.id, 120),
        sandbox: safeText(frame.getAttribute('sandbox'), 120),
      };
    };
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = element.ownerDocument.defaultView?.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden';
    };
    const captureHosts = Array.from(document.querySelectorAll('[data-morndraft-public-capture-host="true"]'));
    const captureFrames = Array.from(document.querySelectorAll(
      'iframe[sandbox="allow-same-origin"][aria-hidden="true"], iframe[data-morndraft-public-capture-frame]',
    ));
    const modernSandboxes = Array.from(document.querySelectorAll('iframe[id^="__SANDBOX__"]'));
    const alerts = Array.from(document.querySelectorAll('.md-public-delivery [role="alert"], .aad-editor-floating-toast[role="alert"]'));
    const statuses = Array.from(document.querySelectorAll('.md-public-delivery [role="status"], .aad-editor-floating-toast[role="status"]'));
    return {
      alerts: alerts.slice(0, 4).map((element) => ({
        text: safeText(element.textContent),
        visible: visible(element),
      })),
      abortCalls: (window.__ossDeliveryResourceAudit?.abortCalls ?? []).slice(-12).map((entry) => ({
        message: safeText(entry.message),
        stack: safeText(entry.stack, 800),
      })),
      buttons: Array.from(document.querySelectorAll('.md-public-delivery button, [data-preview-toolbar-menu-layer] button')).slice(0, 8).map((button) => ({
        ariaBusy: safeText(button.getAttribute('aria-busy'), 24),
        disabled: button.disabled,
        testId: safeText(button.getAttribute('data-testid'), 80),
        text: safeText(button.textContent, 80),
      })),
      captureFrames: captureFrames.slice(0, 8).map(describeFrame),
      captureHosts: captureHosts.slice(0, 8).map((host) => ({
        connected: host.isConnected,
        dimensions: dimensions(host),
        shadowChildCount: host.shadowRoot?.childElementCount ?? 0,
        shadowRoot: dimensions(host.shadowRoot?.querySelector('[data-public-preview-root="true"]') ?? null),
      })),
      document: {
        body: dimensions(document.body),
        readyState: document.readyState,
        root: dimensions(document.documentElement),
        visibilityState: document.visibilityState,
      },
      deliveryEvents: (window.__ossDeliveryResourceAudit?.deliveryEvents ?? []).slice(-12),
      html2canvasContainers: document.querySelectorAll('.html2canvas-container').length,
      modernSandboxes: {
        count: modernSandboxes.length,
        frames: modernSandboxes.slice(0, 8).map(describeFrame),
      },
      previewRenderStates: Array.from(document.querySelectorAll('[data-public-render-state]')).slice(0, 16).map((element) => ({
        className: safeText(element.className, 120),
        connected: element.isConnected,
        state: safeText(element.getAttribute('data-public-render-state'), 24),
        tagName: element.tagName,
      })),
      runtimeErrors: (window.__ossDeliveryResourceAudit?.runtimeErrors ?? []).slice(-12).map((entry) => ({
        kind: safeText(entry.kind, 40),
        message: safeText(entry.message),
      })),
      statuses: statuses.slice(0, 4).map((element) => ({
        text: safeText(element.textContent),
        visible: visible(element),
      })),
      topLevelCanvases: Array.from(document.querySelectorAll('body > canvas')).slice(0, 8).map(dimensions),
    };
  });
  try {
    return await Promise.race([
      diagnostics,
      new Promise((resolve) => {
        timeoutId = setTimeout(
          () => resolve({ collection: 'timed out after 2000ms' }),
          2_000,
        );
      }),
    ]);
  } catch (error) {
    return { collection: `failed (${error instanceof Error ? error.name : 'unknown'})` };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const assertDownload = async (page, testId, extension, verify) => {
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  try {
    await clickByTestId(page, testId);
  } catch (error) {
    void downloadPromise.catch(() => undefined);
    throw error;
  }
  const download = await downloadPromise.catch(async (cause) => {
    const diagnostics = await collectDownloadTimeoutDiagnostics(page);
    throw new Error(
      `${testId} did not start a download within 30000ms. Safe delivery diagnostics: ${JSON.stringify(diagnostics)}`,
      { cause },
    );
  });
  assert.equal(path.extname(download.suggestedFilename()).toLowerCase(), extension);
  const filePath = await download.path();
  assert.ok(filePath, `${extension} download did not create a file.`);
  const content = await readFile(filePath);
  assert.ok(content.byteLength > 32, `${extension} download is unexpectedly empty.`);
  await verify(content);
  await waitForDeliveryIdle(page);
  return { content, download, filePath };
};

const assertA4ImagePdf = async (content, label) => {
  assert.equal(content.subarray(0, 4).toString('ascii'), '%PDF', `${label} is not a PDF file.`);
  const pdf = await PDFDocument.load(content);
  assert.ok(pdf.getPageCount() > 0, `${label} has no pages.`);
  for (const [index, page] of pdf.getPages().entries()) {
    assert.ok(Math.abs(page.getWidth() - 595.28) < 0.05, `${label} page ${index + 1} is not A4 width.`);
    assert.ok(Math.abs(page.getHeight() - 841.89) < 0.05, `${label} page ${index + 1} is not A4 height.`);
    assert.ok(page.node.get(PDFName.of('Contents')), `${label} page ${index + 1} has no content stream.`);
  }
  const embeddedImageCount = pdf.context.enumerateIndirectObjects().filter(([, object]) => {
    const dictionary = object && typeof object === 'object' && 'dict' in object ? object.dict : null;
    return dictionary && typeof dictionary.get === 'function'
      && String(dictionary.get(PDFName.of('Subtype'))) === '/Image';
  }).length;
  assert.ok(embeddedImageCount > 0, `${label} contains no embedded image.`);
  assert.ok(content.byteLength > 512, `${label} has no meaningful PDF payload.`);
};

const inspectPngPixels = (page, content, samples) => page.evaluate(async (input) => {
  const binary = window.atob(input.base64);
  const bytes = new window.Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const bitmap = await window.createImageBitmap(new window.Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable for PNG inspection.');
  context.drawImage(bitmap, 0, 0);
  const pixels = input.samples.map(({ xRatio, yRatio }) => {
    const x = Math.min(bitmap.width - 1, Math.max(0, Math.floor(bitmap.width * xRatio)));
    const y = Math.min(bitmap.height - 1, Math.max(0, Math.floor(bitmap.height * yRatio)));
    return [...context.getImageData(x, y, 1, 1).data];
  });
  const result = { height: bitmap.height, pixels, width: bitmap.width };
  bitmap.close();
  canvas.width = 0;
  canvas.height = 0;
  return result;
}, { base64: content.toString('base64'), samples });

const assertRgbaNear = (actual, expected, label, tolerance = 8) => {
  assert.equal(actual.length, 4, `${label} did not return an RGBA pixel.`);
  for (let index = 0; index < 4; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= tolerance,
      `${label} channel ${index} was ${actual[index]}, expected ${expected[index]} +/- ${tolerance}.`,
    );
  }
};

const assertDeliveryFailureWithoutDownload = async (
  page,
  testId,
  messagePattern = /(?:请下载 HTML|download HTML)/iu,
) => {
  const visibleAlert = page.locator('.aad-editor-floating-toast[role="alert"]').filter({ visible: true });
  let downloadCount = 0;
  const onDownload = () => { downloadCount += 1; };
  page.on('download', onDownload);
  try {
    await clickByTestId(page, testId);
    await visibleAlert.waitFor({ state: 'visible' });
    assert.match(await visibleAlert.innerText(), messagePattern);
    await waitForDeliveryIdle(page);
    await page.waitForTimeout(150);
    assert.equal(downloadCount, 0, `${testId} generated a dynamic HTML half-product.`);
  } finally {
    page.off('download', onDownload);
  }
};

const assertDynamicDeliveryRejectedBeforeAllocation = async (
  page,
  baseline,
  label,
  messagePattern = /(?:请下载 HTML|download HTML)/iu,
) => {
  const before = await readDeliveryResourceAudit(page);
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-png', messagePattern);
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-pdf', messagePattern);
  const after = await readDeliveryResourceAudit(page);
  for (const key of [
    'captureHostsAdded',
    'html2canvasContainersAdded',
    'modernSandboxesAdded',
    'staticCaptureFramesAdded',
  ]) {
    assert.equal(after[key], before[key], `${label} allocated ${key} before rejection.`);
  }
  await assertNoActiveDeliveryResources(page, baseline, label);
};

const replaceSourceAndOpenFinal = async (page, source) => {
  await sourceModeButton(page).click();
  await page.locator('.md-public-source-editor textarea').first().fill(source);
  await page.getByRole('button', { name: /^(Final|最终效果)$/u }).click();
  await page.locator('[data-public-preview-root="true"]').waitFor({ state: 'visible' });
};

const runDeliveryHardeningFlow = async (
  page,
  fixtureBaseUrl,
  fixtureRequests,
  slowCssDelayMs,
  consoleErrors,
  baseline,
) => {
  const mimeSpoofedStaticPng = [
    'data:text/plain;base64,',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgQIAKfRZ8QAAAABJRU5ErkJggg==',
  ].join('');
  await replaceSourceAndOpenFinal(page, [
    '<!doctype html><html><body>',
    `<img id="oss-mime-spoofed-static-image" src="${mimeSpoofedStaticPng}" alt="static PNG bytes">`,
    '<svg width="24" height="24" viewBox="0 0 24 24" aria-label="static filtered PNG bytes">',
    '<defs><filter id="oss-mime-spoofed-filter" x="0" y="0" width="1" height="1">',
    `<feImage id="oss-mime-spoofed-feimage" href="${mimeSpoofedStaticPng}" preserveAspectRatio="none"></feImage>`,
    '</filter></defs>',
    '<rect width="24" height="24" filter="url(#oss-mime-spoofed-filter)"></rect>',
    '</svg>',
    '</body></html>',
  ].join(''));
  const mimeSpoofedImageFrame = await waitForFrameWithSelector(
    page,
    '#oss-mime-spoofed-static-image',
  );
  assert.deepEqual(
    await mimeSpoofedImageFrame.locator('#oss-mime-spoofed-static-image').evaluate(async (image) => {
      await image.decode();
      return { height: image.naturalHeight, width: image.naturalWidth };
    }),
    { height: 1, width: 1 },
    'Chromium did not sniff the static PNG bytes behind a text/plain data URL.',
  );
  assert.equal(
    await mimeSpoofedImageFrame
      .locator('#oss-mime-spoofed-feimage')
      .evaluate(element => element.getAttribute('href')),
    mimeSpoofedStaticPng,
    'Chromium did not retain the MIME-spoofed static PNG in the SVG feImage resource slot.',
  );
  await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  await assertDownload(
    page,
    'oss-delivery-download-pdf',
    '.pdf',
    content => assertA4ImagePdf(content, 'MIME-spoofed static PNG PDF'),
  );
  await assertNoActiveDeliveryResources(page, baseline, 'MIME-spoofed static PNG delivery');

  const noscriptMarkup = [
    '<!doctype html><html><head>',
    `<noscript><link rel="stylesheet" href="${fixtureBaseUrl}/noscript-style.css"></noscript>`,
    '</head><body class="noscript-control">',
    `<noscript><img id="oss-noscript-live-image" src="${fixtureBaseUrl}/noscript-image.png" alt="noscript"></noscript>`,
    '<main id="oss-noscript-live-marker">Noscript parser boundary</main>',
    '</body></html>',
  ].join('');
  const noscriptLiveRequestsBefore = {
    css: fixtureRequests.noscriptCss,
    image: fixtureRequests.noscriptImage,
  };
  await replaceSourceAndOpenFinal(page, noscriptMarkup);
  const noscriptLiveFrame = await waitForFrameWithSelector(page, '#oss-noscript-live-marker');
  await noscriptLiveFrame.waitForTimeout(150);
  assert.equal(
    await noscriptLiveFrame.locator('#oss-noscript-live-image').count(),
    0,
    'Scripts-enabled live parsing unexpectedly activated noscript image markup.',
  );
  assert.deepEqual(
    { css: fixtureRequests.noscriptCss, image: fixtureRequests.noscriptImage },
    noscriptLiveRequestsBefore,
    'Scripts-enabled live parsing unexpectedly requested a noscript resource.',
  );

  const noscriptControlPage = await page.context().newPage();
  try {
    await noscriptControlPage.setContent(
      '<!doctype html><iframe id="oss-noscript-control" sandbox="allow-same-origin"></iframe>',
    );
    await noscriptControlPage.locator('#oss-noscript-control').evaluate((frame, srcdoc) => {
      frame.srcdoc = srcdoc;
    }, noscriptMarkup);
    const noscriptControlFrame = await waitForFrameWithSelector(
      noscriptControlPage,
      '#oss-noscript-live-image',
    );
    await noscriptControlFrame.locator('#oss-noscript-live-image').evaluate(image => image.decode());
    await noscriptControlFrame.waitForFunction(() => (
      window.getComputedStyle(document.body).color === 'rgb(73, 29, 181)'
    ));
  } finally {
    await noscriptControlPage.close();
  }
  assert.deepEqual(
    { css: fixtureRequests.noscriptCss, image: fixtureRequests.noscriptImage },
    {
      css: noscriptLiveRequestsBefore.css + 1,
      image: noscriptLiveRequestsBefore.image + 1,
    },
    'A scripts-disabled capture-equivalent parse did not activate both noscript resources.',
  );
  const noscriptCaptureRequestsBefore = {
    css: fixtureRequests.noscriptCss,
    image: fixtureRequests.noscriptImage,
  };
  await assertDynamicDeliveryRejectedBeforeAllocation(
    page,
    baseline,
    'noscript scripting-mode mismatch failure',
  );
  assert.deepEqual(
    { css: fixtureRequests.noscriptCss, image: fixtureRequests.noscriptImage },
    noscriptCaptureRequestsBefore,
    'Fail-closed noscript delivery still exposed an author URL.',
  );

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body>',
    '<!-- note --!><script>window.__ossCommentBypassRan=1</script>',
    '<main id="oss-comment-bypass-marker">Comment close boundary</main>',
    '</body></html>',
  ].join(''));
  const commentBoundaryFrame = await waitForFrameWithSelector(page, '#oss-comment-bypass-marker');
  await commentBoundaryFrame.waitForFunction(() => window.__ossCommentBypassRan === 1);
  assert.equal(
    await commentBoundaryFrame.evaluate(() => window.__ossCommentBypassRan),
    1,
    'Chromium did not execute the script after the --!> comment close fixture.',
  );
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-png');
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-pdf');
  await assertNoActiveDeliveryResources(page, baseline, 'comment-close dynamic markup failure');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body>',
    '<!-----><script>window.__ossOverlappingCommentRan=1</script>',
    '<main id="oss-overlapping-comment-marker">Overlapping comment close boundary</main>',
    '</body></html>',
  ].join(''));
  const overlappingCommentFrame = await waitForFrameWithSelector(page, '#oss-overlapping-comment-marker');
  await overlappingCommentFrame.waitForFunction(() => window.__ossOverlappingCommentRan === 1);
  assert.equal(
    await overlappingCommentFrame.evaluate(() => window.__ossOverlappingCommentRan),
    1,
    'Chromium did not execute the script after the overlapping ---> comment close fixture.',
  );
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-png');
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-pdf');
  await assertNoActiveDeliveryResources(page, baseline, 'overlapping comment-close dynamic markup failure');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body>',
    "<!'<a><script>window.__ossBogusCommentRan=1</script>",
    '<main id="oss-bogus-comment-marker">Bogus comment boundary</main>',
    '</body></html>',
  ].join(''));
  const bogusCommentFrame = await waitForFrameWithSelector(page, '#oss-bogus-comment-marker');
  await bogusCommentFrame.waitForFunction(() => window.__ossBogusCommentRan === 1);
  assert.equal(
    await bogusCommentFrame.evaluate(() => window.__ossBogusCommentRan),
    1,
    'Chromium did not execute the script after the bogus-comment first > boundary.',
  );
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-png');
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-pdf');
  await assertNoActiveDeliveryResources(page, baseline, 'bogus comment dynamic markup failure');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><head>',
    `<style>${'İ'.repeat(9)}</style><script>window.__ossUnicodeRawTextRan=1</script>`,
    '</head><body><main id="oss-unicode-raw-text-marker">Unicode raw-text boundary</main></body></html>',
  ].join(''));
  const unicodeRawTextFrame = await waitForFrameWithSelector(page, '#oss-unicode-raw-text-marker');
  await unicodeRawTextFrame.waitForFunction(() => window.__ossUnicodeRawTextRan === 1);
  assert.equal(
    await unicodeRawTextFrame.evaluate(() => window.__ossUnicodeRawTextRan),
    1,
    'Chromium did not execute the script after the Unicode style raw-text fixture.',
  );
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-png');
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-pdf');
  await assertNoActiveDeliveryResources(page, baseline, 'Unicode raw-text dynamic markup failure');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><head>',
    '<style>.stylex-note::before{content:"</stylex><script>window.__ossStylexRan=1</script>"}</style>',
    '</head><body><main id="oss-stylex-marker" class="stylex-note">Style raw-text boundary</main></body></html>',
  ].join(''));
  const stylexFrame = await waitForFrameWithSelector(page, '#oss-stylex-marker');
  const stylexParse = await stylexFrame.evaluate(() => ({
    ran: window.__ossStylexRan === 1,
    scriptCount: document.querySelectorAll('script').length,
    styleText: document.querySelector('style')?.textContent ?? '',
  }));
  assert.equal(stylexParse.ran, false, 'Chromium executed script-like text inside the stylex fixture.');
  assert.equal(stylexParse.scriptCount, 0, 'Chromium parsed a script node from style raw text.');
  assert.match(stylexParse.styleText, /<\/stylex><script>/u);
  await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  await assertDownload(
    page,
    'oss-delivery-download-pdf',
    '.pdf',
    (content) => assertA4ImagePdf(content, 'Style raw-text boundary PDF'),
  );
  await assertNoActiveDeliveryResources(page, baseline, 'stylex static delivery');

  const alternateStylesheet = `data:text/css,${encodeURIComponent([
    'html,body{background:rgb(255,0,0)!important}',
    '#oss-alternate-stylesheet-marker{color:rgb(255,255,255)}',
  ].join(''))}`;
  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><head>',
    '<style>html,body{margin:0;min-height:480px;background:rgb(16,32,48)}</style>',
    `<link rel="alternate stylesheet" title="red" href="${alternateStylesheet}">`,
    '</head><body><main id="oss-alternate-stylesheet-marker">Inactive alternate stylesheet</main></body></html>',
  ].join(''));
  const alternateStylesheetFrame = await waitForFrameWithSelector(
    page,
    '#oss-alternate-stylesheet-marker',
  );
  await alternateStylesheetFrame.waitForFunction(() => (
    window.getComputedStyle(document.body).backgroundColor === 'rgb(16, 32, 48)'
  ));
  const alternatePng = await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  const alternatePixels = await inspectPngPixels(page, alternatePng.content, [
    { xRatio: 0.05, yRatio: 0.05 },
  ]);
  assertRgbaNear(
    alternatePixels.pixels[0],
    [16, 32, 48, 255],
    'inactive alternate stylesheet page background',
    14,
  );
  await assertDownload(
    page,
    'oss-delivery-download-pdf',
    '.pdf',
    (content) => assertA4ImagePdf(content, 'Inactive alternate stylesheet PDF'),
  );
  await assertNoActiveDeliveryResources(page, baseline, 'inactive alternate stylesheet delivery');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body>',
    '<a id="oss-entity-script-link" href="jav&#x61;script:window.__ossEntityScriptRan=1">Run entity URL</a>',
    '</body></html>',
  ].join(''));
  const entityScriptFrame = await waitForFrameWithSelector(page, '#oss-entity-script-link');
  assert.equal(
    await entityScriptFrame.locator('#oss-entity-script-link').getAttribute('href'),
    'javascript:window.__ossEntityScriptRan=1',
    'Chromium did not decode the HTML entity inside the javascript URL fixture.',
  );
  const entityControlPage = await page.context().newPage();
  try {
    await entityControlPage.setContent([
      '<!doctype html><html><body>',
      '<a id="oss-entity-script-control" href="jav&#x61;script:window.__ossEntityScriptRan=1">Run entity URL</a>',
      '</body></html>',
    ].join(''));
    await entityControlPage.locator('#oss-entity-script-control').click();
    await entityControlPage.waitForFunction(() => window.__ossEntityScriptRan === 1);
  } finally {
    await entityControlPage.close();
  }
  await assertDynamicDeliveryRejectedBeforeAllocation(
    page,
    baseline,
    'entity script URL dynamic markup failure',
  );

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body><math><mtext>',
    '<span id="oss-mathml-integration-proof">MathML integration point</span>',
    '<script>window.__ossMathMlScriptRan=1</script>',
    '</mtext></math></body></html>',
  ].join(''));
  const mathMlScriptFrame = await waitForFrameWithSelector(page, '#oss-mathml-integration-proof');
  await mathMlScriptFrame.waitForFunction(() => window.__ossMathMlScriptRan === 1);
  assert.equal(
    await mathMlScriptFrame.evaluate(() => window.__ossMathMlScriptRan),
    1,
    'Chromium did not execute the HTML script nested through the MathML integration point.',
  );
  await assertDynamicDeliveryRejectedBeforeAllocation(
    page,
    baseline,
    'MathML integration script dynamic markup failure',
  );

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><head><meta http-equiv="refresh" content="0;url=about:blank#oss-meta-refresh"></head>',
    '<body><main>Meta refresh boundary</main></body></html>',
  ].join(''));
  const refreshedFrame = await waitForFrameWithUrl(page, /about:blank#oss-meta-refresh$/u);
  assert.match(refreshedFrame.url(), /about:blank#oss-meta-refresh$/u);
  await assertDynamicDeliveryRejectedBeforeAllocation(page, baseline, 'meta refresh dynamic markup failure');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body>',
    '<button id="oss-popover-invoker" popovertarget="oss-native-popover">Toggle popover</button>',
    '<div id="oss-native-popover" popover>Native popover state</div>',
    '<button id="oss-command-invoker" commandfor="oss-command-popover" command="show-popover">Command popover</button>',
    '<div id="oss-command-popover" popover>Native command state</div>',
    '</body></html>',
  ].join(''));
  const popoverFrame = await waitForFrameWithSelector(page, '#oss-popover-invoker');
  assert.deepEqual(
    await popoverFrame.locator('#oss-native-popover').evaluate(target => ({
      display: window.getComputedStyle(target).display,
      open: target.matches(':popover-open'),
    })),
    { display: 'none', open: false },
    'Chromium did not start the native popover fixture closed.',
  );
  await popoverFrame.locator('#oss-popover-invoker').click();
  assert.deepEqual(
    await popoverFrame.locator('#oss-native-popover').evaluate(target => ({
      display: window.getComputedStyle(target).display,
      open: target.matches(':popover-open'),
    })),
    { display: 'block', open: true },
    'Chromium did not expose the native popover runtime state change inside the product sandbox.',
  );
  await popoverFrame.locator('#oss-command-invoker').click();
  assert.deepEqual(
    await popoverFrame.locator('#oss-command-popover').evaluate(target => ({
      display: window.getComputedStyle(target).display,
      open: target.matches(':popover-open'),
    })),
    { display: 'block', open: true },
    'Chromium did not expose the command/commandfor runtime state change inside the product sandbox.',
  );
  await assertDynamicDeliveryRejectedBeforeAllocation(page, baseline, 'native popover dynamic markup failure');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body><div id="oss-shadow-animation-host">',
    '<template shadowrootmode="open">',
    '<style>@keyframes oss-shadow-pulse{from{opacity:.1}to{opacity:.9}}#oss-shadow-animation-target{animation:oss-shadow-pulse .05s infinite alternate}</style>',
    '<span id="oss-shadow-animation-target">Shadow animation</span>',
    '</template></div></body></html>',
  ].join(''));
  const shadowAnimationFrame = await waitForFrameWithSelector(page, '#oss-shadow-animation-host');
  await shadowAnimationFrame.waitForFunction(() => {
    const host = document.querySelector('#oss-shadow-animation-host');
    const target = host?.shadowRoot?.querySelector('#oss-shadow-animation-target');
    return target?.getAnimations().some(animation => animation.playState === 'running') === true;
  });
  assert.equal(
    await shadowAnimationFrame.evaluate(() => (
      document.querySelector('#oss-shadow-animation-host')?.shadowRoot
        ?.querySelector('#oss-shadow-animation-target')?.getAnimations().length
    )),
    1,
    'Chromium did not instantiate the declarative shadow-root CSS animation fixture.',
  );
  await assertDynamicDeliveryRejectedBeforeAllocation(
    page,
    baseline,
    'shadow CSS animation dynamic markup failure',
  );

  const startingStyleHtml = [
    '<!doctype html>',
    '<html><head><style>',
    '#oss-starting-style-target{opacity:1;transition:opacity 2s linear}',
    '@starting-style{#oss-starting-style-target{opacity:0}}',
    '</style></head><body>',
    '<main id="oss-starting-style-target">Starting style transition</main>',
    '</body></html>',
  ].join('');
  await replaceSourceAndOpenFinal(page, startingStyleHtml);
  const startingStyleFrame = await waitForFrameWithSelector(page, '#oss-starting-style-target');
  await startingStyleFrame.waitForFunction(() => (
    Number.parseFloat(window.getComputedStyle(document.querySelector('#oss-starting-style-target')).opacity) > 0.99
  ));
  const startingStyleControl = await page.context().newPage();
  try {
    await startingStyleControl.setContent(startingStyleHtml, { waitUntil: 'load' });
    assert.ok(
      await startingStyleControl.locator('#oss-starting-style-target').evaluate((target) => (
        Number.parseFloat(window.getComputedStyle(target).opacity)
      )) < 0.5,
      'A fresh Chromium document did not expose the @starting-style entry transition.',
    );
  } finally {
    await startingStyleControl.close();
  }
  await assertDynamicDeliveryRejectedBeforeAllocation(
    page,
    baseline,
    '@starting-style transition dynamic markup failure',
  );

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><head><style>@keyframes oss-comment-pulse{from{opacity:.1}to{opacity:.9}}#oss-comment-animation-target{ani/**/mation:oss-comment-pulse .05s infinite alternate}</style></head>',
    '<body><main id="oss-comment-animation-target">Comment-obfuscated animation</main></body></html>',
  ].join(''));
  const commentAnimationFrame = await waitForFrameWithSelector(page, '#oss-comment-animation-target');
  assert.equal(
    await commentAnimationFrame.locator('#oss-comment-animation-target').evaluate(target => target.getAnimations().length),
    0,
    'Chromium unexpectedly treated ani/**/mation as a live animation property.',
  );
  await assertDynamicDeliveryRejectedBeforeAllocation(
    page,
    baseline,
    'comment-obfuscated CSS conservative rejection',
  );

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body><svg viewBox="0 0 80 20">',
    '<rect id="oss-svg-animation-target" x="0" y="0" width="10" height="10">',
    '<animate attributeName="x" values="0;60" dur=".1s" repeatCount="indefinite"></animate>',
    '</rect></svg></body></html>',
  ].join(''));
  const svgAnimationFrame = await waitForFrameWithSelector(page, '#oss-svg-animation-target');
  await svgAnimationFrame.waitForFunction(() => {
    const target = document.querySelector('#oss-svg-animation-target');
    return (target?.x?.animVal.value ?? 0) > 1;
  });
  assert.ok(
    await svgAnimationFrame.locator('#oss-svg-animation-target').evaluate(target => target.x.animVal.value) > 1,
    'Chromium did not advance the SVG SMIL animation fixture.',
  );
  await assertDynamicDeliveryRejectedBeforeAllocation(page, baseline, 'SVG animation dynamic markup failure');

  const legacyFrameDataSvg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="20">',
    '<rect id="oss-frame-data-animation-target" width="10" height="20">',
    '<animate attributeName="width" from="10" to="100" dur="1s" repeatCount="indefinite"></animate>',
    '</rect></svg>',
  ].join('');
  await replaceSourceAndOpenFinal(page, [
    '<!doctype html><html><head><title>Legacy frame data SVG</title></head>',
    '<frameset>',
    `<frame src="data:image/svg+xml,${encodeURIComponent(legacyFrameDataSvg)}">`,
    '</frameset></html>',
  ].join(''));
  const legacyFrameDataSvgFrame = await waitForFrameWithSelector(
    page,
    '#oss-frame-data-animation-target',
  );
  await page.waitForTimeout(200);
  const legacyFrameWidthBefore = await legacyFrameDataSvgFrame
    .locator('#oss-frame-data-animation-target')
    .evaluate(target => window.getComputedStyle(target).width);
  await page.waitForTimeout(500);
  const legacyFrameWidthAfter = await legacyFrameDataSvgFrame
    .locator('#oss-frame-data-animation-target')
    .evaluate(target => window.getComputedStyle(target).width);
  assert.notEqual(
    legacyFrameWidthBefore,
    legacyFrameWidthAfter,
    `Chromium legacy frame data SVG fixture did not animate: ${legacyFrameWidthBefore}`,
  );
  await assertDynamicDeliveryRejectedBeforeAllocation(
    page,
    baseline,
    'legacy frame data SVG dynamic markup failure',
  );

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body>',
    '<marquee behavior="scroll" direction="left" scrollamount="18" style="width:240px">',
    '<span id="oss-marquee-target">Moving marquee content</span>',
    '</marquee>',
    '</body></html>',
  ].join(''));
  const marqueeFrame = await waitForFrameWithSelector(page, '#oss-marquee-target');
  const marqueeMovement = await marqueeFrame.locator('#oss-marquee-target').evaluate((target) => new Promise((resolve) => {
    const before = target.getBoundingClientRect().left;
    setTimeout(() => resolve({ after: target.getBoundingClientRect().left, before }), 350);
  }));
  assert.ok(
    Math.abs(marqueeMovement.after - marqueeMovement.before) > 1,
    `Chromium marquee fixture did not move: ${JSON.stringify(marqueeMovement)}`,
  );
  await assertDynamicDeliveryRejectedBeforeAllocation(page, baseline, 'marquee dynamic markup failure');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body>',
    '<progress id="oss-indeterminate-progress" style="width:300px;height:40px">Loading</progress>',
    '<div id="oss-progress-static-control" style="width:300px;height:40px;background:#ccd5df">Static</div>',
    '</body></html>',
  ].join(''));
  const progressFrame = await waitForFrameWithSelector(page, '#oss-indeterminate-progress');
  const progressTarget = progressFrame.locator('#oss-indeterminate-progress');
  const progressStaticControl = progressFrame.locator('#oss-progress-static-control');
  assert.equal(
    await progressTarget.evaluate(target => target.matches(':indeterminate')),
    true,
    'Chromium did not expose the no-value progress fixture as indeterminate.',
  );
  const progressBefore = await progressTarget.screenshot();
  const progressControlBefore = await progressStaticControl.screenshot();
  await page.waitForTimeout(350);
  const progressAfter = await progressTarget.screenshot();
  const progressControlAfter = await progressStaticControl.screenshot();
  assert.equal(
    Buffer.compare(progressControlBefore, progressControlAfter),
    0,
    'Chromium screenshot encoder changed a static control between frames.',
  );
  assert.notEqual(
    Buffer.compare(progressBefore, progressAfter),
    0,
    'Chromium indeterminate progress pixels did not change between frames.',
  );
  await assertDynamicDeliveryRejectedBeforeAllocation(
    page,
    baseline,
    'indeterminate progress dynamic markup failure',
  );

  const dynamicDataStylesheet = [
    'data:text/css,',
    '%40keyframes%20oss-data-pulse%7Bfrom%7Bopacity%3A.1%7Dto%7Bopacity%3A.9%7D%7D',
    '%23oss-data-animation-target%7Banimation%3Aoss-data-pulse%20.05s%20infinite%20alternate%7D',
  ].join('');
  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    `<html><head><style>@import url("${dynamicDataStylesheet}");</style></head>`,
    '<body><main id="oss-data-animation-target">Imported animation</main></body></html>',
  ].join(''));
  const importedAnimationFrame = await waitForFrameWithSelector(page, '#oss-data-animation-target');
  await importedAnimationFrame.waitForFunction(() => (
    document.querySelector('#oss-data-animation-target')?.getAnimations().length === 1
  ));
  await assertDynamicDeliveryRejectedBeforeAllocation(
    page,
    baseline,
    'CSS import dynamic markup failure',
  );

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    `<html><head><link rel="stylesheet" href="${dynamicDataStylesheet}"></head>`,
    '<body><main id="oss-data-animation-target">Linked animation</main></body></html>',
  ].join(''));
  const linkedAnimationFrame = await waitForFrameWithSelector(page, '#oss-data-animation-target');
  await linkedAnimationFrame.waitForFunction(() => (
    document.querySelector('#oss-data-animation-target')?.getAnimations().length === 1
  ));
  await assertDynamicDeliveryRejectedBeforeAllocation(
    page,
    baseline,
    'stylesheet link dynamic markup failure',
  );

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html><html><head>',
    `<link rel="preload prefetch" as="image" href="${fixtureBaseUrl}/proactive-link.png">`,
    `<style>@\\69mport/**/url("${fixtureBaseUrl}/escaped-import.css");</style>`,
    '</head><body><main class="escaped-import-card">Frozen import</main></body></html>',
  ].join(''));
  const escapedImportFrame = await waitForFrameWithSelector(page, '.escaped-import-card');
  await escapedImportFrame.waitForFunction(() => (
    window.getComputedStyle(document.querySelector('.escaped-import-card')).color === 'rgb(23, 87, 145)'
  ));
  const escapedImportRequestsBefore = fixtureRequests.escapedImportCss;
  const proactiveRequestsBefore = fixtureRequests.proactiveLinkImage;
  await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  assert.equal(
    fixtureRequests.escapedImportCss,
    escapedImportRequestsBefore + 1,
    'Escaped @import must be frozen once and never requested again from Blob CSS.',
  );
  assert.equal(
    fixtureRequests.proactiveLinkImage,
    proactiveRequestsBefore,
    'Capture srcdoc must neutralize preload/prefetch links before insertion.',
  );
  await assertNoActiveDeliveryResources(page, baseline, 'escaped import and proactive link delivery');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><head>',
    '<style>html,body{margin:0;min-height:480px;background:#102030}body{display:grid;place-items:center}',
    `.media-context-card{width:240px;height:140px;background:#cc3366 url("${fixtureBaseUrl}/active-media.png") center/cover no-repeat}`,
    `@media print{.media-context-card{background-image:url("${fixtureBaseUrl}/inactive-print.png?source=inline")}}</style>`,
    '</head><body><div class="media-context-card"></div></body></html>',
  ].join(''));
  const mediaFrame = await waitForFrameWithSelector(page, '.media-context-card');
  await mediaFrame.waitForFunction(() => (
    window.getComputedStyle(document.querySelector('.media-context-card')).backgroundImage.includes('active-media.png')
  ));
  const activeMediaRequestsBefore = fixtureRequests.activeMediaImage;
  const inactivePrintRequestsBefore = fixtureRequests.inactivePrintImage;
  const mediaContextPng = await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  assert.equal(
    fixtureRequests.activeMediaImage,
    activeMediaRequestsBefore + 1,
    'Capture must freeze the active raster exactly once and never refetch its author URL.',
  );
  assert.equal(
    fixtureRequests.inactivePrintImage,
    inactivePrintRequestsBefore + 1,
    'Capture must freeze a currently inactive media resource before its viewport can change.',
  );
  const mediaContextPixels = await inspectPngPixels(page, mediaContextPng.content, [
    { xRatio: 0.02, yRatio: 0.02 },
    { xRatio: 0.5, yRatio: 0.25 },
  ]);
  assertRgbaNear(mediaContextPixels.pixels[0], [16, 32, 48, 255], 'media-context page background', 14);
  assertRgbaNear(mediaContextPixels.pixels[1], [37, 199, 104, 255], 'active screen CSS image', 18);
  await assertNoActiveDeliveryResources(page, baseline, 'media-context delivery');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><head><style>html,body{margin:0;min-height:480px;background:#102030}body{display:grid;place-items:center}.slow-card{width:240px;height:140px;background:#12a4e6}.slow-card img{width:1px;height:1px;opacity:.01}</style></head>',
    `<body><div class="slow-card"><img alt="slow capture fixture" src="${fixtureBaseUrl}/slow-image.png?case=complete"></div></body></html>`,
  ].join(''));
  const slowFrame = await waitForFrameWithSelector(page, '.slow-card img');
  await slowFrame.waitForFunction(() => document.querySelector('.slow-card img')?.complete === true);
  const slowImageRequestsBefore = fixtureRequests.slowImage;
  const slowStartedAt = Date.now();
  const slowPng = await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  assert.ok(
    Date.now() - slowStartedAt >= slowCssDelayMs - 100,
    'PNG delivery completed before the slow author image could load.',
  );
  assert.equal(
    fixtureRequests.slowImage,
    slowImageRequestsBefore + 1,
    'Capture must fetch the slow author image once for freezing and never refetch it from html2canvas.',
  );
  const slowPixels = await inspectPngPixels(page, slowPng.content, [
    { xRatio: 0.02, yRatio: 0.02 },
    { xRatio: 0.5, yRatio: 0.25 },
  ]);
  assert.ok(slowPixels.width >= 1_354, 'Scale-2 PNG width did not preserve the public capture policy.');
  assertRgbaNear(slowPixels.pixels[0], [16, 32, 48, 255], 'slow stylesheet page background', 14);
  assertRgbaNear(slowPixels.pixels[1], [18, 164, 230, 255], 'slow stylesheet centered card', 18);
  await assertNoActiveDeliveryResources(page, baseline, 'slow image delivery');

  await replaceSourceAndOpenFinal(page, [
    '# Frozen operation clone',
    '',
    `![operation clone fixture](${fixtureBaseUrl}/clone-image.png?case=normal-clone)`,
  ].join('\n'));
  const operationCloneImage = page.locator(
    '[data-public-preview-root="true"] img[alt="operation clone fixture"]',
  );
  await operationCloneImage.waitFor({ state: 'visible' });
  await operationCloneImage.evaluate(image => image.decode());
  await page.locator('[data-public-preview-root="true"]').evaluate((root, href) => {
    const link = document.createElement('link');
    link.rel = 'preload prefetch';
    link.as = 'image';
    link.href = href;
    root.appendChild(link);
  }, `${fixtureBaseUrl}/proactive-link.png?case=normal-clone`);
  await page.waitForTimeout(150);
  const cloneImageRequestsBefore = fixtureRequests.cloneImage;
  const normalProactiveRequestsBefore = fixtureRequests.proactiveLinkImage;
  await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  assert.equal(
    fixtureRequests.cloneImage,
    cloneImageRequestsBefore + 1,
    'Normal capture may fetch the author image once for its snapshot; clone creation and rendering must not refetch it.',
  );
  assert.equal(
    fixtureRequests.proactiveLinkImage,
    normalProactiveRequestsBefore,
    'Normal capture must omit preload/prefetch links before creating its operation clone.',
  );
  await assertNoActiveDeliveryResources(page, baseline, 'normal frozen clone delivery');

  await replaceSourceAndOpenFinal(page, '# Live runtime state snapshot');
  const runtimeGeometry = await page.locator('[data-public-preview-root="true"]').evaluate((root) => {
    const probe = document.createElement('section');
    probe.setAttribute('data-oss-runtime-probe', 'true');
    probe.style.cssText = 'display:grid;gap:8px;padding:8px;background:#f7f8fa;color:#111';

    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-oss-runtime-canvas', 'true');
    canvas.width = 120;
    canvas.height = 80;
    canvas.style.cssText = 'display:block;width:120px;height:80px';
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Runtime fixture canvas is unavailable.');
    context.fillStyle = '#d62dad';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const input = document.createElement('input');
    input.setAttribute('data-oss-runtime-input', 'true');
    input.setAttribute('value', 'stale-input');
    input.value = 'live-input';

    const checkbox = document.createElement('input');
    checkbox.setAttribute('data-oss-runtime-checkbox', 'true');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.indeterminate = true;

    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-oss-runtime-textarea', 'true');
    textarea.textContent = 'stale-textarea';
    textarea.value = 'live-textarea';

    const select = document.createElement('select');
    select.setAttribute('data-oss-runtime-select', 'true');
    const firstOption = new window.Option('First', 'first', true, true);
    const secondOption = new window.Option('Second', 'second', false, false);
    select.append(firstOption, secondOption);
    select.selectedIndex = 1;

    const details = document.createElement('details');
    details.setAttribute('data-oss-runtime-details', 'true');
    details.innerHTML = '<summary>Runtime details</summary><div>Live details body</div>';
    details.open = true;

    probe.append(canvas, input, checkbox, textarea, select, details);
    root.prepend(probe);
    const rootRect = root.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const captureWidth = Math.max(1, Math.ceil(rootRect.width), root.clientWidth, 677);
    const captureHeight = Math.max(
      Math.ceil(rootRect.height),
      root.scrollHeight,
      root.offsetHeight,
      root.clientHeight,
    );
    return {
      xRatio: (canvasRect.left - rootRect.left + (canvasRect.width / 2)) / captureWidth,
      yRatio: (canvasRect.top - rootRect.top + (canvasRect.height / 2)) / captureHeight,
    };
  });
  const runtimeAuditBefore = await readDeliveryResourceAudit(page);
  const runtimePng = await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  const runtimeAuditAfter = await readDeliveryResourceAudit(page);
  assert.equal(
    runtimeAuditAfter.runtimeSnapshotCount,
    runtimeAuditBefore.runtimeSnapshotCount + 1,
    'The operation-owned capture tree was not observed exactly once.',
  );
  assert.deepEqual(runtimeAuditAfter.runtimeSnapshot, {
    canvasPixel: [214, 45, 173, 255],
    checkboxAttribute: true,
    checkboxChecked: true,
    checkboxIndeterminate: true,
    detailsAttribute: true,
    detailsOpen: true,
    inputAttribute: 'live-input',
    inputValue: 'live-input',
    selectedAttributes: [false, true],
    selectedValues: ['second'],
    textareaText: 'live-textarea',
    textareaValue: 'live-textarea',
  });
  const runtimePixels = await inspectPngPixels(page, runtimePng.content, [runtimeGeometry]);
  assertRgbaNear(
    runtimePixels.pixels[0],
    [214, 45, 173, 255],
    'operation-owned live canvas bitmap',
    4,
  );
  await assertNoActiveDeliveryResources(page, baseline, 'runtime state snapshot delivery');

  await replaceSourceAndOpenFinal(page, '# Unsupported live video state');
  await page.locator('[data-public-preview-root="true"]').evaluate((root) => {
    const video = document.createElement('video');
    video.setAttribute('data-oss-runtime-video', 'true');
    root.appendChild(video);
  });
  await assertDynamicDeliveryRejectedBeforeAllocation(page, baseline, 'live video state failure');

  const malformedConsoleStart = consoleErrors.length;
  await replaceSourceAndOpenFinal(page, [
    '<!doctype html><html><head><style>',
    `html,body{min-height:400px}.invalid-raster{width:220px;height:120px;background:url("${fixtureBaseUrl}/invalid-raster.jpg")}`,
    '</style></head><body><div class="invalid-raster">invalid raster</div></body></html>',
  ].join(''));
  const invalidRasterFrame = await waitForFrameWithSelector(page, '.invalid-raster');
  await invalidRasterFrame.waitForTimeout(150);
  let malformedRequestsBefore = fixtureRequests.invalidRaster;
  await assertDeliveryFailureWithoutDownload(
    page,
    'oss-delivery-download-png',
    /CORS|跨域|remote resource/iu,
  );
  assert.equal(
    fixtureRequests.invalidRaster,
    malformedRequestsBefore + 1,
    'Malformed raster PNG failure must perform one snapshot fetch and no clone/render refetch.',
  );
  malformedRequestsBefore = fixtureRequests.invalidRaster;
  await assertDeliveryFailureWithoutDownload(
    page,
    'oss-delivery-download-pdf',
    /CORS|跨域|remote resource/iu,
  );
  assert.equal(
    fixtureRequests.invalidRaster,
    malformedRequestsBefore + 1,
    'Malformed raster PDF failure must perform one snapshot fetch and no clone/render refetch.',
  );
  await assertNoActiveDeliveryResources(page, baseline, 'malformed raster decode failure');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html><html><head><style>',
    `@font-face{font-family:InvalidCaptureFont;src:url("${fixtureBaseUrl}/invalid-font.woff") format("woff")}`,
    '.invalid-font{font:32px InvalidCaptureFont,sans-serif}',
    '</style></head><body><div class="invalid-font">invalid font</div></body></html>',
  ].join(''));
  const invalidFontFrame = await waitForFrameWithSelector(page, '.invalid-font');
  await invalidFontFrame.evaluate(() => document.fonts.ready);
  malformedRequestsBefore = fixtureRequests.invalidFont;
  await assertDeliveryFailureWithoutDownload(
    page,
    'oss-delivery-download-png',
    /CORS|跨域|remote resource/iu,
  );
  assert.equal(
    fixtureRequests.invalidFont,
    malformedRequestsBefore + 1,
    'Malformed font PNG failure must perform one snapshot fetch and no clone/render refetch.',
  );
  malformedRequestsBefore = fixtureRequests.invalidFont;
  await assertDeliveryFailureWithoutDownload(
    page,
    'oss-delivery-download-pdf',
    /CORS|跨域|remote resource/iu,
  );
  assert.equal(
    fixtureRequests.invalidFont,
    malformedRequestsBefore + 1,
    'Malformed font PDF failure must perform one snapshot fetch and no clone/render refetch.',
  );
  await page.waitForTimeout(100);
  const expectedMalformedErrors = consoleErrors.splice(malformedConsoleStart);
  assert.equal(
    expectedMalformedErrors.every(message => (
      /Failed to decode downloaded font|OTS parsing error|Failed to load resource/iu.test(message)
    )),
    true,
    `Unexpected console error during malformed decode cases: ${expectedMalformedErrors.join('\n')}`,
  );
  await assertNoActiveDeliveryResources(page, baseline, 'malformed font decode failure');

  const cssSemanticsConsoleStart = consoleErrors.length;
  await replaceSourceAndOpenFinal(page, [
    '<!doctype html><html><head>',
    `<link rel="stylesheet" href="${fixtureBaseUrl}/invalid-css-mime.css">`,
    '</head><body><div class="invalid-css-mime">strict MIME</div></body></html>',
  ].join(''));
  const invalidCssMimeFrame = await waitForFrameWithSelector(page, '.invalid-css-mime');
  await invalidCssMimeFrame.waitForTimeout(200);
  assert.notEqual(
    await invalidCssMimeFrame.locator('.invalid-css-mime').evaluate(element => (
      window.getComputedStyle(element).color
    )),
    'rgb(191, 47, 83)',
    'Chromium unexpectedly applied a text/plain stylesheet under strict MIME checking.',
  );
  let invalidCssRequestsBefore = fixtureRequests.invalidCssMime;
  await assertDynamicDeliveryRejectedBeforeAllocation(
    page,
    baseline,
    'strict stylesheet MIME failure',
    /CORS|跨域|remote resource/iu,
  );
  assert.equal(
    fixtureRequests.invalidCssMime,
    invalidCssRequestsBefore + 2,
    'PNG and PDF must each reject strict-MIME CSS after one preflight read.',
  );

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html><html><head>',
    `<link rel="stylesheet" href="${fixtureBaseUrl}/invalid-css-encoding.css">`,
    '</head><body><div class="invalid-css-encoding">invalid UTF-8</div></body></html>',
  ].join(''));
  const invalidCssEncodingFrame = await waitForFrameWithSelector(page, '.invalid-css-encoding');
  await invalidCssEncodingFrame.waitForFunction(() => (
    window.getComputedStyle(document.querySelector('.invalid-css-encoding')).color
      === 'rgb(31, 117, 199)'
  ));
  invalidCssRequestsBefore = fixtureRequests.invalidCssEncoding;
  await assertDynamicDeliveryRejectedBeforeAllocation(
    page,
    baseline,
    'invalid stylesheet encoding failure',
    /CORS|跨域|remote resource/iu,
  );
  assert.equal(
    fixtureRequests.invalidCssEncoding,
    invalidCssRequestsBefore + 2,
    'PNG and PDF must each reject invalid UTF-8 CSS after one preflight read.',
  );
  await page.waitForTimeout(100);
  const expectedCssSemanticsErrors = consoleErrors.splice(cssSemanticsConsoleStart);
  // Opaque sandbox frames do not consistently forward strict-MIME console
  // diagnostics. The computed-style assertion above is the browser proof;
  // when Chromium does surface diagnostics, keep them constrained here.
  assert.equal(
    expectedCssSemanticsErrors.every(message => (
      /MIME type .*text\/plain|strict MIME checking|Failed to load resource/iu.test(message)
    )),
    true,
    `Unexpected console error during stylesheet semantic cases: ${expectedCssSemanticsErrors.join('\n')}`,
  );
  await assertNoActiveDeliveryResources(page, baseline, 'stylesheet MIME and encoding failures');

  const noCorsRequestsBefore = fixtureRequests.noCorsImage;
  const noCorsConsoleStart = consoleErrors.length;
  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body>',
    `<img alt="unreadable CORS fixture" src="${fixtureBaseUrl}/no-cors.png?case=fail-closed">`,
    '</body></html>',
  ].join(''));
  await assertDeliveryFailureWithoutDownload(
    page,
    'oss-delivery-download-png',
    /CORS|跨域|remote resource/iu,
  );
  assert.ok(fixtureRequests.noCorsImage > noCorsRequestsBefore, 'No-CORS image fixture was not requested.');
  await page.waitForTimeout(100);
  const expectedNoCorsErrors = consoleErrors.splice(noCorsConsoleStart);
  assert.ok(
    expectedNoCorsErrors.some((message) => (
      /^Access to fetch at 'http:\/\/127\.0\.0\.1:\d+\/no-cors\.png\?case=fail-closed'.*blocked by CORS policy:/u
        .test(message)
    )),
    'The no-CORS fixture did not produce Chromium\'s expected CORS rejection.',
  );
  assert.equal(
    expectedNoCorsErrors.every((message) => (
      /^Access to fetch at 'http:\/\/127\.0\.0\.1:\d+\/no-cors\.png\?case=fail-closed'.*blocked by CORS policy:/u
        .test(message) || message === 'Failed to load resource: net::ERR_FAILED'
    )),
    true,
    `Unexpected console error during the no-CORS negative case: ${expectedNoCorsErrors.join('\n')}`,
  );
  await assertNoActiveDeliveryResources(page, baseline, 'CORS failure');

  const noCorsCssRequestsBefore = fixtureRequests.noCorsCss;
  const noCorsCssConsoleStart = consoleErrors.length;
  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><head>',
    `<link rel="stylesheet" href="${fixtureBaseUrl}/no-cors.css?case=fail-closed">`,
    '</head><body><div class="no-cors-card"></div></body></html>',
  ].join(''));
  const noCorsCssFrame = await waitForFrameWithSelector(page, '.no-cors-card');
  await noCorsCssFrame.waitForFunction(() => (
    window.getComputedStyle(document.documentElement).backgroundColor === 'rgb(122, 29, 78)'
  ));
  await assertDynamicDeliveryRejectedBeforeAllocation(
    page,
    baseline,
    'unprovable external stylesheet failure',
    /CORS|跨域|remote resource/iu,
  );
  assert.ok(fixtureRequests.noCorsCss > noCorsCssRequestsBefore, 'No-CORS stylesheet fixture was not requested.');
  await page.waitForTimeout(100);
  const expectedNoCorsCssErrors = consoleErrors.splice(noCorsCssConsoleStart);
  assert.ok(
    expectedNoCorsCssErrors.some(message => (
      /^Access to fetch at 'http:\/\/127\.0\.0\.1:\d+\/no-cors\.css\?case=fail-closed'.*blocked by CORS policy:/u
        .test(message)
    )),
    'The no-CORS stylesheet fixture did not produce Chromium\'s expected CORS rejection.',
  );
  assert.equal(
    expectedNoCorsCssErrors.every(message => (
      /^Access to fetch at 'http:\/\/127\.0\.0\.1:\d+\/no-cors\.css\?case=fail-closed'.*blocked by CORS policy:/u
        .test(message) || message === 'Failed to load resource: net::ERR_FAILED'
    )),
    true,
    `Unexpected console error during the no-CORS stylesheet case: ${expectedNoCorsCssErrors.join('\n')}`,
  );

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body><label>Mutable <input value="initial"></label></body></html>',
  ].join(''));
  await assertDeliveryFailureWithoutDownload(
    page,
    'oss-delivery-download-png',
    /请下载 HTML|download HTML/iu,
  );
  await assertNoActiveDeliveryResources(page, baseline, 'mutable form fail-closed');

  const frameHtml = '<!doctype html><html><body style="margin:0;min-height:440px;background:#ddeeff">oversized frame</body></html>';
  const oversizedMixed = [
    '# Operation-wide pixel budget',
    ...Array.from({ length: 6 }, (_, index) => [
      '',
      '```html',
      frameHtml.replace('oversized frame', `oversized frame ${index + 1}`),
      '```',
    ].join('\n')),
  ].join('\n');
  await replaceSourceAndOpenFinal(page, oversizedMixed);
  const allocationAuditBefore = await readDeliveryResourceAudit(page);
  await assertDeliveryFailureWithoutDownload(
    page,
    'oss-delivery-download-png',
    /安全截图上限|safe screenshot limit|browser safe/iu,
  );
  const allocationAuditAfter = await readDeliveryResourceAudit(page);
  assert.equal(
    allocationAuditAfter.modernSandboxesAdded,
    allocationAuditBefore.modernSandboxesAdded,
    'Oversized multi-frame delivery allocated a modern-screenshot sandbox before the operation-wide budget failed.',
  );
  assert.equal(
    allocationAuditAfter.html2canvasContainersAdded,
    allocationAuditBefore.html2canvasContainersAdded,
    'Oversized multi-frame delivery allocated an html2canvas container before the operation-wide budget failed.',
  );
  await assertNoActiveDeliveryResources(page, baseline, 'operation-wide pixel failure');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body>',
    `<img alt="slow source cancellation fixture" src="${fixtureBaseUrl}/slow-image.png?case=cancel-${Date.now()}">`,
    '</body></html>',
  ].join(''));
  let cancelledDownloads = 0;
  const onCancelledDownload = () => { cancelledDownloads += 1; };
  page.on('download', onCancelledDownload);
  try {
    await clickByTestId(page, 'oss-delivery-download-png');
    await page.locator('.aad-preview-share-button.is-loading').waitFor({ state: 'visible' });
    await sourceModeButton(page).click();
    await page.locator('.md-public-source-editor textarea').first().fill('# New source cancels old delivery');
    await page.waitForTimeout(slowCssDelayMs + 450);
    assert.equal(cancelledDownloads, 0, 'A stale delivery downloaded after Source changed.');
  } finally {
    page.off('download', onCancelledDownload);
  }
  await assertNoActiveDeliveryResources(page, baseline, 'source-change cancellation');

  await replaceSourceAndOpenFinal(page, [
    '<!doctype html>',
    '<html><body>',
    `<img alt="slow theme cancellation fixture" src="${fixtureBaseUrl}/slow-image.png?case=theme-cancel-${Date.now()}">`,
    '</body></html>',
  ].join(''));
  let themeCancelledDownloads = 0;
  const onThemeCancelledDownload = () => { themeCancelledDownloads += 1; };
  page.on('download', onThemeCancelledDownload);
  try {
    await clickByTestId(page, 'oss-delivery-download-png');
    await page.locator('.aad-preview-share-button.is-loading').waitFor({ state: 'visible' });
    await setWorkspaceTheme(page, 'dark');
    await page.waitForTimeout(slowCssDelayMs + 450);
    assert.equal(themeCancelledDownloads, 0, 'A stale delivery downloaded after the theme changed.');
  } finally {
    page.off('download', onThemeCancelledDownload);
  }
  await assertNoActiveDeliveryResources(page, baseline, 'theme-change cancellation');
  await setWorkspaceTheme(page, 'light');

  await replaceSourceAndOpenFinal(page, '# Standalone timeout\n\nA hanging local stylesheet must fail closed.');
  await page.evaluate(async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/oss-e2e-root.css';
    link.dataset.ossE2eTimeoutCss = 'true';
    const loaded = new Promise((resolve, reject) => {
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', () => reject(new Error('timeout CSS fixture failed to load')), { once: true });
    });
    document.head.append(link);
    await loaded;
  });
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.__ossOriginalFetch = originalFetch;
    window.fetch = (input, init) => {
      const href = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      if (!href.includes('/oss-e2e-nested.css')) return originalFetch(input, init);
      return new Promise((_, reject) => {
        const signal = init?.signal;
        const abort = () => reject(signal?.reason ?? new window.DOMException('Aborted', 'AbortError'));
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
      });
    };
  });
  const standaloneTimeoutStartedAt = Date.now();
  try {
    await assertDeliveryFailureWithoutDownload(
      page,
      'oss-delivery-download-html',
      /超时|timeout|standalone/iu,
    );
    assert.ok(
      Date.now() - standaloneTimeoutStartedAt >= 9_500,
      'Standalone local resource timeout fired before its bounded 10-second window.',
    );
  } finally {
    await page.evaluate(() => {
      if (window.__ossOriginalFetch) window.fetch = window.__ossOriginalFetch;
      delete window.__ossOriginalFetch;
      document.querySelector('link[data-oss-e2e-timeout-css="true"]')?.remove();
    });
  }
  await assertNoActiveDeliveryResources(page, baseline, 'standalone local resource timeout');

  await replaceSourceAndOpenFinal(page, '# Delivery hardening complete\n\nStable final capture.');
};

const runMermaidImmediateDeliveryFlow = async (page) => {
  const sourceButton = sourceModeButton(page);
  const finalButton = page.getByRole('button', { name: /^(Final|最终效果)$/u });
  const mermaidSource = [
    'flowchart TD',
    ...Array.from({ length: 10 }, (_, index) => `  N${index}[Render ${index}] --> N${index + 1}[Render ${index + 1}]`),
  ].join('\n');
  const deliveries = [
    {
      testId: 'oss-delivery-download-html',
      extension: '.html',
      verify: (content) => {
        const html = extractPortableDocumentSrcdoc(content.toString('utf8'));
        assert.doesNotMatch(
          html,
          /<[^>]+(?:class="[^"]*\bmd-public-preview-loading\b[^"]*"|data-public-render-state="pending")[^>]*>/u,
        );
        assert.match(html, /<[^>]+data-public-render-state="ready"[^>]*>/u);
        assert.match(html, /<[^>]+data-mermaid-security="strict-isolated"[^>]*>/u);
      },
    },
    {
      testId: 'oss-delivery-download-png',
      extension: '.png',
      verify: (content) => assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]),
    },
    {
      testId: 'oss-delivery-download-pdf',
      extension: '.pdf',
      verify: (content) => assertA4ImagePdf(content, 'Immediate Mermaid PDF'),
    },
  ];
  for (const [index, delivery] of deliveries.entries()) {
    console.log(`[oss-e2e] immediate Mermaid ${delivery.extension}`);
    await sourceButton.click();
    await page.locator('.md-public-source-editor textarea').first().fill(`${mermaidSource}\n%% immediate-delivery-${index}`);
    await finalButton.click();
    const previewRoot = page.locator('[data-public-preview-root="true"]');
    await assertDownload(page, delivery.testId, delivery.extension, delivery.verify);
    const readyFrame = previewRoot.locator('iframe.md-public-mermaid-frame[data-public-render-state="ready"]');
    await readyFrame.waitFor({ state: 'attached' });
    assert.equal(await previewRoot.locator('[data-public-render-state="pending"], [data-public-render-state="error"]').count(), 0);
  }

  console.log('[oss-e2e] Mermaid user animation staticization');
  await sourceButton.click();
  await page.locator('.md-public-source-editor textarea').first().fill([
    'flowchart LR',
    '  A[Animated class] --> B[Static node]',
    '  classDef userAnimated fill:#f96,stroke:#333,stroke-width:2px,animation:dash .05s linear infinite',
    '  class A userAnimated',
  ].join('\n'));
  await finalButton.click();
  const evaluateLiveStaticizedFrame = async (callback) => {
    const deadline = Date.now() + 5_000;
    let lastNavigationError;
    while (Date.now() < deadline) {
      const liveFrame = await waitForFrameWithSelector(page, 'svg .userAnimated');
      try {
        return await liveFrame.evaluate(callback);
      } catch (error) {
        if (!/Execution context was destroyed|most likely because of a navigation/iu.test(String(error))) throw error;
        lastNavigationError = error;
        await page.waitForTimeout(50);
      }
    }
    throw new Error('Timed out evaluating the live Mermaid frame after navigation.', { cause: lastNavigationError });
  };
  const staticizedEvidence = await evaluateLiveStaticizedFrame(() => ({
    animations: document.getAnimations().length,
    inlineAnimation: Array.from(document.querySelectorAll('[style]')).some((element) => (
      element.getAttribute('style')?.toLowerCase().includes('animation')
    )),
    targetCount: document.querySelectorAll('svg .userAnimated').length,
  }));
  assert.ok(staticizedEvidence.targetCount > 0, 'Mermaid did not apply the user-authored animation class fixture.');
  assert.equal(staticizedEvidence.animations, 0, 'Sanitized Mermaid Final retained a live animation.');
  assert.equal(staticizedEvidence.inlineAnimation, false, 'Sanitized Mermaid Final retained an inline animation declaration.');
  const unsanitizedControlAnimations = await page.evaluate(async () => {
    const control = document.createElement('div');
    control.setAttribute('data-oss-mermaid-animation-control', 'true');
    control.style.cssText = 'position:fixed;left:-10000px;top:0;width:100px;height:100px;overflow:hidden';
    control.innerHTML = [
      '<style>@keyframes dash{to{stroke-dashoffset:0}}.userAnimated{stroke-dasharray:9,5;stroke-dashoffset:900;animation:dash .05s linear infinite}</style>',
      '<svg viewBox="0 0 100 100"><path class="userAnimated" d="M0 50 L100 50"></path></svg>',
    ].join('');
    document.body.appendChild(control);
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return control.querySelector('svg .userAnimated')?.getAnimations().length ?? 0;
    } finally {
      control.remove();
    }
  });
  assert.ok(unsanitizedControlAnimations > 0, 'Chromium did not activate the user-class animation control.');
  const postControlEvidence = await evaluateLiveStaticizedFrame(() => document.getAnimations().length);
  assert.equal(postControlEvidence, 0, 'The live Mermaid Final gained an animation after the isolated control proof.');
  await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  await assertDownload(page, 'oss-delivery-download-pdf', '.pdf', (content) => (
    assertA4ImagePdf(content, 'Staticized Mermaid animation PDF')
  ));
};

const runDeliveryFlow = async (page, createNetworkTrackedContext, appUrl, deliveryResourceBaseline) => {
  const sourceButton = sourceModeButton(page);
  if (await sourceButton.count()) await sourceButton.click();
  await page.locator('.md-public-source-editor textarea').first().fill([
    '```html',
    '<!doctype html><html><body><style>h1{color:#123456}</style><h1>Static OSS image delivery</h1><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg></body></html>',
    '```',
  ].join('\n'));
  const previewButton = page.getByRole('button', { name: /^(Final|最终效果)$/u });
  if (await previewButton.count()) await previewButton.click();
  await page.locator('[data-public-preview-root="true"]').waitFor({ state: 'visible' });

  await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  await assertDownload(
    page,
    'oss-delivery-download-pdf',
    '.pdf',
    (content) => assertA4ImagePdf(content, 'OSS delivery PDF'),
  );

  await sourceButton.click();
  await page.evaluate(() => { window.__ossRawPolluted = false; });
  await page.locator('.md-public-source-editor textarea').first().fill([
    '```html',
    '<!doctype html><html><body><h1>Dynamic portable OSS delivery</h1><canvas></canvas><svg onload="try{top.__ossRawPolluted=true}catch(e){}"></svg><script>document.body.dataset.ready="true"</script></body></html>',
    '```',
  ].join('\n'));
  await previewButton.click();
  await page.locator('[data-public-preview-root="true"] iframe.md-public-html-frame').waitFor({ state: 'attached' });
  await assertDownload(page, 'oss-delivery-download-html', '.html', (content) => {
    const html = content.toString('utf8');
    assert.match(html, /<!doctype html>/iu);
    assert.match(html, /sandbox=["']allow-scripts["']/u);
    assert.doesNotMatch(html, /sandbox=["'][^"']*allow-same-origin/iu);
  });
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-png');
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-pdf');
  assert.equal(await page.evaluate(() => window.__ossRawPolluted), false, 'Raw HTML capture escaped its opaque iframe.');

  await sourceButton.click();
  await page.locator('.md-public-source-editor textarea').first().fill([
    '```html',
    '<!doctype html><html><body><img id="relative-portable-image" src="/oss-e2e-marker.svg"><a href="./relative-target">relative</a><template id="relative-portable-template"><img id="template-relative-portable-image" src="/oss-e2e-marker.svg"></template><script>document.body.append(document.getElementById("relative-portable-template").content.cloneNode(true))</script></body></html>',
    '```',
  ].join('\n'));
  await previewButton.click();
  const relativePortable = await assertDownload(page, 'oss-delivery-download-html', '.html', (content) => {
    const html = content.toString('utf8');
    assert.match(html, new RegExp(`${appUrl.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/oss-e2e-marker\\.svg`, 'u'));
    assert.match(html, new RegExp(`${appUrl.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/relative-target`, 'u'));
  });
  const relativePortablePath = path.join(outputDir, 'portable-relative.html');
  const relativePortableContext = await createNetworkTrackedContext();
  try {
    await relativePortable.download.saveAs(relativePortablePath);
    const relativePortablePage = await relativePortableContext.newPage();
    await relativePortablePage.goto(pathToFileURL(relativePortablePath).href, { waitUntil: 'load' });
    const relativeFrame = relativePortablePage.frames().find(candidate => candidate !== relativePortablePage.mainFrame());
    assert.ok(relativeFrame, 'Relative portable HTML did not preserve its sandboxed child frame.');
    await relativeFrame.locator('#relative-portable-image').waitFor({ state: 'attached' });
    await relativeFrame.locator('#template-relative-portable-image').waitFor({ state: 'attached' });
    assert.ok(
      await relativeFrame.locator('#relative-portable-image').evaluate(element => element.naturalWidth),
      'Relative author image stopped resolving after the portable file moved to file://.',
    );
    assert.ok(
      await relativeFrame.locator('#template-relative-portable-image').evaluate(element => element.naturalWidth),
      'Relative image cloned from template content stopped resolving after the portable file moved to file://.',
    );
  } finally {
    await relativePortableContext.close();
    await rm(relativePortablePath, { force: true });
  }

  await setWorkspaceTheme(page, 'dark');
  await sourceButton.click();
  await page.locator('.md-public-source-editor textarea').first().fill([
    '# Dark mixed capture',
    '',
    'Outer paper must keep the Final theme variables.',
    '',
    '```html',
    '<!doctype html><html><body style="margin:0;min-height:180px;background:#315477;color:#fff">static child</body></html>',
    '```',
  ].join('\n'));
  await previewButton.click();
  await page.locator('[data-public-preview-root="true"] iframe.md-public-html-frame').waitFor({ state: 'attached' });
  const darkMixedPng = await assertDownload(page, 'oss-delivery-download-png', '.png', (content) => {
    assert.deepEqual([...content.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
  const darkMixedPixels = await inspectPngPixels(page, darkMixedPng.content, [{ xRatio: 0.08, yRatio: 0.04 }]);
  assertRgbaNear(darkMixedPixels.pixels[0], [22, 22, 24, 255], 'dark mixed Final paper', 12);

  await page.evaluate(async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/oss-e2e-root.css';
    link.dataset.ossE2ePortableNestedCss = 'true';
    const loaded = new Promise((resolve, reject) => {
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', () => reject(new Error('nested portable CSS fixture failed to load')), { once: true });
    });
    document.head.append(link);
    await loaded;
  });

  await sourceButton.click();
  await page.locator('.md-public-source-editor textarea').first().fill([
    '# Portable mixed document',
    '',
    '```html',
    '<!doctype html><html><body><script>document.body.dataset.childReady="true";try{top.document.body.dataset.ossPolluted="true"}catch(e){}</script></body></html>',
    '```',
  ].join('\n'));
  await previewButton.click();
  await page.locator('[data-public-preview-root="true"] iframe.md-public-html-frame').waitFor({ state: 'attached' });
  const portablePath = path.join(outputDir, 'portable-mixed.html');
  await assertDownload(page, 'oss-delivery-download-html', '.html', async (content) => {
    // Persist the real browser download before inspecting it so a failed
    // portability assertion leaves the exact artifact in the ignored evidence
    // directory instead of only printing a multi-megabyte assertion value.
    await writeFile(portablePath, content);
    const html = content.toString('utf8');
    assert.match(html, /sandbox=["']allow-scripts["']/u);
    assert.match(html, /data:font\/woff2;base64,/u);
    assert.match(html, /data:text\/css;charset=utf-8;base64,/u);
    const embeddedCssPayloads = Array.from(
      html.matchAll(/data:text\/css;charset=utf-8;base64,([a-z0-9+/=]+)/giu),
      match => Buffer.from(match[1], 'base64').toString('utf8'),
    );
    assert.ok(
      embeddedCssPayloads.some(cssText => /data:image\/svg\+xml;base64,/u.test(cssText)),
      'Portable nested CSS did not embed its same-origin SVG dependency.',
    );
    assert.match(html, /--md-public-paper:#161618/u);
    assert.equal(html.includes(appUrl), false, 'Portable HTML retained a dependency on the OSS preview server.');
  });
  const portableContext = await createNetworkTrackedContext();
  const blockedPreviewRequests = [];
  await portableContext.route(`${appUrl}/**`, async (route) => {
    blockedPreviewRequests.push(route.request().url());
    await route.abort();
  });
  try {
    const portablePage = await portableContext.newPage();
    await portablePage.goto(pathToFileURL(portablePath).href, { waitUntil: 'load' });
    const portableDocumentFrame = await waitForFrameWithSelector(portablePage, '.md-public-final-surface');
    const childFrame = await waitForFrameWithSelector(portablePage, 'body[data-child-ready="true"]');
    await childFrame.locator('body[data-child-ready="true"]').waitFor({ state: 'attached' });
    assert.notEqual(await portablePage.locator('body').getAttribute('data-oss-polluted'), 'true', 'Portable child script polluted the top-level document.');
    assert.equal(
      await portablePage.locator('iframe.morndraft-public-document-frame').getAttribute('sandbox'),
      'allow-scripts',
      'Portable rendered document must remain in an opaque iframe without same-origin access.',
    );
    const portableSurface = portableDocumentFrame.locator('.md-public-final-surface');
    await portableSurface.waitFor({ state: 'visible' });
    const portableTheme = await portableSurface.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, borderColor: style.borderColor, color: style.color };
    });
    assert.equal(portableTheme.backgroundColor, 'rgb(22, 22, 24)', 'Portable dark paper lost the Final theme variable.');
    assert.equal(portableTheme.color, 'rgb(209, 209, 214)', 'Portable dark text lost the Final theme variable.');
    const nestedCssState = await portableSurface.evaluate((element) => ({
      marker: window.getComputedStyle(element, '::after').backgroundImage,
      state: window.getComputedStyle(element).getPropertyValue('--oss-e2e-nested-import').trim(),
    }));
    assert.equal(nestedCssState.state, 'ready', 'Portable nested @import did not execute from its data stylesheet.');
    assert.match(nestedCssState.marker, /^url\("data:image\/svg\+xml;base64,/u);
    const loadedBundledFonts = await portableDocumentFrame.evaluate(async () => (
      await document.fonts.load('16px "MornDraft Sans SC"', '中文')
    ).length);
    assert.ok(loadedBundledFonts > 0, 'Portable HTML could not decode its embedded MornDraft font with preview networking blocked.');
    assert.deepEqual(blockedPreviewRequests, [], 'Portable HTML requested a bundled asset from the stopped/blocked preview origin.');
  } finally {
    await portableContext.close();
  }
  await page.evaluate(() => {
    document.querySelector('link[data-oss-e2e-portable-nested-css="true"]')?.remove();
  });
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-png');
  await assertDeliveryFailureWithoutDownload(page, 'oss-delivery-download-pdf');

  await sourceButton.click();
  await page.locator('.md-public-source-editor textarea').first().fill('# Portable mXSS isolation');
  await previewButton.click();
  await page.locator('[data-public-preview-root="true"]').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    window.__ossMxssPolluted = 0;
    document.querySelector('[data-public-preview-root="true"]')?.insertAdjacentHTML(
      'beforeend',
      '<form><math><mtext></form><form><mglyph><style></math><img src=x onerror="top.__ossMxssPolluted=45">',
    );
  });
  assert.equal(await page.evaluate(() => window.__ossMxssPolluted), 0, 'mXSS fixture polluted the live OSS shell.');
  const mxssPortablePath = path.join(outputDir, 'portable-mxss.html');
  const mxssPortable = await assertDownload(page, 'oss-delivery-download-html', '.html', (content) => {
    const html = content.toString('utf8');
    assert.match(html, /<body>\s*<iframe\b/iu);
    assert.match(html, /class="morndraft-public-document-frame"/u);
    assert.match(html, /sandbox="allow-scripts"/u);
    assert.doesNotMatch(html, /sandbox="[^"]*allow-same-origin/iu);
  });
  await mxssPortable.download.saveAs(mxssPortablePath);
  const mxssContext = await createNetworkTrackedContext();
  try {
    const mxssPage = await mxssContext.newPage();
    await mxssPage.goto(pathToFileURL(mxssPortablePath).href, { waitUntil: 'load' });
    await mxssPage.waitForTimeout(250);
    assert.equal(
      await mxssPage.evaluate(() => window.__ossMxssPolluted ?? 0),
      0,
      'Mutation-XSS escaped the portable opaque iframe into the top-level document.',
    );
    assert.equal(await mxssPage.locator('body > img, body > form, body > math').count(), 0);
  } finally {
    await mxssContext.close();
    await rm(mxssPortablePath, { force: true });
  }

  await setWorkspaceTheme(page, 'light');
  await sourceButton.click();
  await page.locator('.md-public-source-editor textarea').first().fill('# Repeated local delivery\n\nStable capture surface.');
  await previewButton.click();
  await page.locator('[data-public-preview-root="true"]').waitFor({ state: 'visible' });
  await page.locator('.aad-editor-floating-toast[role="status"]').waitFor({ state: 'hidden' });
  const baselineDomCount = await page.locator('body *').count();
  for (let index = 0; index < 10; index += 1) {
    console.log(`[oss-e2e] repeated PNG delivery ${index + 1}/10`);
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await clickByTestId(page, 'oss-delivery-download-png');
    const download = await downloadPromise.catch(async (cause) => {
      const alert = page.locator('.aad-editor-floating-toast[role="alert"]').filter({ visible: true });
      throw new Error(`Repeated PNG delivery failed: ${await alert.count() ? await alert.innerText() : 'no download and no visible error'}`, { cause });
    });
    await download.path();
  }
  await page.locator('.aad-editor-floating-toast[role="status"]').waitFor({ state: 'hidden' });
  // Public download URLs stay alive for 1s so WebKit can consume the synthetic
  // click before revocation; wait past that bounded grace period before the
  // leak assertion.
  await page.waitForTimeout(1_250);
  assert.equal(await page.locator('body *').count(), baselineDomCount, 'Repeated delivery leaked DOM nodes.');
  await assertNoActiveDeliveryResources(page, deliveryResourceBaseline, 'ten repeated deliveries');
};

const runSharedDesktopOssAcceptance = async ({
  appUrl,
  consoleErrors,
  networkUrls,
  page,
}) => {
  const workspace = page.locator('[data-shared-desktop-shell="true"]');
  await workspace.waitFor({ state: 'visible' });
  await page.locator('.md-oss-shared-toolbar').waitFor({ state: 'visible' });
  await page.locator('.aad-markdown-lexical-island-content').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.md-public-workspace').count(), 0);
  assert.equal(await page.getByText(/登录|订阅|Draft Box|云草稿/u).count(), 0);

  const publicWorkspace = page.locator('[data-public-workspace="true"]');
  const sourceButton = sourceModeButton(page);
  const finalButton = page.getByRole('button', { name: /^(Final|最终效果)$/u });
  const ensureSourceMode = async () => {
    if (await publicWorkspace.getAttribute('data-commercial-workspace-mode') !== 'source') {
      await sourceButton.click();
    }
    await page.locator('.md-oss-workspace:not(.md-oss-final-workspace) .aad-editor-input').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
  };
  const ensureFinalMode = async () => {
    if (await publicWorkspace.getAttribute('data-commercial-workspace-mode') !== 'final') {
      await finalButton.click();
    }
    await page.locator('[data-public-final="true"]').waitFor({ state: 'visible', timeout: 15_000 });
  };
  await ensureSourceMode();
  const source = page.locator('.md-oss-workspace:not(.md-oss-final-workspace) .aad-editor-input').first();
  const maliciousHtmlSource = [
    '# Security fixture',
    '',
    '```html',
    '<main><a href="javascript:window.__ossUnsafe=1">Unsafe</a><p>Sandboxed HTML</p></main>',
    '<script>window.__ossUnsafe=2</script>',
    '```',
    '',
    '```mermaid',
    'graph TD',
    'A[Safe] --> B[Strict]',
    '```',
  ].join('\n');
  await source.fill(maliciousHtmlSource);
  await ensureFinalMode();
  const htmlFrame = page.locator('iframe[data-html-preview-live="true"]').first();
  await htmlFrame.waitFor({ state: 'attached' });
  const sandbox = await htmlFrame.getAttribute('sandbox') ?? '';
  assert.doesNotMatch(sandbox, /allow-same-origin/u);
  assert.match(await htmlFrame.getAttribute('srcdoc') ?? '', /Content-Security-Policy/u);
  const htmlRuntime = await page.frameLocator('iframe[data-html-preview-live="true"]')
    .locator('body')
    .evaluate(() => ({
      unsafe: window.__ossUnsafe,
      unsafeHref: document.querySelector('a')?.getAttribute('href') ?? '',
  }));
  assert.equal(htmlRuntime.unsafe, undefined);
  assert.equal(htmlRuntime.unsafeHref, '');

  const mermaidSvg = page.locator('.aad-mermaid-block svg').first();
  await mermaidSvg.waitFor({ state: 'visible', timeout: 15_000 });
  const mermaidRisk = await mermaidSvg.evaluate((svg) => ({
    eventAttributes: [...svg.querySelectorAll('*')].flatMap((element) => (
      [...element.attributes].filter(attribute => /^on/iu.test(attribute.name)).map(attribute => attribute.name)
    )),
    foreignObjects: svg.querySelectorAll('foreignObject').length,
    javascriptUrls: [...svg.querySelectorAll('[href], [xlink\\:href]')].filter((element) => (
      /^javascript:/iu.test(element.getAttribute('href') ?? element.getAttribute('xlink:href') ?? '')
    )).length,
    scripts: svg.querySelectorAll('script').length,
  }));
  assert.deepEqual(mermaidRisk, {
    eventAttributes: [],
    foreignObjects: 0,
    javascriptUrls: 0,
    scripts: 0,
  });

  await ensureSourceMode();
  await source.fill('# Delivery fixture\n\nPortable local export.');
  await ensureFinalMode();
  await page.locator('[data-public-preview-root="true"]').getByText('Portable local export.').waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  assert.equal(await page.locator('[data-public-preview-root="true"] iframe').count(), 0);
  assert.equal(await page.locator('[data-public-preview-root="true"] .aad-mermaid-block').count(), 0);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-public-preview-root="true"]');
    return Boolean(root)
      && root.textContent?.includes('Portable local export.')
      && !root.querySelector('iframe[data-html-preview-live="true"], .aad-mermaid-block');
  }, undefined, { timeout: 15_000 });
  assert.equal(
    await page.locator('[data-public-final="true"]').getAttribute('data-document-kind'),
    'markdown',
    'Shared delivery fixture did not settle back to a markdown document before export.',
  );
  const downloadArtifact = async (testId, fileName) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 90_000 });
    await clickByTestId(page, testId);
    const outcome = await Promise.race([
      downloadPromise.then(download => ({ download })),
      page.getByRole('alert').waitFor({ state: 'visible', timeout: 90_000 }).then(async () => ({
        error: await page.getByRole('alert').innerText(),
      })),
    ]);
    if ('error' in outcome) {
      throw new Error(`${testId} failed: ${outcome.error}`);
    }
    const { download } = outcome;
    const artifactPath = path.join(outputDir, fileName);
    await download.saveAs(artifactPath);
    return { artifactPath, suggestedFilename: download.suggestedFilename() };
  };
  const html = await downloadArtifact('oss-delivery-download-html', 'shared-desktop.html');
  const htmlBytes = await readFile(html.artifactPath);
  assert.match(html.suggestedFilename, /\.html$/u);
  assert.match(htmlBytes.toString('utf8'), /Portable local export/u);
  assert.doesNotMatch(htmlBytes.toString('utf8'), /\/api\/|javascript:/u);

  const png = await downloadArtifact('oss-delivery-download-png', 'shared-desktop.png');
  const pngBytes = await readFile(png.artifactPath);
  assert.equal(pngBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');

  const pdf = await downloadArtifact('oss-delivery-download-pdf', 'shared-desktop.pdf');
  const pdfBytes = await readFile(pdf.artifactPath);
  assert.equal(pdfBytes.subarray(0, 4).toString('ascii'), '%PDF');
  assert.ok((await PDFDocument.load(pdfBytes)).getPageCount() >= 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await workspace.waitFor({ state: 'visible' });
  await page.screenshot({
    fullPage: true,
    path: path.join(outputDir, 'oss-shared-mobile-390x844.png'),
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${appUrl}/deep/link`, { waitUntil: 'networkidle' });
  await page.locator('[data-shared-desktop-shell="true"]').waitFor({ state: 'visible' });

  assert.deepEqual(
    findUnexpectedMornDraftApiRequests(networkUrls, appUrl),
    [],
    'The shared OSS desktop made a first-party /api request.',
  );
  assert.deepEqual(consoleErrors, [], `Shared OSS browser console errors: ${consoleErrors.join('\n')}`);
};

const main = async () => {
  const candidatePackage = JSON.parse(await readFile(path.join(candidateDir, 'package.json'), 'utf8'));
  assert.equal(candidatePackage.morndraftDistribution, 'oss', 'test:e2e:oss must target an exported OSS candidate.');
  const showcaseModule = await import(pathToFileURL(path.join(candidateDir, 'packages/core/src/public-morndraft-showcase.js')).href);
  const canonicalFlatSource = showcaseModule.getPublicMornDraftInsertEntries('showcase')[0]?.source;
  assert.ok(canonicalFlatSource, 'Exported OSS candidate has no canonical MornDraft flat fixture.');

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await run(npmExecutable, ['run', 'build:oss']);
  const ossDistDir = path.join(candidateDir, 'dist', 'oss');
  await writeFile(
    path.join(ossDistDir, 'oss-e2e-root.css'),
    '@import "./oss-e2e-nested.css";\n',
  );
  await writeFile(
    path.join(ossDistDir, 'oss-e2e-nested.css'),
    [
      '.md-public-final-surface{--oss-e2e-nested-import:ready}',
      '.md-public-final-surface::after{content:"";background-image:url("./oss-e2e-marker.svg")}',
    ].join('\n'),
  );
  await writeFile(
    path.join(ossDistDir, 'oss-e2e-marker.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#0a7"/></svg>',
  );

  const aiMock = createAiMock();
  const deliveryFixture = createDeliveryFixtureServer();
  let browser;
  let preview;
  let activeTraceContext;
  const startTracing = async (context) => {
    // Playwright DOM snapshots inject a recorder into every frame. Chromium
    // reports that recorder as a blocked script in MornDraft's intentionally
    // scriptless sandbox frames, which would make the console gate test the
    // tracing implementation instead of the exported app. Screenshots,
    // sources, actions, console and network events remain in the failure trace.
    await context.tracing.start({ screenshots: true, snapshots: false, sources: true });
    activeTraceContext = context;
  };
  const closeTracedContext = async (context) => {
    try {
      await context.tracing.stop();
    } finally {
      if (activeTraceContext === context) activeTraceContext = undefined;
      await context.close();
    }
  };
  try {
    const aiPort = await listen(aiMock.server);
    const deliveryFixturePort = await listen(deliveryFixture.server);
    const appProbe = createServer();
    let appPort;
    try {
      appPort = await listen(appProbe);
    } finally {
      await closeServer(appProbe);
    }
    preview = spawn(npmExecutable, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(appPort)], {
      cwd: candidateDir,
      detached: process.platform !== 'win32',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    preview.stdout?.on('data', (chunk) => process.stdout.write(chunk));
    preview.stderr?.on('data', (chunk) => process.stderr.write(chunk));
    const previewFailure = new Promise((_, reject) => {
      preview.once('error', reject);
      preview.once('exit', (code, signal) => {
        if (code !== 0) reject(new Error(`OSS preview exited before acceptance with ${code ?? signal}.`));
      });
    });
    const appUrl = `http://127.0.0.1:${appPort}`;
    await Promise.race([waitForUrl(appUrl), previewFailure]);
    browser = await chromium.launch({ headless: true });
    const networkUrls = [];
    const createNetworkTrackedContext = async (options = {}) => {
      const trackedContext = await browser.newContext({ locale: 'zh-CN', ...options });
      trackedContext.on('request', (request) => networkUrls.push(request.url()));
      return trackedContext;
    };
    const context = await createNetworkTrackedContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 900 },
    });
    await startTracing(context);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: appUrl });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(appUrl, { waitUntil: 'networkidle' });
    await page.locator('[data-public-workspace="true"]').waitFor({ state: 'visible' });
    if (await page.locator('[data-shared-desktop-shell="true"]').count()) {
      await page.screenshot({
        fullPage: true,
        path: path.join(outputDir, 'oss-shared-desktop-1440x900.png'),
      });
      await runSharedDesktopOssAcceptance({
        appUrl,
        consoleErrors,
        networkUrls,
        page,
      });
      await closeTracedContext(context);
      console.log('[oss-e2e] Shared OSS desktop passed sandbox, Mermaid, local HTML/PNG/PDF delivery, network-boundary, deep-link, and mobile checks.');
      return;
    }
    await assertOss710VisualBaseline(page);
    await page.screenshot({
      fullPage: true,
      path: path.join(outputDir, 'oss-710-desktop-1440x900.png'),
    });
    await installDeliveryResourceAudit(page);
    const deliveryResourceBaseline = Object.freeze(await readDeliveryResourceAudit(page));
    assertZeroDeliveryResourceBaseline(deliveryResourceBaseline, 'Initial OSS delivery audit');

    await runAboutDialogFlow(page);
    await runPublicShowcaseSurfaceFlow(page);
    await runImportFlow(page, canonicalFlatSource);
    await runAiFlow(page, `http://127.0.0.1:${aiPort}`, aiMock.requests);
    const sameContextPage = await context.newPage();
    const sameContextErrors = [];
    sameContextPage.on('console', (message) => {
      if (message.type() === 'error') sameContextErrors.push(message.text());
    });
    await sameContextPage.goto(appUrl, { waitUntil: 'networkidle' });
    const sameContextStorage = await sameContextPage.evaluate(() => ({
      local: localStorage.getItem('morndraft.oss.aiConfig.v1'),
      session: sessionStorage.getItem('morndraft.oss.aiConfig.session.v1'),
    }));
    assert.equal(sameContextStorage.session, null, 'A new tab inherited the first tab\'s session-only API Key.');
    assert.match(sameContextStorage.local ?? '', /oss-generate-model/u, 'Non-secret AI settings were not shared through localStorage.');
    assert.doesNotMatch(sameContextStorage.local ?? '', /oss-e2e-key/u, 'A new tab recovered the session-only API Key from localStorage.');
    assert.deepEqual(sameContextErrors, [], `Same-context storage tab console errors: ${sameContextErrors.join('\n')}`);
    await sameContextPage.close();
    await runFinalEditingFlow(page);
    await assertNoActiveDeliveryResources(page, deliveryResourceBaseline, 'Final editing delivery');
    await runMermaidImmediateDeliveryFlow(page);
    await assertNoActiveDeliveryResources(page, deliveryResourceBaseline, 'immediate Mermaid deliveries');
    await runDeliveryFlow(page, createNetworkTrackedContext, appUrl, deliveryResourceBaseline);
    await runDeliveryHardeningFlow(
      page,
      `http://127.0.0.1:${deliveryFixturePort}`,
      deliveryFixture.requests,
      deliveryFixture.slowCssDelayMs,
      consoleErrors,
      deliveryResourceBaseline,
    );
    await clickByTestId(page, 'oss-delivery-copy-image');
    await page.locator('.aad-editor-floating-toast[role="status"]').filter({ visible: true }).waitFor({ state: 'visible' });
    await waitForDeliveryIdle(page);
    const copyAlert = page.locator('.aad-editor-floating-toast[role="alert"]');
    assert.equal(await copyAlert.count() > 0 && await copyAlert.first().isVisible(), false, 'Clipboard-enabled context did not complete a real image copy.');
    const clipboardSnapshot = await page.evaluate(async () => {
      if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
        return { supported: false, types: [] };
      }
      const items = await navigator.clipboard.read();
      return {
        supported: true,
        types: [...new Set(items.flatMap(item => item.types))],
      };
    });
    if (clipboardSnapshot.supported) {
      assert.ok(
        clipboardSnapshot.types.includes('image/png'),
        `Clipboard copy did not expose image/png: ${clipboardSnapshot.types.join(', ')}`,
      );
    }
    await assertNoActiveDeliveryResources(page, deliveryResourceBaseline, 'clipboard image delivery');

    const requestedModels = aiMock.requests.map((entry) => entry.body.model);
    assert.deepEqual(requestedModels, [
      'oss-generate-model',
      'oss-modify-model',
      'oss-summarize-model',
      'oss-generate-model',
      'oss-generate-model',
      'oss-generate-model',
    ]);
    for (const request of aiMock.requests) {
      assert.equal(request.authorization, 'Bearer oss-e2e-key');
      assert.equal(request.body.stream, false);
    }
    const modifyBody = JSON.stringify(aiMock.requests[1].body);
    assert.doesNotMatch(modifyBody, /data:image|A{64}/u, 'Modify must omit embedded local image data from the AI request.');
    assert.doesNotMatch(modifyBody, /image\/png|;?base64/iu, 'Modify leaked an embedded image MIME or encoding marker.');
    assert.doesNotMatch(modifyBody, /iVBORw0KGgo/u, 'Modify leaked the percent-encoded PNG header to the AI provider.');
    assert.doesNotMatch(modifyBody, /QkFTRTY0TEVBS1RBSUw=/u, 'Modify leaked the folded data URL payload tail to the AI provider.');
    assert.doesNotMatch(modifyBody, /CAQAAAC1HAwCAAAAC0lEQVR42mNk\+A8AAQUBAScY42YAAAAASUVORK5CYII=/u, 'Modify leaked the percent-encoded data URL payload tail to the AI provider.');
    assert.doesNotMatch(modifyBody, /CAQAAAC1HAwC|EQVR42mNk\+A8A|AScY42YAAAAA/u, 'Modify leaked a partial percent-encoded PNG payload tail.');
    assert.doesNotMatch(modifyBody, /data:application|octet-stream|QVJCSVRSQVJZX0xPQ0FMX0FTU0VU/u, 'Modify leaked an arbitrary local data URL to the AI provider.');
    assert.ok(modifyBody.length < 70_000, `Modify request exceeded the bounded browser context: ${modifyBody.length} bytes.`);
    const summarizeBody = JSON.stringify(aiMock.requests[2].body);
    assert.doesNotMatch(summarizeBody, /Modified selection from OSS AI/u, 'Summarize must not send the complete Source.');
    assert.deepEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join('\n')}`);
    await closeTracedContext(context);

    const isolatedStorageContext = await createNetworkTrackedContext();
    await startTracing(isolatedStorageContext);
    const isolatedStoragePage = await isolatedStorageContext.newPage();
    const isolatedStorageErrors = [];
    isolatedStoragePage.on('console', (message) => {
      if (message.type() === 'error') isolatedStorageErrors.push(message.text());
    });
    await isolatedStoragePage.goto(appUrl, { waitUntil: 'networkidle' });
    const isolatedStorage = await isolatedStoragePage.evaluate(() => ({
      local: localStorage.getItem('morndraft.oss.aiConfig.v1'),
      session: sessionStorage.getItem('morndraft.oss.aiConfig.session.v1'),
    }));
    assert.deepEqual(
      isolatedStorage,
      { local: null, session: null },
      'A new BrowserContext inherited AI settings or the session-only API Key.',
    );
    assert.deepEqual(isolatedStorageErrors, [], `Isolated BrowserContext console errors: ${isolatedStorageErrors.join('\n')}`);
    await closeTracedContext(isolatedStorageContext);

    const noClipboard = await createNetworkTrackedContext();
    await startTracing(noClipboard);
    await noClipboard.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get: () => undefined });
    });
    const noClipboardPage = await noClipboard.newPage();
    await noClipboardPage.goto(appUrl, { waitUntil: 'networkidle' });
    await setWorkspaceLocale(noClipboardPage, 'en');
    await clickByTestId(noClipboardPage, 'oss-delivery-copy-image');
    const clipboardFallback = noClipboardPage.locator('.aad-editor-floating-toast[role="alert"]');
    await clipboardFallback.waitFor({ state: 'visible' });
    const clipboardFallbackText = await clipboardFallback.innerText();
    assert.match(clipboardFallbackText, /Download PNG/u);
    assert.doesNotMatch(clipboardFallbackText, /下载 PNG/u);
    await closeTracedContext(noClipboard);

    const rejectedClipboard = await createNetworkTrackedContext();
    await startTracing(rejectedClipboard);
    await rejectedClipboard.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'clipboard', {
        configurable: true,
        get: () => ({
          write: () => Promise.reject(new window.DOMException('Denied by OSS E2E', 'NotAllowedError')),
        }),
      });
    });
    const rejectedClipboardPage = await rejectedClipboard.newPage();
    await rejectedClipboardPage.goto(appUrl, { waitUntil: 'networkidle' });
    await installDeliveryResourceAudit(rejectedClipboardPage);
    const rejectedClipboardBaseline = Object.freeze(await readDeliveryResourceAudit(rejectedClipboardPage));
    assertZeroDeliveryResourceBaseline(rejectedClipboardBaseline, 'Rejected clipboard delivery audit');
    await clickByTestId(rejectedClipboardPage, 'oss-delivery-copy-image');
    const rejectedClipboardFallback = rejectedClipboardPage.locator('.aad-editor-floating-toast[role="alert"]');
    await rejectedClipboardFallback.waitFor({ state: 'visible' });
    assert.match(await rejectedClipboardFallback.innerText(), /下载 PNG/u);
    await rejectedClipboardPage.waitForFunction(() => {
      const button = document.querySelector('[data-testid="oss-delivery-copy-image"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    await assertNoActiveDeliveryResources(
      rejectedClipboardPage,
      rejectedClipboardBaseline,
      'clipboard write rejection',
    );
    await closeTracedContext(rejectedClipboard);

    const mobile = await createNetworkTrackedContext({ viewport: { width: 390, height: 844 } });
    await startTracing(mobile);
    const mobilePage = await mobile.newPage();
    const mobileErrors = [];
    mobilePage.on('console', (message) => {
      if (message.type() === 'error') mobileErrors.push(message.text());
    });
    await mobilePage.goto(appUrl, { waitUntil: 'networkidle' });
    await mobilePage.locator('[data-public-workspace="true"]').waitFor({ state: 'visible' });
    await assertOss710VisualBaseline(mobilePage, { mobile: true });
    await mobilePage.screenshot({
      fullPage: true,
      path: path.join(outputDir, 'oss-710-mobile-390x844.png'),
    });
    assert.deepEqual(mobileErrors, [], `Mobile browser console errors: ${mobileErrors.join('\n')}`);
    await closeTracedContext(mobile);

    // Prove portability against a genuinely stopped app server, not only by
    // inspecting generated markup while Vite is still available.
    await stopChild(preview);
    preview = undefined;
    const offlinePortableContext = await createNetworkTrackedContext();
    const offlinePortableRequests = [];
    offlinePortableContext.on('request', request => offlinePortableRequests.push(request.url()));
    try {
      const offlinePortablePage = await offlinePortableContext.newPage();
      const portablePath = path.join(outputDir, 'portable-mixed.html');
      await offlinePortablePage.goto(pathToFileURL(portablePath).href, { waitUntil: 'load' });
      const offlineDocumentFrame = await waitForFrameWithSelector(offlinePortablePage, '.md-public-final-surface');
      const offlineSurface = offlineDocumentFrame.locator('.md-public-final-surface');
      await offlineSurface.waitFor({ state: 'visible' });
      const offlineFonts = await offlineDocumentFrame.evaluate(async () => (
        await document.fonts.load('16px "MornDraft Sans SC"', '中文')
      ).length);
      assert.ok(offlineFonts > 0, 'Standalone HTML lost its bundled font after the preview server stopped.');
      const offlineNestedCss = await offlineSurface.evaluate((element) => ({
        marker: window.getComputedStyle(element, '::after').backgroundImage,
        state: window.getComputedStyle(element).getPropertyValue('--oss-e2e-nested-import').trim(),
      }));
      assert.equal(offlineNestedCss.state, 'ready', 'Standalone nested @import stopped applying after server shutdown.');
      assert.match(offlineNestedCss.marker, /^url\("data:image\/svg\+xml;base64,/u);
      assert.equal(
        offlinePortableRequests.some(url => /^https?:/u.test(url)),
        false,
        `Standalone HTML requested a server after shutdown: ${offlinePortableRequests.join(', ')}`,
      );
      await rm(portablePath, { force: true });
    } finally {
      await offlinePortableContext.close();
    }
    const unexpectedMornDraftApiRequests = findUnexpectedMornDraftApiRequests(networkUrls, appUrl);
    assert.deepEqual(
      unexpectedMornDraftApiRequests,
      [],
      `OSS candidate made an unexpected MornDraft API request: ${unexpectedMornDraftApiRequests.join(', ')}`,
    );
  } catch (error) {
    await activeTraceContext?.tracing.stop({ path: path.join(outputDir, 'trace.zip') }).catch(() => undefined);
    if (browser) {
      const pages = browser.contexts().flatMap((context) => context.pages());
      if (pages[0]) await pages[0].screenshot({ path: path.join(outputDir, 'failure.png'), fullPage: true }).catch(() => undefined);
    }
    throw error;
  } finally {
    await browser?.close();
    await stopChild(preview);
    await closeServer(aiMock.server);
    await closeServer(deliveryFixture.server);
    await rm(path.join(candidateDir, 'dist'), { recursive: true, force: true });
  }

  console.log('[oss-e2e] Exported OSS candidate passed AI routing, local delivery, storage, network-boundary, and mobile smoke checks.');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
