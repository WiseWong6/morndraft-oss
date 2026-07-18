export const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
  reader.addEventListener('error', () => reject(reader.error ?? new Error('Failed to read preview image')));
  reader.readAsDataURL(blob);
});
