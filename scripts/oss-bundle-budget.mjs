import { gzipSync } from 'node:zlib';

export const OSS_H61_ENTRY_GZIP_BYTES = 130_476;
export const OSS_H61_INITIAL_STATIC_GZIP_BYTES = 198_874;
// The 7·10 shared Final toolbar adds a lazy UI chunk plus a small controller
// edge to the initial graph. Keep the reviewed allowance bounded to 5 KiB so
// the gzip gate remains stable across supported Node/zlib patch versions.
export const OSS_ENTRY_GZIP_GROWTH_BUDGET_BYTES = 5 * 1024;
export const OSS_PARSE5_LAZY_GZIP_BUDGET_BYTES = 55 * 1024;

const isParserModule = moduleId => (
  /[\\/]node_modules[\\/](?:parse5|entities)[\\/]/u.test(moduleId)
);

export function resolveOssManualChunk(id) {
  if (!id.includes('node_modules')) return undefined;
  if (/[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/u.test(id)) return 'vendor-react';
  if (/[\\/]node_modules[\\/](?:html2canvas|modern-screenshot)[\\/]/u.test(id)) return 'vendor-capture';
  if (/[\\/]node_modules[\\/]lucide-react[\\/]/u.test(id)) return 'vendor-icons';
  if (/[\\/]node_modules[\\/]json5[\\/]/u.test(id)) return 'vendor-data';
  return undefined;
}

export function createOssBundleBudgetPlugin({
  entryBaselineBytes = OSS_H61_ENTRY_GZIP_BYTES,
  initialStaticBaselineBytes = OSS_H61_INITIAL_STATIC_GZIP_BYTES,
  growthBudgetBytes = OSS_ENTRY_GZIP_GROWTH_BUDGET_BYTES,
  parserBudgetBytes = OSS_PARSE5_LAZY_GZIP_BUDGET_BYTES,
} = {}) {
  return {
    name: 'morndraft-oss-bundle-budget',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(output => output.type === 'chunk');
      const entries = chunks.filter(chunk => chunk.isEntry);
      if (entries.length !== 1) {
        this.error(`Expected one OSS entry chunk, found ${entries.length}: ${entries.map(chunk => chunk.fileName).join(', ')}`);
        return;
      }

      const entry = entries[0];
      const entryGzipBytes = gzipSync(entry.code).byteLength;
      const entryBudgetBytes = entryBaselineBytes + growthBudgetBytes;
      if (entryGzipBytes > entryBudgetBytes) {
        this.error(`OSS entry gzip ${entryGzipBytes} B exceeds the H61 baseline budget ${entryBudgetBytes} B.`);
      }

      const chunksByFileName = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
      const initialStaticFileNames = new Set();
      const pendingStaticImports = [entry.fileName];
      while (pendingStaticImports.length > 0) {
        const fileName = pendingStaticImports.pop();
        if (initialStaticFileNames.has(fileName)) continue;
        const chunk = chunksByFileName.get(fileName);
        if (!chunk) {
          this.error(`OSS entry imports missing static chunk ${fileName}.`);
          continue;
        }
        initialStaticFileNames.add(fileName);
        pendingStaticImports.push(...chunk.imports);
      }
      const initialStaticGzipBytes = [...initialStaticFileNames].reduce((total, fileName) => (
        total + gzipSync(chunksByFileName.get(fileName).code).byteLength
      ), 0);
      const initialStaticBudgetBytes = initialStaticBaselineBytes + growthBudgetBytes;
      if (initialStaticGzipBytes > initialStaticBudgetBytes) {
        this.error(`OSS initial static JS gzip ${initialStaticGzipBytes} B exceeds the H61 baseline budget ${initialStaticBudgetBytes} B.`);
      }

      const parserChunks = chunks.filter(chunk => chunk.moduleIds.some(isParserModule));
      if (parserChunks.length === 0) this.error('The OSS build did not produce the expected lazy parse5 chunks.');
      const parserStaticFileNames = new Set();
      const pendingParserImports = parserChunks.map(chunk => chunk.fileName);
      while (pendingParserImports.length > 0) {
        const fileName = pendingParserImports.pop();
        if (parserStaticFileNames.has(fileName)) continue;
        const chunk = chunksByFileName.get(fileName);
        if (!chunk) {
          this.error(`The lazy parse5 graph imports missing static chunk ${fileName}.`);
          continue;
        }
        parserStaticFileNames.add(fileName);
        pendingParserImports.push(...chunk.imports);
      }
      if ([...parserStaticFileNames].some(fileName => initialStaticFileNames.has(fileName))) {
        this.error('parse5, entities, or one of their static dependencies leaked into the OSS initial static chunk graph.');
      }
      const parserGzipBytes = [...parserStaticFileNames].reduce((total, fileName) => (
        total + gzipSync(chunksByFileName.get(fileName).code).byteLength
      ), 0);
      if (parserGzipBytes > parserBudgetBytes) {
        this.error(`Lazy parse5 gzip ${parserGzipBytes} B exceeds ${parserBudgetBytes} B.`);
      }
    },
  };
}
