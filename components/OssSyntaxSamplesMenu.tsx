import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ChevronDown } from 'lucide-react';
import type { Locale, SampleEntry, SampleKey } from '../i18n';

type OssSyntaxSamplesMenuProps = {
  locale: Locale;
  onLoadSample: (key: SampleKey) => void;
  sampleEntries: readonly SampleEntry[];
  buttonLabel?: string;
};

type SamplesMenuPosition = {
  left: number;
  maxWidth: number;
  top: number;
};

const SAMPLES_MENU_SIDE_MARGIN_PX = 8;

const getLabels = (locale: Locale) => ({
  syntaxSamples: locale === 'zh' ? '语法' : 'Syntax',
});

const readButtonPaddingPx = (button: HTMLButtonElement) => {
  if (typeof window === 'undefined') return 0;
  const parsed = Number.parseFloat(window.getComputedStyle(button).paddingLeft);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const OssSyntaxSamplesMenu: React.FC<OssSyntaxSamplesMenuProps> = ({
  locale,
  onLoadSample,
  sampleEntries,
  buttonLabel,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuLayerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<SamplesMenuPosition | null>(null);
  const labels = getLabels(locale);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setMenuPosition(null);
  }, []);

  const getMenuPosition = useCallback((): SamplesMenuPosition | null => {
    if (typeof window === 'undefined') return null;
    const button = buttonRef.current;
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    const left = Math.max(
      SAMPLES_MENU_SIDE_MARGIN_PX,
      Math.round(rect.left + readButtonPaddingPx(button)),
    );
    return {
      left,
      maxWidth: Math.max(1, Math.round(window.innerWidth - left - SAMPLES_MENU_SIDE_MARGIN_PX)),
      top: Math.round(rect.bottom),
    };
  }, []);

  const updateMenuPosition = useCallback(() => {
    if (!isOpen) return;
    setMenuPosition(getMenuPosition());
  }, [getMenuPosition, isOpen]);

  const toggleMenu = useCallback(() => {
    if (isOpen) {
      closeMenu();
      return;
    }
    setMenuPosition(getMenuPosition());
    setIsOpen(true);
  }, [closeMenu, getMenuPosition, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapperRef.current?.contains(target)) return;
      if (menuLayerRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen, updateMenuPosition]);

  const renderSamplesMenu = () => {
    if (!isOpen || !menuPosition || typeof document === 'undefined') return null;
    const style: React.CSSProperties = {
      left: menuPosition.left,
      maxWidth: menuPosition.maxWidth,
      position: 'fixed',
      top: menuPosition.top,
      zIndex: 70,
    };
    return createPortal(
      <div
        ref={menuLayerRef}
        className="aad-toolbar-menu aad-preview-toolbar-menu-portal aad-oss-syntax-samples-menu"
        role="menu"
        aria-label={labels.syntaxSamples}
        style={style}
        data-oss-syntax-samples-menu-layer="top"
      >
        {sampleEntries.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className="aad-toolbar-menu-item aad-oss-syntax-sample-option"
            role="menuitem"
            onClick={() => {
              closeMenu();
              onLoadSample(key);
            }}
          >
            <span>{label}</span>
          </button>
        ))}
      </div>,
      document.body,
    );
  };

  return (
    <div className="aad-toolbar-menu-wrapper aad-oss-syntax-samples-menu-wrapper" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className="aad-action-button aad-preview-syntax-samples-button"
        title={labels.syntaxSamples}
        aria-label={labels.syntaxSamples}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={toggleMenu}
      >
        <BookOpen size={14} aria-hidden="true" />
        <span>{buttonLabel ?? labels.syntaxSamples}</span>
        <ChevronDown size={12} className="aad-action-chevron" />
      </button>
      {renderSamplesMenu()}
    </div>
  );
};
