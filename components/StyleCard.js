'use client';

import PhotoUploader from './PhotoUploader';

export default function StyleCard({
  style,
  answer,
  error,
  token,
  requirePhoto,
  showBagsField,
  testMode = false,
  onStatusChange,
  onPhotoChange,
  onBagsChange,
  onUploadingChange
}) {
  const selectId = `status-${style.id}`;
  const errorId = `error-${style.id}`;
  return (
    <article className={`style-card ${answer.status === 'needed' ? 'style-card-needed' : ''}`} data-style-id={style.id}>
      <div className="style-card-heading">
        <div className="style-card-title-wrap">
          <span className="style-number" aria-hidden="true">✦</span>
          <h2>{style.name}</h2>
        </div>
        {style.imageUrl && <img className="style-reference-image" src={style.imageUrl} alt={`${style.name} reference`} loading="lazy" />}
      </div>

      <div className="field style-status-field">
        <label htmlFor={selectId}>Status <span className="required-word">(required)</span></label>
        <select
          className="form-control"
          id={selectId}
          required
          value={answer.status}
          aria-invalid={!answer.status && Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onStatusChange(style.id, event.target.value)}
        >
          <option value="">Select…</option>
          <option value="not_needed">Not Needed</option>
          <option value="needed">Needed</option>
        </select>
      </div>

      {answer.status === 'needed' && (
        <div className="needed-details">
          <div className="needed-details-heading">
            <span aria-hidden="true">💖</span>
            <strong>Restock this style</strong>
          </div>
          {testMode ? (
            <div className="field">
              <span className="field-label">Photo <span className="optional-word">(disabled for test)</span></span>
              <p className="test-photo-note">Temporary test mode does not upload photos.</p>
            </div>
          ) : (
            <div className="field">
              <span className="field-label">Photo {requirePhoto ? <span className="required-word">(required)</span> : <span className="optional-word">(optional)</span>}</span>
              <PhotoUploader
                token={token}
                styleId={style.id}
                styleName={style.name}
                photoUrl={answer.photoUrl || ''}
                required={requirePhoto}
                onChange={(url) => onPhotoChange(style.id, url)}
                onUploadingChange={onUploadingChange}
              />
            </div>
          )}
          {showBagsField && (
            <div className="field bags-field">
              <label htmlFor={`bags-${style.id}`}>Bags remaining <span className="optional-word">(optional)</span></label>
              <input
                className="form-control"
                id={`bags-${style.id}`}
                type="number"
                inputMode="numeric"
                min="0"
                max="9999"
                step="1"
                value={answer.bags || ''}
                onChange={(event) => onBagsChange(style.id, event.target.value)}
                placeholder="e.g. 2"
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="field-error style-error" id={errorId} role="alert">{error}</p>}
    </article>
  );
}
