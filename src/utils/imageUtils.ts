/**
 * Utility to compress image files, Blobs, and Data URLs in the browser.
 * Enforces a strict byte/char budget so uploaded/pasted product photos
 * never exceed Firestore's 1 MiB document limit or localStorage quota.
 */
const DEFAULT_SAFE_MAX_DATAURL_CHARS = 480_000;

export async function compressImageFile(
  file: File,
  maxWidth = 720,
  maxHeight = 960,
  quality = 0.82,
  maxChars = DEFAULT_SAFE_MAX_DATAURL_CHARS
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl || typeof dataUrl !== 'string') {
        reject(new Error('Failed to read image file'));
        return;
      }
      compressDataUrl(dataUrl, maxWidth, maxHeight, quality, maxChars)
        .then(resolve)
        .catch(reject);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

export async function blobToCompressedDataUrl(
  blob: Blob,
  maxWidth = 640,
  maxHeight = 850,
  quality = 0.82,
  maxChars = DEFAULT_SAFE_MAX_DATAURL_CHARS
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl || typeof dataUrl !== 'string') {
        reject(new Error('Failed to read clipboard image'));
        return;
      }
      compressDataUrl(dataUrl, maxWidth, maxHeight, quality, maxChars)
        .then(resolve)
        .catch(reject);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read clipboard image'));
    reader.readAsDataURL(blob);
  });
}

export function compressDataUrl(
  dataUrl: string,
  maxWidth = 720,
  maxHeight = 960,
  quality = 0.82,
  maxChars = DEFAULT_SAFE_MAX_DATAURL_CHARS
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Web URLs or relative asset paths don't need canvas recompression
    if (!dataUrl.startsWith('data:image/')) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        let width = img.width || maxWidth;
        let height = img.height || maxHeight;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }

        const renderAt = (targetW: number, targetH: number, targetQ: number): string => {
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) return dataUrl;

          // Fill dark backdrop first so transparent PNGs convert cleanly to JPEG without artifacts
          ctx.fillStyle = '#0a0f1d';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, targetW, targetH);
          return canvas.toDataURL('image/jpeg', targetQ);
        };

        let result = renderAt(width, height, quality);
        const qualitySteps = [Math.min(quality, 0.72), 0.6, 0.48, 0.36];
        for (const q of qualitySteps) {
          if (result.length <= maxChars) break;
          result = renderAt(width, height, q);
        }

        // If still larger than budget, scale down dimensions progressively
        let scale = 0.75;
        while (result.length > maxChars && scale >= 0.35) {
          const scaledW = Math.max(160, Math.round(width * scale));
          const scaledH = Math.max(160, Math.round(height * scale));
          result = renderAt(scaledW, scaledH, 0.55);
          if (result.length > maxChars) {
            result = renderAt(scaledW, scaledH, 0.38);
          }
          scale -= 0.15;
        }

        if (result.length > 900_000) {
          reject(new Error('Image exceeds maximum cloud sync size (900KB). Please choose a smaller image or use an image URL.'));
          return;
        }

        resolve(result);
      } catch (err) {
        if (dataUrl.length <= 850_000) {
          resolve(dataUrl);
        } else {
          reject(err instanceof Error ? err : new Error('Failed to compress image'));
        }
      }
    };

    img.onerror = () => {
      if (dataUrl.length <= 850_000) {
        resolve(dataUrl);
      } else {
        reject(new Error('Could not decode image for compression and original exceeds 850KB cloud limit.'));
      }
    };

    img.src = dataUrl;
  });
}

