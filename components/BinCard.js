'use client';

import PhotoUploader from './PhotoUploader';

export default function BinCard({
  bin,
  answer,
  error,
  token,
  testMode = false,
  onStatusChange,
  onStyleNameChange,
  onAddStyleName,
  onRemoveStyleName,
  onPhotoChange,
  onUploadingChange
}) {
  const errorId = `error-${bin.id}`;
  const isNeeded = answer.status === 'needed';
  const styleNames = Array.isArray(answer.styleNames) && answer.styleNames.length ? answer.styleNames : [''];

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
        <label className="field-label" htmlFor={`style-${bin.id}-0`}>Topping/style name <span className="optional-word">(optional)</span></label>
        <div className="style-name-list">
          {styleNames.map((name, index) => (
            <div className="style-name-row" key={`${bin.id}-style-${index}`}>
              <input
                className="form-control style-name-control"
                id={`style-${bin.id}-${index}`}
                type="text"
                value={name}
                maxLength={80}
                autoComplete="off"
                placeholder="Add a style name"
                aria-label={`${bin.label}, topping/style name ${index + 1}`}
                onChange={(event) => onStyleNameChange(bin.id, index, event.target.value)}
              />
              {styleNames.length > 1 && (
                <button
                  className="remove-style-button"
                  type="button"
                  aria-label={`Remove style name ${index + 1} from ${bin.label}`}
                  onClick={() => onRemoveStyleName(bin.id, index)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button className="add-style-button" type="button" onClick={() => onAddStyleName(bin.id)} disabled={styleNames.length >= 20}>
          + Add another style
        </button>
      </div>

      <fieldset className="restock-fieldset" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}>
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
