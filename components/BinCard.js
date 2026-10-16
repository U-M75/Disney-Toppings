'use client';

import PhotoUploader from './PhotoUploader';

export default function BinCard({
  bin,
  answer,
  error,
  token,
  testMode = false,
  onStatusChange,
  onPhotoChange,
  onUploadingChange
}) {
  const errorId = `error-${bin.id}`;
  const isNeeded = answer.status === 'needed';

  return (
    <article
      className={`bin-card ${isNeeded ? 'bin-card-needed' : ''}`}
      data-bin-id={bin.id}
      aria-labelledby={`title-${bin.id}`}
    >
      <div className="bin-card-heading">
        <h2 className="bin-card-title" id={`title-${bin.id}`}>{bin.label}</h2>
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
