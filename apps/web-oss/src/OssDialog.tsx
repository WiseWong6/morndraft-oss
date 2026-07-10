import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  children: React.ReactNode;
  className?: string;
  isOpen: boolean;
  labelledBy: string;
  onClose: () => void;
};

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const listOssDialogFocusableElements = (dialog: HTMLElement) => (
  Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
);

export const handleOssDialogTabKey = (event: KeyboardEvent, dialog: HTMLElement) => {
  const focusable = listOssDialogFocusableElements(dialog);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault();
    first.focus();
  }
};

export const OssDialog: React.FC<Props> = ({ children, className = '', isOpen, labelledBy, onClose }) => {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const dialog = dialogRef.current;
    const shell = document.querySelector<HTMLElement>('[data-oss-shell="public"]');
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousAriaHidden = shell?.getAttribute('aria-hidden') ?? null;
    const previousInert = shell?.inert ?? false;
    if (shell) {
      shell.inert = true;
      shell.setAttribute('aria-hidden', 'true');
    }

    const focusTarget = dialog?.querySelector<HTMLElement>('[data-oss-dialog-initial-focus]')
      ?? (dialog ? listOssDialogFocusableElements(dialog)[0] : null)
      ?? dialog;
    focusTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Tab' && dialog) {
        handleOssDialogTabKey(event, dialog);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (shell) {
        shell.inert = previousInert;
        if (previousAriaHidden === null) shell.removeAttribute('aria-hidden');
        else shell.setAttribute('aria-hidden', previousAriaHidden);
      }
      opener?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;
  return createPortal(
    <div className="oss-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={`oss-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
};
