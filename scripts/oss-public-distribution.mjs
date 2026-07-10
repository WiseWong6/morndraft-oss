import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export const OSS_DISTRIBUTION_MANIFEST_PATH = 'profiles/oss-public-distribution.json';
const RESERVED_DISTRIBUTION_SEGMENTS = new Set([
  '.git',
  '.vite',
  'artifacts',
  'dist',
  'node_modules',
  'output',
]);
const SAFE_MANIFEST_PATH = /^[A-Za-z0-9._@/-]+$/;

function assertStringArray(manifest, key, { allowEmpty = false } = {}) {
  const values = manifest[key];
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: ${key} must be a non-empty array`);
  }
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || !value || value.includes('\\')) {
      throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: ${key} contains an invalid path or name`);
    }
    if (key.toLowerCase().includes('dependencies') || key === 'workspacePackages') {
      if (value.startsWith('.') || value.startsWith('/') || value.includes('node_modules')) {
        throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: ${key} contains invalid package ${value}`);
      }
    } else {
      const normalized = path.posix.normalize(value);
      const segments = normalized.split('/');
      if (
        !SAFE_MANIFEST_PATH.test(value)
        || normalized !== value
        || normalized === '.'
        || normalized === '..'
        || normalized.startsWith('../')
        || path.posix.isAbsolute(value)
        || segments.some(segment => RESERVED_DISTRIBUTION_SEGMENTS.has(segment))
        || /^(?:\.env(?:\.|$)|\.npmrc$)/i.test(path.posix.basename(value))
        || /\.(?:key|pem|p12|pfx)$/i.test(value)
      ) {
        throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: ${key} contains unsafe path ${value}`);
      }
    }
    if (seen.has(value)) {
      throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: ${key} contains duplicate ${value}`);
    }
    seen.add(value);
  }
  return values;
}

export function validateOssDistributionManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || manifest.schemaVersion !== 1) {
    throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: schemaVersion must be 1`);
  }
  for (const key of ['packageName', 'profile', 'buildPreset']) {
    if (typeof manifest[key] !== 'string' || !manifest[key]) {
      throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: ${key} must be a non-empty string`);
    }
  }
  for (const key of [
    'workspacePackages',
    'sourceEntrypoints',
    'copyFiles',
    'copyDirectories',
    'testFiles',
    'runtimeDependencies',
    'devDependencies',
    'excludedPathSegments',
    'excludedFiles',
    'requiredFiles',
  ]) {
    assertStringArray(manifest, key, {
      allowEmpty: key === 'copyDirectories' || key === 'excludedPathSegments' || key === 'excludedFiles',
    });
  }

  const declaredFiles = new Set(manifest.copyFiles);
  const declaredDirectories = manifest.copyDirectories.map(entry => `${entry}/`);
  for (const entrypoint of manifest.sourceEntrypoints) {
    if (!declaredFiles.has(entrypoint) && !declaredDirectories.some(directory => entrypoint.startsWith(directory))) {
      throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: source entrypoint is outside positive copy roots: ${entrypoint}`);
    }
  }
  for (const testFile of manifest.testFiles) {
    if (!/\.test\.[cm]?[jt]sx?$/.test(testFile)) {
      throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: testFiles contains non-test file ${testFile}`);
    }
  }
  const overlappingDependencies = manifest.runtimeDependencies.filter(name => manifest.devDependencies.includes(name));
  if (overlappingDependencies.length > 0) {
    throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: dependencies overlap: ${overlappingDependencies.join(', ')}`);
  }
  if (!manifest.sourceMarkerAllowances || typeof manifest.sourceMarkerAllowances !== 'object') {
    throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: sourceMarkerAllowances must be an object`);
  }
  for (const [label, allowances] of Object.entries(manifest.sourceMarkerAllowances)) {
    if (!label || !allowances || typeof allowances !== 'object' || Array.isArray(allowances)) {
      throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: invalid source marker allowance ${label}`);
    }
    for (const [relativePath, count] of Object.entries(allowances)) {
      const normalized = path.posix.normalize(relativePath);
      if (normalized !== relativePath || normalized.startsWith('../') || path.posix.isAbsolute(relativePath)) {
        throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: unsafe source marker path ${relativePath}`);
      }
      if (!Number.isInteger(count) || count < 1) {
        throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: source marker count must be a positive integer for ${relativePath}`);
      }
      if (!isDeclaredOssPath(manifest, relativePath)) {
        throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: source marker allowance is outside copy roots: ${relativePath}`);
      }
    }
  }
  return manifest;
}

function isInsideDirectory(rootPath, candidatePath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

async function assertSafeDeclaredSource(projectDir, projectRealPath, relativePath, expectedType) {
  let currentPath = projectDir;
  for (const segment of relativePath.split('/')) {
    currentPath = path.join(currentPath, segment);
    const entryStat = await lstat(currentPath).catch(() => null);
    if (!entryStat) {
      throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: declared ${expectedType} is missing: ${relativePath}`);
    }
    if (entryStat.isSymbolicLink()) {
      throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: declared source contains a symbolic link: ${relativePath}`);
    }
  }

  const resolvedPath = await realpath(currentPath);
  if (!isInsideDirectory(projectRealPath, resolvedPath)) {
    throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: declared source escapes the repository: ${relativePath}`);
  }
  const sourceStat = await lstat(currentPath);
  if (expectedType === 'file' ? !sourceStat.isFile() : !sourceStat.isDirectory()) {
    throw new Error(`${OSS_DISTRIBUTION_MANIFEST_PATH}: declared ${expectedType} has the wrong type: ${relativePath}`);
  }

  if (expectedType !== 'directory') return;
  const pendingDirectories = [currentPath];
  while (pendingDirectories.length > 0) {
    const directoryPath = pendingDirectories.pop();
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `${OSS_DISTRIBUTION_MANIFEST_PATH}: declared source contains a symbolic link: ${path.relative(projectDir, entryPath)}`,
        );
      }
      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath);
      } else if (!entry.isFile()) {
        throw new Error(
          `${OSS_DISTRIBUTION_MANIFEST_PATH}: declared source contains a non-regular file: ${path.relative(projectDir, entryPath)}`,
        );
      }
    }
  }
}

export async function readOssDistributionManifest(projectDir) {
  const manifestPath = path.join(projectDir, OSS_DISTRIBUTION_MANIFEST_PATH);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const validatedManifest = validateOssDistributionManifest(manifest);
  const projectRealPath = await realpath(projectDir);
  for (const relativePath of new Set([
    ...validatedManifest.copyFiles,
    ...validatedManifest.testFiles,
    ...validatedManifest.sourceEntrypoints,
  ])) {
    await assertSafeDeclaredSource(projectDir, projectRealPath, relativePath, 'file');
  }
  for (const relativePath of validatedManifest.copyDirectories) {
    await assertSafeDeclaredSource(projectDir, projectRealPath, relativePath, 'directory');
  }
  return validatedManifest;
}

export function isDeclaredOssPath(manifest, relativePath) {
  if (manifest.copyFiles.includes(relativePath) || manifest.testFiles.includes(relativePath)) return true;
  return manifest.copyDirectories.some(directory => (
    relativePath === directory || relativePath.startsWith(`${directory}/`)
  ));
}

export function normalizeExternalPackageSpecifier(specifier) {
  if (
    typeof specifier !== 'string'
    || !specifier
    || specifier.startsWith('.')
    || specifier.startsWith('/')
    || specifier.startsWith('#')
    || specifier.startsWith('node:')
    || /^[a-z][a-z0-9+.-]*:/i.test(specifier)
  ) return null;
  const segments = specifier.split('/');
  if (specifier.startsWith('@')) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : null;
  }
  return segments[0] || null;
}
