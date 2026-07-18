import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

type AiImeSafeTextAreaProps = {
  ariaLabel: string;
  autoFocus?: boolean;
  cancelClassName?: string;
  cancelContent?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onCancel?: () => void;
  onSubmit: (value: string) => void;
  onValueChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  submitClassName: string;
  submitContent: React.ReactNode;
  value: string;
};

const isKeyboardComposing = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
  const nativeEvent = event.nativeEvent as KeyboardEvent & {
    isComposing?: boolean;
    keyCode?: number;
  };
  return Boolean(nativeEvent.isComposing) || nativeEvent.keyCode === 229;
};

export const resizeAiTextAreaToContent = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const scrollHeight = textarea.scrollHeight;
  const maxHeightValue = typeof window === 'undefined'
    ? ''
    : window.getComputedStyle(textarea).maxHeight;
  const maxHeight = Number.parseFloat(maxHeightValue);
  const hasMaxHeight = Number.isFinite(maxHeight) && maxHeight > 0;
  textarea.style.height = `${hasMaxHeight ? Math.min(scrollHeight, maxHeight) : scrollHeight}px`;
  textarea.style.overflowY = hasMaxHeight && scrollHeight > maxHeight ? 'auto' : 'hidden';
};

export const AiImeSafeTextArea: React.FC<AiImeSafeTextAreaProps> = ({
  ariaLabel,
  autoFocus = false,
  cancelClassName,
  cancelContent,
  className = 'aad-preview-ai-follow-up-input',
  disabled = false,
  onCancel,
  onSubmit,
  onValueChange,
  placeholder,
  rows = 2,
  submitClassName,
  submitContent,
  value,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composingRef = useRef(false);
  const didAutoFocusRef = useRef(false);
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    if (composingRef.current) return;
    setDraftValue(value);
  }, [value]);

  useLayoutEffect(() => {
    resizeAiTextAreaToContent(textareaRef.current);
  }, [draftValue]);

  useLayoutEffect(() => {
    if (!autoFocus || disabled || didAutoFocusRef.current) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    didAutoFocusRef.current = true;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [autoFocus, disabled]);

  const flushValue = (nextValue: string) => {
    setDraftValue(nextValue);
    onValueChange(nextValue);
    return nextValue;
  };

  const submitCurrentValue = () => {
    if (disabled || composingRef.current) return;
    const nextValue = flushValue(textareaRef.current?.value ?? draftValue);
    onSubmit(nextValue);
  };

  return (
    <div className="aad-preview-ai-follow-up-form">
      <textarea
        ref={textareaRef}
        className={className}
        value={draftValue}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={rows}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          setDraftValue(nextValue);
          if (!composingRef.current) onValueChange(nextValue);
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          flushValue(event.currentTarget.value);
        }}
        onBlur={(event) => {
          composingRef.current = false;
          flushValue(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape' && onCancel) {
            event.preventDefault();
            onCancel();
            return;
          }
          if (
            isKeyboardComposing(event) ||
            event.key !== 'Enter' ||
            event.shiftKey ||
            (!event.metaKey && !event.ctrlKey) ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          submitCurrentValue();
        }}
      />
      <div className="aad-preview-ai-follow-up-actions">
        <button
          type="button"
          className={submitClassName}
          disabled={disabled}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            submitCurrentValue();
          }}
        >
          {submitContent}
        </button>
        {onCancel && cancelContent ? (
          <button
            type="button"
            className={cancelClassName ?? submitClassName}
            disabled={disabled}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onCancel();
            }}
          >
            {cancelContent}
          </button>
        ) : null}
      </div>
    </div>
  );
};
