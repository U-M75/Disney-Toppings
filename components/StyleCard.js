'use client';

import PhotoUploader from './PhotoUploader';

const BIN_NUMBERS = Array.from({ length: 14 }, (_, index) => index + 1);

export default function StyleCard({
  style,
  answer,
  error,
  token,
  requirePhoto,
  testMode = false,
  onBinChange,
  onStatusChange,
  onReplaceForAgeChange,
  onPhotoChange,
  onBagsChange,
  onUploadingChange
}) {
  const binId = `bin-${style.id}`;
  const selectId = `status-${style.id}`;
  const replaceId = `replace-${style.id}`;
  const bagsId = `bags-${style.id}`;
  const errorId = `error-${style.id}`;
  const needsAction = answer.status === 'needed' || Boolean(answer.replaceForAge);

  return (
    <article className={`style-card ${answer.status === 'needed' ? 'style-card-needed' : ''} ${answer.replaceForAge ? 'style-card-replace' : ''}`} data-style-id={style.id}>
      <div className="style-card-heading">
        <div className="style-card-title-wrap">
          <span className="style-number" aria-hidden="true">✦</span>
          <h2>{style.name}</h2>
        </div>
        {style.imageUrl && <img className="style-reference-image" src={style.imageUrl} alt={`${style.name} reference`} loading="lazy" />}
      </div>

      <div className="style-inventory-fields">
        <div className="field">
          <label htmlFor={binId}>Bin <span className="required-word">(required)</span></label>
          <select
            className="form-control"
            id={binId}
            required
            value={answer.bin || ''}
            aria-invalid={!answer.bin && Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => onBinChange(style.id, event.target.value)}
          >
            <option value="">Select bin…</option>
            {BIN_NUMBERS.map((number) => <option key={number} value={String(number)}>Bin {number}</option>)}
          </select>
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
            <option value="needed">Needed</option>
            <option value="not_needed">Not Needed</option>
          </select>
        </div>
      </div>

      <div className="field bags-field">
        <label htmlFor={bagsId}>Bags remaining <span className="required-word">(required)</span></label>
        <input
          className="form-control"
          id={bagsId}
          type="number"
          inputMode="numeric"
          min="0"
          max="9999"
          step="1"
          required
          value={answer.bags ?? ''}
          onChange={(event) => onBagsChange(style.id, event.target.value)}
          placeholder="Enter bag count"
          aria-invalid={Boolean(error) && (answer.bags === '' || answer.bags === null || answer.bags === undefined)}
          aria-describedby={error ? errorId : undefined}
        />
      </div>

      <div className="field replace-age-field">
        <label htmlFor={replaceId}>Replace because it has been displayed too long <span className="required-word">(required)</span></label>
        <select
          className="form-control"
          id={replaceId}
          required
          value={typeof answer.replaceForAge === 'boolean' ? (answer.replaceForAge ? 'yes' : 'no') : ''}
          aria-invalid={typeof answer.replaceForAge !== 'boolean' && Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onReplaceForAgeChange(style.id, event.target.value === 'yes')}
        >
          <option value="">Choose Yes or No…</option>
          <option value="yes">Yes — replace</option>
          <option value="no">No — keep</option>
        </select>
      </div>

      {needsAction && (
        <div className="needed-details">
          <div className="needed-details-heading">
            <span aria-hidden="true">💖</span>
            <strong>{answer.status === 'needed' && answer.replaceForAge ? 'Restock and replace this style' : answer.status === 'needed' ? 'Restock this style' : 'Replace this style'}</strong>
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
        </div>
      )}

      {error && <p className="field-error style-error" id={errorId} role="alert">{error}</p>}
    </article>
  );
}
