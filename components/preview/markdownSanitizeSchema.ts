import { defaultSchema } from 'rehype-sanitize';

const SAFE_MARKDOWN_INLINE_STYLE_PATTERN =
  /^(?=.{1,240}$)[ \t\r\n]*(?:(?:color:[ \t]*#[0-9a-fA-F]{6}|font-size:[ \t]*(?:12|14|15|16|18|20|24)px|font-family:[ \t]*[-"'., A-Za-z0-9\u4e00-\u9fff]{1,80}|line-height:[ \t]*(?:1\.35|1\.5|2)|letter-spacing:[ \t]*(?:0\.02|0\.05|0\.08)em)[ \t]*;?[ \t\r\n]*){1,8}$/;
const SAFE_MARKDOWN_IMAGE_SRC_PATTERN =
  /^(?:data:image\/(?:png|jpe?g|webp|avif|gif);base64,[a-zA-Z0-9+/=\s]+|(?!data:).+)$/i;
const SAFE_MARKDOWN_URL_PROTOCOL_PATTERN = /^(https?|ircs?|mailto|xmpp)$/i;
const DEFAULT_MARKDOWN_IMAGE_ATTRIBUTES = (defaultSchema.attributes?.img || [])
  .filter(attribute => attribute !== 'src');

const defaultMorndraftMarkdownUrlTransform = (value: string) => {
  const colon = value.indexOf(':');
  const questionMark = value.indexOf('?');
  const numberSign = value.indexOf('#');
  const slash = value.indexOf('/');

  if (
    colon === -1 ||
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign) ||
    SAFE_MARKDOWN_URL_PROTOCOL_PATTERN.test(value.slice(0, colon))
  ) {
    return value;
  }

  return '';
};

export const morndraftMarkdownUrlTransform = (value: string, key?: string, node?: any) => {
  if (key === 'src' && node?.tagName === 'img' && SAFE_MARKDOWN_IMAGE_SRC_PATTERN.test(value) && value.startsWith('data:')) {
    return value;
  }
  return defaultMorndraftMarkdownUrlTransform(value);
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
