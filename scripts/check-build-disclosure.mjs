/* global console, process */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBuildConfig } from './build-config.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const buildConfig = resolveBuildConfig({ projectDir, env: process.env });
const distDir = path.resolve(projectDir, buildConfig.outDir);

const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml']);
const forbiddenDistAssetNames = new Map([
  ['morndraft-visual-design-spec.png', 'internal visual design reference must not be published'],
  ['morndraft-source-icon.png', 'removed source-mode icon must not be published'],
  ['morndraft-final-icon.png', 'removed final-mode icon must not be published'],
]);

const disclosurePatterns = [
  {
    label: 'source map reference',
    pattern: /sourceMappingURL/i,
  },
  {
    label: 'inline source map payload',
    pattern: /application\/json[^,;]*;base64/i,
  },
  {
    label: 'OpenAI-style API key',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    label: 'Anthropic-style API key',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    label: 'Google-style API key',
    pattern: /\bAIza[0-9A-Za-z_-]{25,}\b/g,
  },
  {
    label: 'AWS access key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    label: 'private env secret name',
    pattern: /\b(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE|BAIDU|FEISHU|LARK|AWS|SECRET|PRIVATE|INTERNAL)[A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|_PASSWORD)\b/g,
  },
  {
    label: 'system prompt phrase',
    pattern: /\bsystem prompt\b/gi,
  },
  {
    label: 'private prompt marker',
    pattern: /<\/?(?:system|developer)[_-]?prompt\b/gi,
  },
  {
    label: 'source file reference',
    pattern: /\b(?:App|ArtifactPreview|Editor|AboutModal|ZoomableWrapper)\.tsx\b/g,
  },
];

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function relativeDistPath(filePath) {
  return path.relative(distDir, filePath).split(path.sep).join('/');
}

function redactSnippet(value) {
  return value
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g, match => `${match.slice(0, 8)}...redacted`)
    .replace(/\bsk-ant-[A-Za-z0-9_-]{12,}\b/g, match => `${match.slice(0, 10)}...redacted`)
    .replace(/\bAIza[0-9A-Za-z_-]{12,}\b/g, match => `${match.slice(0, 8)}...redacted`)
    .replace(/\bAKIA[0-9A-Z]{12,}\b/g, match => `${match.slice(0, 8)}...redacted`);
}

function makeSnippet(content, index) {
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + 120);
  return redactSnippet(content.slice(start, end).replace(/\s+/g, ' ').trim());
}

async function main() {
  try {
    const distStats = await stat(distDir);
    if (!distStats.isDirectory()) {
      throw new Error(`${distDir} is not a directory`);
    }
  } catch {
    console.error(`[build-disclosure] Missing dist directory: ${distDir}`);
    console.error(`[build-disclosure] Run npm run build before checking disclosure risk.`);
    process.exitCode = 1;
    return;
  }

  const files = await collectFiles(distDir);
  const findings = [];

  for (const filePath of files) {
    const relativePath = relativeDistPath(filePath);
    const forbiddenReason = forbiddenDistAssetNames.get(path.basename(relativePath));
    if (forbiddenReason) {
      findings.push({
        file: relativePath,
        label: 'forbidden internal asset',
        snippet: forbiddenReason,
      });
      continue;
    }

    if (relativePath.endsWith('.map')) {
      findings.push({
        file: relativePath,
        label: 'source map file',
        snippet: 'Production builds must not publish source maps.',
      });
      continue;
    }

    if (!textExtensions.has(path.extname(filePath))) continue;

    const content = await readFile(filePath, 'utf8');
    for (const { label, pattern } of disclosurePatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(content);
      if (!match) continue;

      findings.push({
        file: relativePath,
        label,
        snippet: makeSnippet(content, match.index),
      });
    }
  }

  if (findings.length > 0) {
    console.error('[build-disclosure] Potential production disclosure risks found:');
    for (const finding of findings) {
      console.error(`- ${finding.file}: ${finding.label}`);
      console.error(`  ${finding.snippet}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`[build-disclosure] Checked ${files.length} dist files; no source maps or high-confidence disclosure markers found.`);
}

await main();
