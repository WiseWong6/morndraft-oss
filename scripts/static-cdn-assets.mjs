#!/usr/bin/env node
/* global AbortController, Buffer, URL, clearTimeout, console, fetch, process, setTimeout */
import { createHash, createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnvText } from './check-production-readiness.mjs';

export const SITE_ASSET_PREFIX_ROOT = 'prod/site-assets/';
export const STATIC_CDN_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const DEFAULT_ENV_FILE = '/etc/morndraft/prod.env';
const DEFAULT_DIST_DIR = 'dist';
const DEFAULT_CLEANUP_RETENTION_HOURS = 72;
const DEFAULT_TOS_FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_CDN_SMOKE_FETCH_TIMEOUT_MS = 15_000;
const DELETE_BATCH_SIZE = 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

const REQUIRED_TOS_KEYS = [
  'VOLCENGINE_TOS_REGION',
  'VOLCENGINE_TOS_ENDPOINT',
  'VOLCENGINE_TOS_BUCKET',
  'VOLCENGINE_TOS_ACCESS_KEY_ID',
  'VOLCENGINE_TOS_ACCESS_KEY_SECRET',
  'MORNDRAFT_ASSET_PUBLIC_BASE_URL',
];

const CONTENT_TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
]);

function logStaticCdnStage(message) {
  console.log(`[static-cdn] ${new Date().toISOString()} ${message}`);
}

function trimSlashes(value) {
  return value.replace(/^\/+|\/+$/g, '');
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function encodePathSegments(value) {
  return value
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function xmlEscape(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlDecode(value) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

export function normalizeStaticAssetBaseUrl(rawValue) {
  const trimmed = `${rawValue ?? ''}`.trim();
  if (!trimmed) throw new Error('MORNDRAFT_STATIC_ASSET_BASE_URL is required.');
  const url = new URL(trimmed);
  if (url.protocol !== 'https:') {
    throw new Error('MORNDRAFT_STATIC_ASSET_BASE_URL must use https.');
  }
  url.pathname = ensureTrailingSlash(url.pathname);
  url.search = '';
  url.hash = '';
  const objectKeyPrefix = trimSlashes(decodeURIComponent(url.pathname));
  if (objectKeyPrefix === trimSlashes(SITE_ASSET_PREFIX_ROOT)) {
    throw new Error('Static asset base URL must include exactly one release prefix under /prod/site-assets/<sha>/.');
  }
  if (!objectKeyPrefix.startsWith(SITE_ASSET_PREFIX_ROOT)) {
    throw new Error(`Static asset base URL must be under /${SITE_ASSET_PREFIX_ROOT}.`);
  }
  if (!/^prod\/site-assets\/[^/]+\/$/.test(`${objectKeyPrefix}/`)) {
    throw new Error('Static asset base URL must include exactly one release prefix under /prod/site-assets/<sha>/.');
  }
  return url.toString();
}

export function objectKeyPrefixFromStaticBaseUrl(staticBaseUrl) {
  const url = new URL(normalizeStaticAssetBaseUrl(staticBaseUrl));
  return ensureTrailingSlash(trimSlashes(decodeURIComponent(url.pathname)));
}

export function validateStaticBaseAgainstPublicBase(staticBaseUrl, publicBaseUrl) {
  const staticUrl = new URL(normalizeStaticAssetBaseUrl(staticBaseUrl));
  const publicUrl = new URL(publicBaseUrl);
  if (staticUrl.origin !== publicUrl.origin) {
    throw new Error('Static asset base URL must use the same origin as MORNDRAFT_ASSET_PUBLIC_BASE_URL.');
  }
  const publicPath = ensureTrailingSlash(publicUrl.pathname);
  if (!staticUrl.pathname.startsWith(publicPath)) {
    throw new Error('Static asset base URL must be under MORNDRAFT_ASSET_PUBLIC_BASE_URL.');
  }
}

export function isUploadableStaticAsset(relativePath) {
  const normalizedPath = relativePath.split(path.sep).join('/');
  if (!normalizedPath || normalizedPath.startsWith('../') || normalizedPath.startsWith('/')) return false;
  if (normalizedPath === 'index.html') return false;
  if (normalizedPath === 'morndraft-build-profile.json') return false;
  if (normalizedPath.startsWith('admin-data/')) return false;
  if (normalizedPath.endsWith('.map')) return false;
  return true;
}

export function contentTypeForStaticAsset(relativePath) {
  return CONTENT_TYPES.get(path.extname(relativePath).toLowerCase()) ?? 'application/octet-stream';
}

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

export async function buildStaticAssetManifest({ distDir, staticBaseUrl }) {
  const normalizedBaseUrl = normalizeStaticAssetBaseUrl(staticBaseUrl);
  const keyPrefix = objectKeyPrefixFromStaticBaseUrl(normalizedBaseUrl);
  const absoluteDistDir = path.resolve(distDir);
  const files = await collectFiles(absoluteDistDir);
  return files
    .map((filePath) => {
      const relativePath = path.relative(absoluteDistDir, filePath).split(path.sep).join('/');
      return { filePath, relativePath };
    })
    .filter(({ relativePath }) => isUploadableStaticAsset(relativePath))
    .map(({ filePath, relativePath }) => ({
      filePath,
      relativePath,
      objectKey: `${keyPrefix}${relativePath}`,
      publicUrl: new URL(encodePathSegments(relativePath), normalizedBaseUrl).toString(),
      contentType: contentTypeForStaticAsset(relativePath),
      cacheControl: STATIC_CDN_CACHE_CONTROL,
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function md5Base64(value) {
  return createHash('md5').update(value).digest('base64');
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

function toAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function toDateStamp(date) {
  return toAmzDate(date).slice(0, 8);
}

function createS3V4SigningKey(secret, dateStamp, region) {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQueryString(searchParams) {
  return [...searchParams.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
}

function canonicalHeaderValue(value) {
  return `${value}`.trim().replace(/\s+/g, ' ');
}

export function signTosRequest({ body = Buffer.alloc(0), config, headers = {}, method, now = new Date(), url }) {
  const requestUrl = new URL(url);
  const payloadHash = sha256Hex(body);
  const dateStamp = toDateStamp(now);
  const amzDate = toAmzDate(now);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const normalizedHeaders = {
    ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), canonicalHeaderValue(value)])),
    host: requestUrl.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaderNames = Object.keys(normalizedHeaders).sort();
  const canonicalHeaders = signedHeaderNames
    .map((key) => `${key}:${normalizedHeaders[key]}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [
    method,
    requestUrl.pathname || '/',
    canonicalQueryString(requestUrl.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = createHmac('sha256', createS3V4SigningKey(
    config.accessKeySecret,
    dateStamp,
    config.region,
  )).update(stringToSign).digest('hex');
  return {
    ...normalizedHeaders,
    authorization: [
      `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', '),
  };
}

function virtualHostedTosUrl(config, objectKey = '') {
  const endpointUrl = new URL(/^https?:\/\//i.test(config.endpoint) ? config.endpoint : `https://${config.endpoint}`);
  endpointUrl.hostname = `${config.bucket}.${endpointUrl.hostname}`;
  endpointUrl.pathname = objectKey ? `/${encodePathSegments(objectKey)}` : '/';
  endpointUrl.search = '';
  endpointUrl.hash = '';
  return endpointUrl;
}

export function resolveVolcengineTosConfig(env) {
  if ((env.MORNDRAFT_ASSET_STORAGE_PROVIDER ?? '').trim().toLowerCase() !== 'volcengine-tos') {
    throw new Error('Static CDN upload requires MORNDRAFT_ASSET_STORAGE_PROVIDER=volcengine-tos.');
  }
  const missingKeys = REQUIRED_TOS_KEYS.filter((key) => !`${env[key] ?? ''}`.trim());
  if (missingKeys.length > 0) {
    throw new Error(`Missing Volcengine TOS env keys: ${missingKeys.join(', ')}`);
  }
  return {
    accessKeyId: env.VOLCENGINE_TOS_ACCESS_KEY_ID.trim(),
    accessKeySecret: env.VOLCENGINE_TOS_ACCESS_KEY_SECRET.trim(),
    bucket: env.VOLCENGINE_TOS_BUCKET.trim(),
    endpoint: env.VOLCENGINE_TOS_ENDPOINT.trim(),
    publicBaseUrl: env.MORNDRAFT_ASSET_PUBLIC_BASE_URL.trim(),
    region: env.VOLCENGINE_TOS_REGION.trim(),
  };
}

export async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = DEFAULT_TOS_FETCH_TIMEOUT_MS, label = 'Request') {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut || error?.name === 'AbortError') {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function putTosObject({ config, item }) {
  const body = await readFile(item.filePath);
  const url = virtualHostedTosUrl(config, item.objectKey);
  const headers = signTosRequest({
    body,
    config,
    headers: {
      'cache-control': item.cacheControl,
      'content-type': item.contentType,
    },
    method: 'PUT',
    url,
  });
  const response = await fetchWithTimeout(fetch, url, {
    body,
    headers,
    method: 'PUT',
  }, DEFAULT_TOS_FETCH_TIMEOUT_MS, `Upload ${item.relativePath}`);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Upload failed for ${item.relativePath}: ${response.status} ${response.statusText} ${text}`.trim());
  }
}

function parseListObjectsResponse(xml) {
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)]
    .map((match) => {
      const keyMatch = match[1].match(/<Key>([\s\S]*?)<\/Key>/);
      if (!keyMatch) return null;
      const lastModifiedMatch = match[1].match(/<LastModified>([\s\S]*?)<\/LastModified>/);
      return {
        key: xmlDecode(keyMatch[1]),
        lastModified: lastModifiedMatch ? xmlDecode(lastModifiedMatch[1]) : '',
      };
    })
    .filter(Boolean);
  const keys = objects.length > 0
    ? objects.map((object) => object.key)
    : [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((match) => xmlDecode(match[1]));
  const tokenMatch = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/);
  return {
    keys,
    objects: objects.length > 0 ? objects : keys.map((key) => ({ key, lastModified: '' })),
    nextContinuationToken: tokenMatch ? xmlDecode(tokenMatch[1]) : '',
  };
}

async function listTosObjectEntries({ config, prefix }) {
  const objects = [];
  let continuationToken = '';
  do {
    const url = virtualHostedTosUrl(config);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('prefix', prefix);
    if (continuationToken) {
      url.searchParams.set('continuation-token', continuationToken);
    }
    const headers = signTosRequest({ config, method: 'GET', url });
    const response = await fetchWithTimeout(fetch, url, { headers, method: 'GET' }, DEFAULT_TOS_FETCH_TIMEOUT_MS, 'List static CDN objects');
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`List objects failed: ${response.status} ${response.statusText} ${text}`.trim());
    }
    const parsed = parseListObjectsResponse(text);
    objects.push(...parsed.objects);
    continuationToken = parsed.nextContinuationToken;
  } while (continuationToken);
  return objects;
}

function normalizeObjectEntry(entry) {
  if (typeof entry === 'string') return { key: entry, lastModified: '' };
  return {
    key: String(entry?.key || ''),
    lastModified: String(entry?.lastModified || ''),
  };
}

export function filterStaleSiteAssetKeys(entries, currentPrefix, options = {}) {
  const normalizedCurrentPrefix = ensureTrailingSlash(currentPrefix);
  const retentionMs = Number.isFinite(options.retentionMs) ? options.retentionMs : 0;
  const cutoffMs = retentionMs > 0
    ? (Number.isFinite(options.nowMs) ? options.nowMs : Date.now()) - retentionMs
    : null;
  return entries
    .map(normalizeObjectEntry)
    .filter(({ key }) => key.startsWith(SITE_ASSET_PREFIX_ROOT))
    .filter(({ key }) => !key.startsWith(normalizedCurrentPrefix))
    .filter(({ lastModified }) => {
      if (cutoffMs === null) return true;
      if (!lastModified) return false;
      const lastModifiedMs = Date.parse(lastModified);
      return Number.isFinite(lastModifiedMs) && lastModifiedMs < cutoffMs;
    })
    .map(({ key }) => key);
}

function buildDeleteObjectsXml(keys) {
  return Buffer.from([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Delete>',
    '<Quiet>true</Quiet>',
    ...keys.map((key) => `<Object><Key>${xmlEscape(key)}</Key></Object>`),
    '</Delete>',
  ].join(''), 'utf8');
}

async function deleteTosObjects({ config, keys }) {
  if (keys.length === 0) return;
  const body = buildDeleteObjectsXml(keys);
  const url = virtualHostedTosUrl(config);
  url.search = 'delete=';
  const headers = signTosRequest({
    body,
    config,
    headers: {
      'content-md5': md5Base64(body),
      'content-type': 'application/xml',
    },
    method: 'POST',
    url,
  });
  const response = await fetchWithTimeout(fetch, url, {
    body,
    headers,
    method: 'POST',
  }, DEFAULT_TOS_FETCH_TIMEOUT_MS, 'Delete static CDN objects');
  const text = await response.text();
  if (!response.ok || /<Error>/.test(text)) {
    throw new Error(`Delete objects failed: ${response.status} ${response.statusText} ${text}`.trim());
  }
}

export function selectSmokeAssets(manifest) {
  const selected = [];
  for (const extension of ['.js', '.css', '.woff2']) {
    const item = manifest.find((candidate) => candidate.relativePath.endsWith(extension));
    if (item && !selected.includes(item)) selected.push(item);
  }
  if (selected.length === 0 && manifest[0]) selected.push(manifest[0]);
  return selected;
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function smokePublicUrl(item, { delayMs, fetchImpl = fetch, retries }) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      let response = await fetchWithTimeout(fetchImpl, item.publicUrl, { method: 'HEAD' }, DEFAULT_CDN_SMOKE_FETCH_TIMEOUT_MS, `CDN smoke ${item.relativePath}`);
      if (response.status === 405) {
        response = await fetchWithTimeout(fetchImpl, item.publicUrl, { method: 'GET' }, DEFAULT_CDN_SMOKE_FETCH_TIMEOUT_MS, `CDN smoke ${item.relativePath}`);
      }
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const expectedContentType = item.contentType.split(';')[0];
      const actualContentType = response.headers.get('content-type') ?? '';
      if (!actualContentType.toLowerCase().startsWith(expectedContentType.toLowerCase())) {
        throw new Error(`expected ${expectedContentType}, got ${actualContentType || 'missing content-type'}`);
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(delayMs);
    }
  }
  throw new Error(`CDN smoke failed for ${item.publicUrl}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function uploadCommand(options) {
  const env = parseEnvText(await readFile(options.envFile, 'utf8'));
  const config = resolveVolcengineTosConfig(env);
  const staticBaseUrl = normalizeStaticAssetBaseUrl(options.staticBaseUrl);
  validateStaticBaseAgainstPublicBase(staticBaseUrl, config.publicBaseUrl);
  const manifest = await buildStaticAssetManifest({
    distDir: options.distDir,
    staticBaseUrl,
  });
  if (manifest.length === 0) throw new Error('No static CDN assets found to upload.');
  const prefix = objectKeyPrefixFromStaticBaseUrl(staticBaseUrl);
  logStaticCdnStage(`upload start: ${manifest.length} assets to ${prefix}`);
  for (const item of manifest) {
    await putTosObject({ config, item });
  }
  logStaticCdnStage(`upload complete: ${manifest.length} assets to ${prefix}`);
  if (options.smoke) {
    const smokeAssets = selectSmokeAssets(manifest);
    logStaticCdnStage(`smoke start: ${smokeAssets.map((item) => item.relativePath).join(', ')}`);
    for (const item of smokeAssets) {
      await smokePublicUrl(item, {
        delayMs: options.smokeDelayMs,
        retries: options.smokeRetries,
      });
    }
    logStaticCdnStage(`smoke complete: ${smokeAssets.length} assets`);
  }
}

async function cleanupCommand(options) {
  const env = parseEnvText(await readFile(options.envFile, 'utf8'));
  const config = resolveVolcengineTosConfig(env);
  const staticBaseUrl = normalizeStaticAssetBaseUrl(options.staticBaseUrl);
  validateStaticBaseAgainstPublicBase(staticBaseUrl, config.publicBaseUrl);
  const currentPrefix = objectKeyPrefixFromStaticBaseUrl(staticBaseUrl);
  logStaticCdnStage(`cleanup start: current=${currentPrefix}, retention=${options.retentionHours}h`);
  const objectEntries = await listTosObjectEntries({ config, prefix: SITE_ASSET_PREFIX_ROOT });
  const retentionMs = options.retentionHours * MS_PER_HOUR;
  const staleKeys = filterStaleSiteAssetKeys(objectEntries, currentPrefix, { retentionMs });
  for (let index = 0; index < staleKeys.length; index += DELETE_BATCH_SIZE) {
    await deleteTosObjects({
      config,
      keys: staleKeys.slice(index, index + DELETE_BATCH_SIZE),
    });
  }
  logStaticCdnStage(`cleanup complete: deleted=${staleKeys.length}, kept=${currentPrefix}`);
}

function parseArgs(argv) {
  const [, , command, ...rest] = argv;
  const options = {
    command,
    distDir: DEFAULT_DIST_DIR,
    envFile: DEFAULT_ENV_FILE,
    retentionHours: DEFAULT_CLEANUP_RETENTION_HOURS,
    smoke: false,
    smokeDelayMs: 5000,
    smokeRetries: 6,
    staticBaseUrl: '',
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--dist-dir') {
      options.distDir = rest[++index];
    } else if (arg === '--env-file') {
      options.envFile = rest[++index];
    } else if (arg === '--retention-hours') {
      options.retentionHours = Number.parseInt(rest[++index], 10);
    } else if (arg === '--smoke') {
      options.smoke = true;
    } else if (arg === '--smoke-delay-ms') {
      options.smokeDelayMs = Number.parseInt(rest[++index], 10);
    } else if (arg === '--smoke-retries') {
      options.smokeRetries = Number.parseInt(rest[++index], 10);
    } else if (arg === '--static-base-url') {
      options.staticBaseUrl = rest[++index];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(options.retentionHours) || options.retentionHours < 1) {
    throw new Error('--retention-hours must be a positive integer.');
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/static-cdn-assets.mjs upload --static-base-url <url> [--dist-dir dist] [--env-file /etc/morndraft/prod.env] [--smoke]
  node scripts/static-cdn-assets.mjs cleanup --static-base-url <url> [--env-file /etc/morndraft/prod.env] [--retention-hours 72]
`);
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help || !options.command) {
    printHelp();
    return;
  }
  if (!options.staticBaseUrl) throw new Error('Missing --static-base-url');
  if (!existsSync(options.envFile)) throw new Error(`Env file not found: ${options.envFile}`);
  if (options.command === 'upload') {
    if (!existsSync(options.distDir)) throw new Error(`Dist dir not found: ${options.distDir}`);
    await uploadCommand(options);
  } else if (options.command === 'cleanup') {
    await cleanupCommand(options);
  } else {
    throw new Error(`Unknown command: ${options.command}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`[static-cdn] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
