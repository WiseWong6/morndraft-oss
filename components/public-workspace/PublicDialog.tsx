import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type PublicDialogProps = {
  children: React.ReactNode;
  className?: string;
  isOpen: boolean;
  labelledBy: string;
  onClose(): void;
};

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const listPublicDialogFocusableElements = (dialog: HTMLElement) => (
  Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
);

export const handlePublicDialogTabKey = (event: KeyboardEvent, dialog: HTMLElement) => {
  const focusable = listPublicDialogFocusableElements(dialog);
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

export const PublicDialog: React.FC<PublicDialogProps> = ({ children, className = '', isOpen, labelledBy, onClose }) => {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const workspace = opener?.closest<HTMLElement>('[data-public-workspace="true"]')
      ?? document.querySelector<HTMLElement>('[data-public-workspace="true"]');
    const previousAriaHidden = workspace?.getAttribute('aria-hidden') ?? null;
    const previousInert = workspace?.inert ?? false;
    if (workspace) {
      workspace.inert = true;
      workspace.setAttribute('aria-hidden', 'true');
    }

    const focusTarget = dialog?.querySelector<HTMLElement>('[data-public-dialog-initial-focus]')
      ?? (dialog ? listPublicDialogFocusableElements(dialog)[0] : null)
      ?? dialog;
    focusTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Tab' && dialog) {
        handlePublicDialogTabKey(event, dialog);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (workspace) {
        workspace.inert = previousInert;
        if (previousAriaHidden === null) workspace.removeAttribute('aria-hidden');
        else workspace.setAttribute('aria-hidden', previousAriaHidden);
      }
      const openerDetails = opener?.closest<HTMLDetailsElement>('details');
      const returnTarget = openerDetails && !openerDetails.open
        ? openerDetails.querySelector<HTMLElement>('summary')
        : opener;
      returnTarget?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;
  return createPortal(
    <div className="md-public-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={`md-public-dialog ${className}`.trim()}
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
