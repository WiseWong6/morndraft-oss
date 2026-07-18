import React from 'react';

const mergeClassName = (...classNames: Array<string | undefined>) =>
  classNames.filter(Boolean).join(' ') || undefined;

export type MarkdownImageFrameAttributes = React.HTMLAttributes<HTMLElement> & {
  [key: `data-${string}`]: string | undefined;
};

export const MarkdownImageFrame: React.FC<{
  alt?: string;
  frameAttributes?: MarkdownImageFrameAttributes;
  hidden?: boolean;
  imageAttributes?: React.ImgHTMLAttributes<HTMLImageElement>;
  src?: string;
  title?: string;
}> = ({
  alt = '',
  frameAttributes,
  hidden,
  imageAttributes,
  src,
  title,
}) => {
  const normalizedSrc = typeof src === 'string' && src.length > 0 ? src : undefined;
  const normalizedTitle = typeof title === 'string' && title.length > 0 ? title : undefined;

  return (
    <figure
      {...frameAttributes}
      hidden={hidden ?? frameAttributes?.hidden}
      className={mergeClassName('aad-markdown-image-frame', frameAttributes?.className)}
    >
      <img
        {...imageAttributes}
        loading={imageAttributes?.loading ?? 'lazy'}
        decoding={imageAttributes?.decoding ?? 'async'}
        src={normalizedSrc}
        alt={typeof alt === 'string' ? alt : ''}
        title={normalizedTitle}
        className={mergeClassName('aad-auto-image-link', imageAttributes?.className)}
      />
    </figure>
  );
};
