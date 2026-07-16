#!/usr/bin/env node
/* global console, process */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const MAX_RELEASE_FILES = 2_000;
const MAX_RELEASE_BYTES = 128 * 1024 * 1024;

const toPosixPath = (value) => value.split(path.sep).join('/');

function comparePortablePaths(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function sha256File(filePath) {
  return sha256(await readFile(filePath));
}

function assertSafeRelativePath(relativePath) {
  if (
    !relativePath
    || relativePath.includes('\\')
    || [...relativePath].some(character => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    })
    || path.posix.isAbsolute(relativePath)
    || relativePath.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Unsafe release path: ${JSON.stringify(relativePath)}`);
  }
}

async function collectStaticFiles(rootDir) {
  const files = [];
  let totalBytes = 0;

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => comparePortablePaths(left.name, right.name))) {
      const entryPath = path.join(directory, entry.name);
      const relativePath = toPosixPath(path.relative(rootDir, entryPath));
      assertSafeRelativePath(relativePath);
      const metadata = await lstat(entryPath);
      if (metadata.isSymbolicLink()) {
        throw new Error(`${relativePath}: symbolic links are forbidden in OSS releases`);
      }
      if (metadata.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (!metadata.isFile()) {
        throw new Error(`${relativePath}: only regular files are allowed in OSS releases`);
      }
      if (/\.map$/iu.test(relativePath)) {
        throw new Error(`${relativePath}: source maps are forbidden in OSS releases`);
      }
      if (/^(?:\.env(?:\.|$)|\.npmrc$)|\.(?:key|pem|p12|pfx)$/iu.test(path.posix.basename(relativePath))) {
        throw new Error(`${relativePath}: secret-bearing file types are forbidden in OSS releases`);
      }
      totalBytes += metadata.size;
      if (files.length + 1 > MAX_RELEASE_FILES || totalBytes > MAX_RELEASE_BYTES) {
        throw new Error('OSS release exceeds the reviewed file-count or unpacked-size budget');
      }
      files.push({
        path: relativePath,
        sha256: await sha256File(entryPath),
        size: metadata.size,
        sourcePath: entryPath,
      });
    }
  }

  await walk(rootDir);
  files.sort((left, right) => comparePortablePaths(left.path, right.path));
  if (files.length === 0) throw new Error('OSS release contains no static files');
  if (!files.some(file => file.path === 'index.html')) {
    throw new Error('OSS release is missing index.html');
  }
  return { files, totalBytes };
}

const run = (command, args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, COPYFILE_DISABLE: '1' },
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`));
  });
});

async function materializeArchiveTree(files, stageDir) {
  const siteDir = path.join(stageDir, 'site');
  await mkdir(siteDir, { recursive: true, mode: 0o755 });
  for (const file of files) {
    const targetPath = path.join(siteDir, ...file.path.split('/'));
    await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o755 });
    await copyFile(file.sourcePath, targetPath);
  }
}

function validateReleaseIdentity({ repository, runId, sourceSha }) {
  if (!REPOSITORY_PATTERN.test(repository)) {
    throw new Error(`Invalid GitHub repository: ${JSON.stringify(repository)}`);
  }
  if (!SOURCE_SHA_PATTERN.test(sourceSha)) {
    throw new Error('Release source SHA must be 40 lowercase hexadecimal characters');
  }
  if (!/^[1-9][0-9]*$/u.test(String(runId))) {
    throw new Error('Workflow run ID must be a positive integer');
  }
}

export async function createOssRelease({
  distDir,
  outputDir,
  repository,
  runId,
  sourceSha,
}) {
  validateReleaseIdentity({ repository, runId, sourceSha });
  const distMetadata = await stat(distDir).catch(() => undefined);
  if (!distMetadata?.isDirectory()) {
    throw new Error(`OSS dist directory does not exist: ${distDir}`);
  }

  const { files, totalBytes } = await collectStaticFiles(distDir);
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(outputDir, { recursive: true, mode: 0o755 });
  const stageDir = path.join(outputDir, '.archive-stage');
  await materializeArchiveTree(files, stageDir);

  const archiveFileName = `morndraft-oss-${sourceSha}.tar.gz`;
  const archivePath = path.join(outputDir, archiveFileName);
  try {
    await run('tar', [
      '-czf', archivePath,
      '-C', stageDir,
      'site',
    ], outputDir);
  } finally {
    await rm(stageDir, { force: true, recursive: true });
  }

  const archiveMetadata = await stat(archivePath);
  const archiveSha256 = await sha256File(archivePath);
  if (!SHA256_PATTERN.test(archiveSha256)) throw new Error('Could not calculate archive SHA-256');

  const manifest = {
    schemaVersion: 1,
    repository,
    sourceSha,
    workflowRunId: Number(runId),
    workflowName: 'OSS release',
    buildProfile: 'oss-full',
    distributionProfile: 'oss',
    archive: {
      fileName: archiveFileName,
      sha256: archiveSha256,
      size: archiveMetadata.size,
    },
    fileCount: files.length,
    totalBytes,
    files: files.map(file => ({ path: file.path, sha256: file.sha256, size: file.size })),
  };
  const manifestPath = path.join(outputDir, 'release-manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  const manifestSha256 = await sha256File(manifestPath);
  await writeFile(
    path.join(outputDir, 'SHA256SUMS'),
    `${archiveSha256}  ${archiveFileName}\n${manifestSha256}  release-manifest.json\n`,
    { mode: 0o644 },
  );
  return { archivePath, manifest, manifestPath };
}

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  if (!process.argv[index + 1]) throw new Error(`${name} requires a value`);
  return process.argv[index + 1];
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectDir = path.resolve(scriptDir, '..');
  const result = await createOssRelease({
    distDir: path.resolve(projectDir, readArgument('--dist', 'dist/oss')),
    outputDir: path.resolve(projectDir, readArgument('--output', 'output/oss-release')),
    repository: readArgument('--repository', process.env.GITHUB_REPOSITORY ?? ''),
    runId: readArgument('--run-id', process.env.GITHUB_RUN_ID ?? ''),
    sourceSha: readArgument('--sha', process.env.GITHUB_SHA ?? ''),
  });
  console.log(`[oss-release] ${result.manifest.sourceSha} packaged as ${result.manifest.archive.fileName} with ${result.manifest.fileCount} files.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
