'use client';

import { useEffect, useRef, useState } from 'react';
import { compressImageFile } from '../lib/image-compression';
import ProgressBar from './ProgressBar';

async function deleteUploadedPhoto(token, url) {
  if (!url) return;
  try {
    await fetch('/api/upload/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, url }),
      keepalive: true
    });
  } catch {
    // Cleanup is best effort; submission validation still prevents using untrusted URLs.
  }
}

function uploadThroughApp(file, token, styleId, onProgress) {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append('clientPayload', token);
    body.append('styleId', styleId);
    body.append('file', file, file.name || 'topping-photo.jpg');

    const request = new XMLHttpRequest();
    request.open('POST', '/api/upload');
    request.timeout = 120000;
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    });
    request.addEventListener('load', () => {
      let data = {};
      try {
        data = JSON.parse(request.responseText || '{}');
      } catch {
        // A non-JSON response is reported with a safe generic message below.
      }
      if (request.status >= 200 && request.status < 300 && typeof data.url === 'string') {
        resolve(data);
      } else {
        reject(new Error(data.error || 'The photo could not be uploaded. Please try again.'));
      }
    });
    request.addEventListener('error', () => reject(new Error('The connection interrupted the photo upload. Check the connection and try again.')));
    request.addEventListener('timeout', () => reject(new Error('The photo upload took too long. Please try again.')));
    request.send(body);
  });
}

export default function PhotoUploader({ token, styleId, styleName, photoUrl, onChange, onUploadingChange, required }) {
  const cameraInput = useRef(null);
  const libraryInput = useRef(null);
  const alive = useRef(true);
  const uploadingCallback = useRef(onUploadingChange);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    uploadingCallback.current = onUploadingChange;
  }, [onUploadingChange]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      uploadingCallback.current?.(styleId, false);
    };
  }, [styleId]);

  async function onFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError('');
    setProgress(0);
    setIsPreparing(true);
    try {
      const compressedFile = await compressImageFile(file);
      if (!alive.current) return;
      setIsPreparing(false);
      setIsUploading(true);
      uploadingCallback.current?.(styleId, true);
      const result = await uploadThroughApp(compressedFile, token, styleId, (percentage) => {
        if (alive.current) setProgress(percentage);
      });

      if (!alive.current) {
        await deleteUploadedPhoto(token, result.url);
        return;
      }
      if (photoUrl && photoUrl !== result.url) void deleteUploadedPhoto(token, photoUrl);
      onChange(result.url);
      setProgress(100);
    } catch (uploadError) {
      if (alive.current) {
        setError(uploadError instanceof Error ? uploadError.message : 'The photo could not be uploaded. Please try again.');
      }
    } finally {
      if (alive.current) {
        setIsPreparing(false);
        setIsUploading(false);
        uploadingCallback.current?.(styleId, false);
      }
    }
  }

  function removePhoto() {
    if (photoUrl) void deleteUploadedPhoto(token, photoUrl);
    onChange('');
    setError('');
    setProgress(0);
  }

  const busy = isPreparing || isUploading;
  return (
    <div className="photo-uploader">
      <div className="photo-picker-actions">
        <button
          className="button button-secondary photo-action"
          type="button"
          onClick={() => cameraInput.current?.click()}
          disabled={busy}
        >
          📷 {photoUrl ? 'Retake photo' : 'Take photo'}
        </button>
        <button
          className="button button-secondary photo-action"
          type="button"
          onClick={() => libraryInput.current?.click()}
          disabled={busy}
        >
          🖼️ Choose from library
        </button>
        <input
          ref={cameraInput}
          className="visually-hidden-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFileSelected}
          aria-label={`Take a photo for ${styleName}`}
          tabIndex={-1}
        />
        <input
          ref={libraryInput}
          className="visually-hidden-input"
          type="file"
          accept="image/*"
          onChange={onFileSelected}
          aria-label={`Choose a photo for ${styleName}`}
          tabIndex={-1}
        />
      </div>

      {busy && (
        <div className="upload-status" aria-live="polite">
          <span>{isPreparing ? 'Preparing your photo…' : `Uploading photo… ${progress}%`}</span>
          <ProgressBar value={isPreparing ? 0 : progress} max={100} label="Photo upload progress" />
        </div>
      )}

      {photoUrl && !busy && (
        <div className="photo-preview-row">
          <img className="photo-preview" src={photoUrl} alt={`Uploaded photo for ${styleName}`} />
          <div className="photo-preview-copy">
            <span className="photo-ready">✓ Photo attached</span>
            <button className="text-button remove-photo" type="button" onClick={removePhoto}>
              Remove photo
            </button>
          </div>
        </div>
      )}

      <p className="photo-help">{required ? 'A photo is required for a style marked Needed or Replace.' : 'A photo is optional for this style.'} Images are compressed before upload.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
