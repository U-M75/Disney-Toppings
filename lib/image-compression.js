const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.8;
// Keep same-origin multipart requests below Vercel Functions' request-body limit.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

function fileType(file) {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg'].includes(extension)) return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'heif') return 'image/heif';
  return '';
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Your browser could not prepare this photo. Please choose another image.'));
    }, 'image/jpeg', quality);
  });
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        return null;
      }
    }
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    image.src = objectUrl;
  });
}

async function convertHeicToJpeg(file) {
  try {
    const converterModule = await import('heic2any');
    const convert = converterModule.default || converterModule;
    const converted = await convert({ blob: file, toType: 'image/jpeg', quality: JPEG_QUALITY });
    const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
    if (!jpegBlob || typeof jpegBlob.size !== 'number' || jpegBlob.size === 0) throw new Error('empty conversion');
    return new File([jpegBlob], 'topping-photo.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    throw new Error('This HEIC photo could not be converted in this browser. Please choose a JPEG photo instead.');
  }
}

export async function compressImageFile(file) {
  let type = fileType(file);
  if (!ACCEPTED_TYPES.has(type)) {
    throw new Error('Please choose a JPEG, PNG, WebP, or HEIC image.');
  }

  let sourceFile = file;
  let bitmap = await loadBitmap(sourceFile);
  if (!bitmap && (type === 'image/heic' || type === 'image/heif')) {
    sourceFile = await convertHeicToJpeg(file);
    type = 'image/jpeg';
    bitmap = await loadBitmap(sourceFile);
  }

  if (!bitmap) {
    if (sourceFile.size <= MAX_UPLOAD_BYTES && type !== 'image/heic' && type !== 'image/heif') {
      return new File([sourceFile], sourceFile.name || 'topping-photo.jpg', { type, lastModified: Date.now() });
    }
    throw new Error('This photo could not be prepared for upload. Please choose a JPEG, PNG, or WebP photo.');
  }

  const sourceWidth = bitmap.width || bitmap.naturalWidth;
  const sourceHeight = bitmap.height || bitmap.naturalHeight;
  if (!sourceWidth || !sourceHeight) {
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
    throw new Error('This photo could not be read. Please choose another image.');
  }

  let scale = Math.min(1, MAX_LONG_EDGE / Math.max(sourceWidth, sourceHeight));
  let quality = JPEG_QUALITY;
  let compressed;
  try {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Your browser could not prepare this photo. Please try another browser or image.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      compressed = await canvasToJpeg(canvas, quality);
      canvas.width = 0;
      canvas.height = 0;
      if (compressed.size <= MAX_UPLOAD_BYTES) break;

      if (quality > 0.55) quality = Math.max(0.55, quality - 0.1);
      else {
        scale *= 0.85;
        quality = JPEG_QUALITY;
      }
    }
  } finally {
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
  }

  if (!compressed || compressed.size > MAX_UPLOAD_BYTES) {
    throw new Error('This photo could not be compressed small enough. Please choose another photo.');
  }
  return new File([compressed], 'topping-photo.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}
