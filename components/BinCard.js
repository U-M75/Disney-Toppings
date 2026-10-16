'use client';

import PhotoUploader from './PhotoUploader';

export default function BinCard({
  bin,
  answer,
  error,
  token,
  testMode = false,
  onStatusChange,
  onStyleChange,
  onBagsRemainingChange,
  onAddStyle,
  onRemoveStyle,
  onPhotoChange,
  onUploadingChange
}) {
  const errorId = `error-${bin.id}`;
  const errorMessage = typeof error === 'string' ? error.toLowerCase() : '';
  const styleError = errorMessage.includes('style');
  const bagCountError = errorMessage.includes('bag');
  const restockError = Boolean(error && !styleError && !bagCountError);
  const isNeeded = answer.status === 'needed';
  const styles = Array.isArray(answer.styles) && answer.styles.length
    ? answer.styles
    : [{ name: '', bagsRemaining: '' }];

  return (
    <article
      className={`bin-card ${isNeeded ? 'bin-card-needed' : ''}`}
      data-bin-id={bin.id}
      aria-labelledby={`title-${bin.id}`}
    >
      <div className="bin-card-heading">
        <h2 className="bin-card-title" id={`title-${bin.id}`}>{bin.label}</h2>
        {answer.status && <span className={`bin-state ${isNeeded ? 'bin-state-needed' : 'bin-state-clear'}`}>{isNeeded ? 'Restock' : 'No restock'}</span>}
      </div>

      <div className="style-names-field">
        <div className="style-name-list">
          {styles.map((style, index) => (
            <div className="style-entry-row" key={`${bin.id}-style-${index}`}>
              <div className="style-entry-field style-name-cell">
                <label htmlFor={`style-${bin.id}-${index}`}>Topping/style name <span className="optional-word">(optional)</span></label>
                <input
                  className="form-control style-name-control"
                  id={`style-${bin.id}-${index}`}
                  type="text"
                  value={style.name}
                  maxLength={80}
                  autoComplete="off"
                  placeholder="Style name"
                  aria-label={`${bin.label}, topping/style name ${index + 1}`}
                  aria-invalid={styleError}
                  aria-describedby={styleError ? errorId : undefined}
                  onChange={(event) => onStyleChange(bin.id, index, event.target.value)}
                />
              </div>
              <div className="style-entry-field style-count-cell">
                <label htmlFor={`bags-${bin.id}-${index}`}>Number of bags remaining <span className="required-word">(required if named)</span></label>
                <input
                  className="form-control bag-count-control"
                  id={`bags-${bin.id}-${index}`}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={style.bagsRemaining}
                  placeholder="0"
                  aria-label={`${bin.label}, number of bags remaining for style ${index + 1}`}
                  aria-required={Boolean(style.name.trim())}
                  aria-invalid={bagCountError}
                  aria-describedby={bagCountError ? errorId : undefined}
                  onChange={(event) => onBagsRemainingChange(bin.id, index, event.target.value)}
                />
              </div>
              {styles.length > 1 && (
                <button
                  className="remove-style-button"
                  type="button"
                  aria-label={`Remove style ${index + 1} from ${bin.label}`}
                  onClick={() => onRemoveStyle(bin.id, index)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button className="add-style-button" type="button" onClick={() => onAddStyle(bin.id)} disabled={styles.length >= 20}>
          + Add another style
        </button>
      </div>

      <fieldset className="restock-fieldset" aria-invalid={restockError} aria-describedby={restockError ? errorId : undefined}>
        <legend>Restock Needed?</legend>
        <div className="restock-choice-row" role="group" aria-label={`Restock needed for ${bin.label}`}>
          <button
            className={`button restock-choice restock-choice-yes ${isNeeded ? 'restock-choice-selected' : 'button-outline'}`}
            type="button"
            aria-pressed={isNeeded}
            onClick={() => onStatusChange(bin.id, 'needed')}
          >
            Yes
          </button>
          <button
            className={`button restock-choice restock-choice-no ${answer.status === 'not_needed' ? 'restock-choice-selected' : 'button-outline'}`}
            type="button"
            aria-pressed={answer.status === 'not_needed'}
            onClick={() => onStatusChange(bin.id, 'not_needed')}
          >
            No
          </button>
        </div>
      </fieldset>

      {isNeeded && (
        <div className="needed-details bin-photo-section">
          {testMode ? (
            <p className="test-photo-note">Photo upload is disabled in this temporary test.</p>
          ) : (
            <PhotoUploader
              token={token}
              binId={bin.id}
              binLabel={bin.label}
              photoUrl={answer.photoUrl || ''}
              onChange={(url) => onPhotoChange(bin.id, url)}
              onUploadingChange={onUploadingChange}
            />
          )}
        </div>
      )}

      {error && <p className="field-error bin-error" id={errorId} role="alert">{error}</p>}
    </article>
  );
}
