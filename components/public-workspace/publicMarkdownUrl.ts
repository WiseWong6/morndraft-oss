import { defaultUrlTransform } from 'react-markdown';

const PUBLIC_LOCAL_IMAGE_DATA_URL =
  /^data:image\/(?:avif|gif|jpeg|png|webp);base64,(?:[a-z0-9+/=\s]|%[0-9a-f]{2})+$/iu;

export const transformPublicMarkdownUrl = (url: string) => (
  PUBLIC_LOCAL_IMAGE_DATA_URL.test(url) ? url : defaultUrlTransform(url)
);
