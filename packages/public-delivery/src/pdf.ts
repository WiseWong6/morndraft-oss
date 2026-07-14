import { capturePublicPreviewPng } from './capture';
import { buildImagePdfBlob } from './imagePdf';
import {
  PublicDeliveryError,
  type PublicDeliveryInput,
  type PublicPngCapture,
} from './types';

const isPngCapture = (input: PublicDeliveryInput | PublicPngCapture): input is PublicPngCapture =>
  'blob' in input && 'scale' in input && !('previewRoot' in input);

export const buildPublicPreviewPdf = async (
  input: PublicDeliveryInput | PublicPngCapture,
): Promise<Blob> => {
  const capture = isPngCapture(input) ? input : await capturePublicPreviewPng(input);
  if (!isPngCapture(input)) input.assertCurrent?.();
  if (capture.blob.type && capture.blob.type !== 'image/png') {
    throw new PublicDeliveryError('invalid-png', 'PDF 只能使用 PNG 预览图片生成。');
  }

  try {
    // The capture contract reports CSS dimensions plus its fixed scale. Keep
    // that aspect ratio authoritative so PDF pagination matches the preview,
    // even if a browser rewrites PNG density metadata while encoding.
    const blob = await buildImagePdfBlob({
      blob: capture.blob,
      height: capture.height,
      pixelHeight: capture.height * capture.scale,
      pixelWidth: capture.width * capture.scale,
      width: capture.width,
    }, {
      signal: isPngCapture(input) ? undefined : input.signal,
    });
    if (!isPngCapture(input)) input.assertCurrent?.();
    return blob;
  } catch (error) {
    if (error instanceof PublicDeliveryError) throw error;
    throw new PublicDeliveryError('invalid-png', 'PDF 生成失败，请重新生成图片后重试。', { cause: error });
  }
};
