/* global console, document, fetch, HTMLElement, MouseEvent, process, setTimeout, window */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const outputDir = path.join(projectDir, 'output', 'playwright', 'oss-editing-layout');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const allocatePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    server.close(error => error ? reject(error) : resolve(port));
  });
});

const waitForPreview = async (url, child) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`OSS preview exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview port is not accepting connections yet.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the OSS preview.');
};

const stopChild = async (child) => {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
};

await rm(outputDir, { force: true, recursive: true });
const port = await allocatePort();
const appUrl = `http://127.0.0.1:${port}`;
const preview = spawn(npmCommand, [
  'run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
], {
  cwd: projectDir,
  env: { ...process.env, MORNDRAFT_BUILD_PRESET: 'oss-full' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let previewLog = '';
for (const stream of [preview.stdout, preview.stderr]) {
  stream?.on('data', chunk => {
    previewLog = `${previewLog}${String(chunk)}`.slice(-12_000);
  });
}

let browser;
let context;
let page;
let tracing = false;
try {
  await waitForPreview(appUrl, preview);
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  tracing = true;
  page = await context.newPage();
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^(Source|源码)$/u }).click();

  const sourceEditor = page.locator('.md-public-source-editor textarea').first();
  await sourceEditor.waitFor({ state: 'visible' });
  const layout = await page.evaluate(() => {
    const rect = selector => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
      const value = element.getBoundingClientRect();
      return { bottom: value.bottom, height: value.height, top: value.top };
    };
    return {
      app: rect('.oss-app'),
      editor: rect('.md-public-source-editor'),
      main: rect('.md-public-main'),
      textarea: rect('.md-public-source-editor textarea'),
      viewportHeight: window.innerHeight,
      workspace: rect('[data-public-workspace="true"]'),
    };
  });
  assert.equal(layout.viewportHeight, 720);
  assert.ok(layout.app.height >= 719, `OSS app collapsed to ${layout.app.height}px.`);
  assert.ok(layout.workspace.height >= 719, `Public workspace collapsed to ${layout.workspace.height}px.`);
  assert.ok(layout.main.height >= 650, `Public main area collapsed to ${layout.main.height}px.`);
  assert.ok(layout.editor.height >= 650, `Source editor collapsed to ${layout.editor.height}px.`);
  assert.ok(layout.textarea.height >= 650, `Source textarea collapsed to ${layout.textarea.height}px.`);

  await sourceEditor.fill('/');
  const insertMenu = page.getByRole('menu', { name: /^(Insert content|插入内容)$/u });
  await insertMenu.waitFor({ state: 'visible' });
  const items = insertMenu.getByRole('menuitem');
  assert.equal(await items.count(), 32, 'The AI-enabled OSS slash menu must expose AI, 30 flat entries, and Markdown table.');
  await items.last().scrollIntoViewIfNeeded();
  const menuLayout = await page.evaluate(() => {
    const menu = document.querySelector('.md-public-insert-menu');
    const main = document.querySelector('.md-public-main');
    const lastItem = menu?.querySelector('[role="menuitem"]:last-of-type');
    if (!(menu instanceof HTMLElement) || !(main instanceof HTMLElement) || !(lastItem instanceof HTMLElement)) {
      throw new Error('Slash menu layout fixture is incomplete.');
    }
    const menuRect = menu.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const itemRect = lastItem.getBoundingClientRect();
    return {
      itemBottom: itemRect.bottom,
      itemTop: itemRect.top,
      mainBottom: mainRect.bottom,
      mainTop: mainRect.top,
      menuBottom: menuRect.bottom,
      menuClientHeight: menu.clientHeight,
      menuScrollHeight: menu.scrollHeight,
      menuTop: menuRect.top,
    };
  });
  assert.ok(menuLayout.menuTop >= menuLayout.mainTop - 1, 'Slash menu is clipped above the workspace main area.');
  assert.ok(menuLayout.menuBottom <= menuLayout.mainBottom + 1, 'Slash menu is clipped below the workspace main area.');
  assert.ok(menuLayout.itemTop >= menuLayout.menuTop - 1, 'Scrolled slash item is above the visible menu.');
  assert.ok(menuLayout.itemBottom <= menuLayout.menuBottom + 1, 'Scrolled slash item is below the visible menu.');
  assert.ok(menuLayout.menuScrollHeight > menuLayout.menuClientHeight, 'Slash menu fixture did not exercise scrolling.');

  const selectAcrossPreviewParagraphs = async () => page.evaluate(() => {
    const paragraphs = [...document.querySelectorAll('[data-public-preview-root="true"] p[data-public-final-block="true"]')];
    const first = paragraphs.at(0);
    const last = paragraphs.at(-1);
    const firstText = first?.firstChild;
    const lastText = last?.lastChild;
    if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement) || !firstText || !lastText) {
      throw new Error('Cross-block selection fixture did not render boundary paragraphs.');
    }
    const range = document.createRange();
    range.setStart(firstText, 0);
    range.setEnd(lastText, lastText.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    last.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return { blockCount: paragraphs.length, text: selection?.toString() ?? '' };
  });

  const finalButton = page.getByRole('button', { name: /^(Final|最终效果)$/u });
  const sourceButton = page.getByRole('button', { name: /^(Source|源码)$/u });
  const aiModify = page.getByTestId('oss-ai-modify');
  await sourceEditor.fill('First paragraph\n\nSecond paragraph');
  await finalButton.click();
  const reversibleSelection = await selectAcrossPreviewParagraphs();
  assert.equal(reversibleSelection.blockCount, 2);
  assert.match(reversibleSelection.text, /^First paragraph\s+Second paragraph$/u);
  await aiModify.waitFor({ state: 'visible' });

  const imageSource = [
    'First paragraph',
    '',
    '![pixel](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=)',
    '',
    'Second paragraph',
  ].join('\n');
  await sourceButton.click();
  await sourceEditor.fill(imageSource);
  await aiModify.waitFor({ state: 'hidden' });
  await finalButton.click();
  const blockedSelection = await selectAcrossPreviewParagraphs();
  assert.equal(blockedSelection.blockCount, 3);
  assert.match(blockedSelection.text, /First paragraph[\s\S]*Second paragraph/u);
  await page.waitForTimeout(100);
  assert.equal(await aiModify.count(), 0, 'A selection crossing an image must not expose an adoptable AI action.');
  await sourceButton.click();
  assert.equal(await sourceEditor.inputValue(), imageSource, 'Fail-closed cross-image selection must preserve Source exactly.');

  await context.tracing.stop();
  tracing = false;
  await rm(outputDir, { force: true, recursive: true });
  console.log(`[oss-editing-e2e] viewport layout, scrollable 32-item slash menu, and fail-closed cross-image selection passed: ${JSON.stringify(layout)}`);
} catch (error) {
  await mkdir(outputDir, { recursive: true });
  if (page) await page.screenshot({ fullPage: true, path: path.join(outputDir, 'failure.png') }).catch(() => undefined);
  if (context && tracing) {
    await context.tracing.stop({ path: path.join(outputDir, 'trace.zip') }).catch(() => undefined);
    tracing = false;
  }
  await writeFile(path.join(outputDir, 'preview.log'), previewLog);
  throw error;
} finally {
  if (context && tracing) await context.tracing.stop().catch(() => undefined);
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await stopChild(preview);
}
