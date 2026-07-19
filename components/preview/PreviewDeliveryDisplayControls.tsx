import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type PreviewDeliveryDisplayOptions = {
  includeA4Pagination: boolean;
  includeCodeChrome: boolean;
  includeArtifactMap: boolean;
};

export const DEFAULT_PREVIEW_DELIVERY_DISPLAY_OPTIONS: PreviewDeliveryDisplayOptions =
  Object.freeze({
    includeA4Pagination: false,
    includeCodeChrome: true,
    includeArtifactMap: true,
  });

const clonePreviewDeliveryDisplayOptions = (
  options: PreviewDeliveryDisplayOptions,
): PreviewDeliveryDisplayOptions => ({
  includeA4Pagination: options.includeA4Pagination,
  includeArtifactMap: options.includeArtifactMap,
  includeCodeChrome: options.includeCodeChrome,
});

export const resolvePreviewDeliveryDisplayOptionsUpdate = (
  currentOptions: PreviewDeliveryDisplayOptions,
  initialOptions: PreviewDeliveryDisplayOptions,
  options: { shouldReset: boolean },
): PreviewDeliveryDisplayOptions => {
  if (options.shouldReset) {
    return clonePreviewDeliveryDisplayOptions(initialOptions);
  }
  if (currentOptions.includeA4Pagination === initialOptions.includeA4Pagination) {
    return currentOptions;
  }
  return {
    ...currentOptions,
    includeA4Pagination: initialOptions.includeA4Pagination,
  };
};

export const usePreviewDeliveryDisplayOptions = (
  initialOptions: PreviewDeliveryDisplayOptions = DEFAULT_PREVIEW_DELIVERY_DISPLAY_OPTIONS,
  resetKey: string = 'default',
) => {
  const {
    includeA4Pagination: initialIncludeA4Pagination,
    includeArtifactMap: initialIncludeArtifactMap,
    includeCodeChrome: initialIncludeCodeChrome,
  } = initialOptions;
  const initialOptionsSnapshot = useMemo(
    () => ({
      includeA4Pagination: initialIncludeA4Pagination,
      includeArtifactMap: initialIncludeArtifactMap,
      includeCodeChrome: initialIncludeCodeChrome,
    }),
    [
      initialIncludeA4Pagination,
      initialIncludeArtifactMap,
      initialIncludeCodeChrome,
    ],
  );
  const [deliveryDisplayOptions, setDeliveryDisplayOptions] = useState<PreviewDeliveryDisplayOptions>(() => (
    clonePreviewDeliveryDisplayOptions(initialOptionsSnapshot)
  ));
  const resetKeyRef = useRef(resetKey);

  useEffect(() => {
    const shouldReset = resetKeyRef.current !== resetKey;
    resetKeyRef.current = resetKey;
    setDeliveryDisplayOptions((options) => resolvePreviewDeliveryDisplayOptionsUpdate(
      options,
      initialOptionsSnapshot,
      { shouldReset },
    ));
  }, [
    initialOptionsSnapshot,
    resetKey,
  ]);

  const toggleDeliveryCodeChrome = useCallback(() => {
    setDeliveryDisplayOptions((options) => ({
      ...options,
      includeCodeChrome: !options.includeCodeChrome,
    }));
  }, []);

  const toggleDeliveryA4Pagination = useCallback(() => {
    setDeliveryDisplayOptions((options) => ({
      ...options,
      includeA4Pagination: !options.includeA4Pagination,
    }));
  }, []);

  return {
    deliveryDisplayOptions,
    toggleDeliveryA4Pagination,
    toggleDeliveryCodeChrome,
  };
};

const DeliveryDisplaySwitch: React.FC<{
  checked: boolean;
  isAuthenticated?: boolean;
  label: string;
  onRequireSignIn?: () => void;
  title: string;
  onToggle: () => void;
}> = ({ checked, isAuthenticated = true, label, onRequireSignIn, title, onToggle }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={title}
    title={title}
    className="aad-delivery-switch"
    onClick={() => {
      if (!isAuthenticated) {
        onRequireSignIn?.();
        return;
      }
      onToggle();
    }}
  >
    <span className="aad-delivery-switch-label">{label}</span>
    <span className="aad-delivery-switch-track" aria-hidden="true">
      <span className="aad-delivery-switch-thumb" />
    </span>
  </button>
);

export const PreviewDeliveryDisplayControls: React.FC<{
  ariaLabel: string;
  a4PaginationChecked: boolean;
  a4PaginationLabel: string;
  a4PaginationTitle: string;
  codeChromeChecked: boolean;
  codeChromeLabel: string;
  codeChromeTitle: string;
  isAuthenticated?: boolean;
  onRequireSignIn?: () => void;
  onToggleA4Pagination: () => void;
  onToggleCodeChrome: () => void;
  showA4PaginationControl?: boolean;
}> = ({
  ariaLabel,
  a4PaginationChecked,
  a4PaginationLabel,
  a4PaginationTitle,
  codeChromeChecked,
  codeChromeLabel,
  codeChromeTitle,
  isAuthenticated,
  onRequireSignIn,
  onToggleA4Pagination,
  onToggleCodeChrome,
  showA4PaginationControl = true,
}) => (
  <div
    className={`aad-delivery-switches ${showA4PaginationControl ? '' : 'is-single-switch'}`.trim()}
    aria-label={ariaLabel}
  >
    {showA4PaginationControl && (
      <DeliveryDisplaySwitch
        checked={a4PaginationChecked}
        isAuthenticated={isAuthenticated}
        label={a4PaginationLabel}
        onRequireSignIn={onRequireSignIn}
        title={a4PaginationTitle}
        onToggle={onToggleA4Pagination}
      />
    )}
    <DeliveryDisplaySwitch
      checked={codeChromeChecked}
      isAuthenticated={isAuthenticated}
      label={codeChromeLabel}
      onRequireSignIn={onRequireSignIn}
      title={codeChromeTitle}
      onToggle={onToggleCodeChrome}
    />
  </div>
);
