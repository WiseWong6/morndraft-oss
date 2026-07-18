export type HtmlPreviewLayoutContract = {
  deliveryWidth?: number;
};

export const normalizePreviewDeliveryWidth = (value: unknown) => {
  const width = Number(value);
  if (!Number.isFinite(width) || width <= 0) return undefined;
  return Math.ceil(width);
};
