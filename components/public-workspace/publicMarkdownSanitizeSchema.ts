import { defaultSchema } from 'rehype-sanitize';

const SAFE_MARKDOWN_INLINE_STYLE_DECLARATION = [
  String.raw`color:[ \t]*#[0-9a-fA-F]{6}`,
  String.raw`font-size:[ \t]*(?:12|14|15|16|18|20|24)px`,
  String.raw`font-family:[ \t]*(?:"MornDraft Sans SC",[ \t]*"Noto Sans SC",[ \t]*"Source Han Sans SC",[ \t]*"PingFang SC",[ \t]*"Microsoft YaHei",[ \t]*sans-serif|"MornDraft Serif SC",[ \t]*"Noto Serif SC",[ \t]*"Source Han Serif SC",[ \t]*"Songti SC",[ \t]*"SimSun",[ \t]*serif)`,
  String.raw`line-height:[ \t]*(?:1\.35|1\.5|2)`,
  String.raw`letter-spacing:[ \t]*(?:0\.02|0\.05|0\.08)em`,
].join('|');
const SAFE_MARKDOWN_INLINE_STYLE_PATTERN = new RegExp(
  `^[ \\t]*(?:${SAFE_MARKDOWN_INLINE_STYLE_DECLARATION})(?:;[ \\t]*(?:${SAFE_MARKDOWN_INLINE_STYLE_DECLARATION}))*;?[ \\t]*$`,
  'u',
);
const SAFE_MARKDOWN_IMAGE_SRC_PATTERN =
  /^(?:data:image\/(?:png|jpe?g|webp|avif|gif);base64,(?:[a-zA-Z0-9+/=\s]|%[0-9a-fA-F]{2})+|(?!data:).+)$/i;
const DEFAULT_MARKDOWN_IMAGE_ATTRIBUTES = (defaultSchema.attributes?.img || [])
  .filter(attribute => attribute !== 'src');

type PublicMarkdownHastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: PublicMarkdownHastNode[];
};

export const canonicalizePublicMarkdownImageDataUrl = (value: string) => {
  if (!SAFE_MARKDOWN_IMAGE_SRC_PATTERN.test(value)) return null;
  const prefix = value.match(/^data:image\/(png|jpe?g|webp|avif|gif);base64,/iu);
  if (!prefix) return null;
  return `data:image/${prefix[1].toLowerCase()};base64,${value.slice(prefix[0].length)}`;
};

/**
 * rehype-sanitize checks protocols before ReactMarkdown calls urlTransform.
 * Normalize the narrowly allowed local image prefix first so mixed-case data
 * URLs cannot be dropped solely because their scheme uses uppercase letters.
 */
export const rehypeCanonicalizePublicMarkdownImageDataUrls = () => (
  tree: PublicMarkdownHastNode,
) => {
  const visit = (node: PublicMarkdownHastNode) => {
    if (node.type === 'element' && node.tagName === 'img' && node.properties) {
      const src = node.properties.src;
      if (typeof src === 'string') {
        const canonical = canonicalizePublicMarkdownImageDataUrl(src);
        if (canonical) node.properties.src = canonical;
      }
    }
    node.children?.forEach(visit);
  };
  visit(tree);
};

export const MORNDRAFT_MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  clobberPrefix: 'morndraft-user-content-',
  tagNames: Array.from(new Set([
    ...(defaultSchema.tagNames || []).filter(
      (tagName) => !['iframe', 'script', 'object', 'embed', 'form'].includes(tagName),
    ),
    'mark',
    'u',
  ])),
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(defaultSchema.attributes?.['*'] || []),
      'aria-label',
      'title',
    ],
    code: [
      ...(defaultSchema.attributes?.code || []),
      ['className', /^language-[a-zA-Z0-9_-]+$/],
    ],
    img: [
      ...DEFAULT_MARKDOWN_IMAGE_ATTRIBUTES,
      ['src', SAFE_MARKDOWN_IMAGE_SRC_PATTERN],
    ],
    span: [
      ...(defaultSchema.attributes?.span || []),
      ['style', SAFE_MARKDOWN_INLINE_STYLE_PATTERN],
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'tel'],
    src: ['http', 'https', 'data'],
  },
};
