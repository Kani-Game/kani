/**
 * Utility to compress image files and Data URLs in the browser.
 * This prevents localStorage / IndexedDB QuotaExceededError when uploading
 * single or multiple high-resolution game posters on Netlify or Google AI.
 */
export async function compressImageFile(
  file: File,
  maxWidth = 720,
  maxHeight = 960,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      compressDataUrl(dataUrl, maxWidth, maxHeight, quality)
        .then(resolve)
        .catch(() => resolve(dataUrl)); // fallback to original if canvas fails
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function compressDataUrl(
  dataUrl: string,
  maxWidth = 720,
  maxHeight = 960,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve) => {
    // If it's already a web URL or placeholder, don't re-compress
    if (!dataUrl.startsWith('data:image/')) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      // Smooth resizing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to JPEG with balanced compression
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}
