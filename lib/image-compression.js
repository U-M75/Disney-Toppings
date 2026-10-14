const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.8;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

function fileType(file) {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg'].includes(extension)) return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  return '';
}

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Your browser could not prepare this photo. Please choose another image.'));
    }, 'image/jpeg', JPEG_QUALITY);
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

export async function compressImageFile(file) {
  const type = fileType(file);
  if (!ACCEPTED_TYPES.has(type)) {
    throw new Error('Please choose a JPEG, PNG, WebP, or HEIC image.');
  }

  const bitmap = await loadBitmap(file);
  if (!bitmap) {
    if (file.size <= MAX_UPLOAD_BYTES) {
      return new File([file], file.name || 'topping-photo.heic', { type });
    }
    throw new Error('This photo format could not be compressed in this browser. Choose a JPEG/PNG/WebP photo under 5 MB.');
  }

  const sourceWidth = bitmap.width || bitmap.naturalWidth;
  const sourceHeight = bitmap.height || bitmap.naturalHeight;
  if (!sourceWidth || !sourceHeight) {
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
    throw new Error('This photo could not be read. Please choose another image.');
  }

  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
    throw new Error('Your browser could not prepare this photo. Please try another browser or image.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  const compressed = await canvasToJpeg(canvas);
  canvas.width = 0;
  canvas.height = 0;
  if (compressed.size > MAX_UPLOAD_BYTES) {
    throw new Error('This photo is still larger than 5 MB after compression. Choose a smaller image.');
  }
  return new File([compressed], 'topping-photo.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}
