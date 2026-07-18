import React from 'react';
import { ArrowUp } from 'lucide-react';

type ScrollToTopButtonProps = {
  visible: boolean;
  label: string;
  onClick: () => void;
  className?: string;
};

export const getScrollToTopBehavior = (): ScrollBehavior => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'smooth';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
};

const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({
  visible,
  label,
  onClick,
  className = '',
}) => (
  <button
    type="button"
    className={`aad-scroll-to-top ${visible ? 'is-visible' : ''} ${className}`.trim()}
    aria-hidden={visible ? undefined : true}
    aria-label={label}
    disabled={!visible}
    onClick={(event) => {
      event.currentTarget.blur();
      onClick();
    }}
    tabIndex={visible ? 0 : -1}
    title={label}
  >
    <ArrowUp size={18} aria-hidden="true" />
  </button>
);

export default ScrollToTopButton;
