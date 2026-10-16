'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import BinCard from './BinCard';
import ProgressBar from './ProgressBar';

function emptyAnswers(bins) {
  return Object.fromEntries(bins.map((bin) => [bin.id, { status: '', photoUrl: '' }]));
}

function isCompleteAnswer(answer, testMode) {
  if (!answer?.status) return false;
  return testMode || answer.status !== 'needed' || Boolean(answer.photoUrl);
}

function deletePhotoBestEffort(token, url) {
  if (!url) return;
  fetch('/api/upload/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, url }),
    keepalive: true
  }).catch(() => {});
}

export default function ToppingForm({
  token,
  cycleLabel,
  bins,
  locations,
  todayLabel,
  existingSubmission,
  testMode = false
}) {
  const draftKey = useMemo(() => `ksc-topping-update:draft:${token}`, [token]);
  const [form, setForm] = useState(() => ({
    name: '',
    location: locations.includes('Disney CA') ? 'Disney CA' : locations[0],
    answers: emptyAnswers(bins)
  }));
  const [hydrated, setHydrated] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(null);
  const nameInput = useRef(null);
  const locationSelect = useRef(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) {
        const draft = JSON.parse(saved);
        const answers = emptyAnswers(bins);
        for (const bin of bins) {
          const savedAnswer = draft?.answers?.[bin.id];
          if (savedAnswer && ['', 'needed', 'not_needed'].includes(savedAnswer.status)) {
            answers[bin.id] = {
              status: savedAnswer.status,
              photoUrl: typeof savedAnswer.photoUrl === 'string' ? savedAnswer.photoUrl : ''
            };
          }
        }
        setForm({
          name: typeof draft?.name === 'string' ? draft.name.slice(0, 80) : '',
          location: locations.includes(draft?.location) ? draft.location : (locations.includes('Disney CA') ? 'Disney CA' : locations[0]),
          answers
        });
        setDirty(true);
      }
    } catch {
      // A disabled or full localStorage must never block the form.
    } finally {
      setHydrated(true);
    }
  }, [draftKey, locations, bins]);

  useEffect(() => {
    if (!hydrated || !dirty || success) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(form));
    } catch {
      // Draft saving is best effort on devices with restricted storage.
    }
  }, [draftKey, form, hydrated, dirty, success]);

  useEffect(() => {
    if (!dirty || success || isSubmitting) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty, success, isSubmitting]);

  const answeredCount = bins.reduce((count, bin) => count + (isCompleteAnswer(form.answers[bin.id], testMode) ? 1 : 0), 0);
  const neededCount = bins.reduce((count, bin) => count + (form.answers[bin.id]?.status === 'needed' ? 1 : 0), 0);
  const isUploading = Object.values(uploading).some(Boolean);

  function updateForm(patcher) {
    setForm((current) => typeof patcher === 'function' ? patcher(current) : { ...current, ...patcher });
    setDirty(true);
  }

  function clearBinError(binId) {
    setErrors((current) => {
      const next = { ...current, [binId]: undefined };
      delete next.answers;
      return next;
    });
    setSubmitError('');
  }

  function onStatusChange(binId, status) {
    const previous = form.answers[binId];
    if (status === 'not_needed' && previous?.photoUrl) deletePhotoBestEffort(token, previous.photoUrl);
    updateForm((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [binId]: {
          ...current.answers[binId],
          status,
          ...(status === 'not_needed' ? { photoUrl: '' } : {})
        }
      }
    }));
    clearBinError(binId);
  }

  function onPhotoChange(binId, photoUrl) {
    updateForm((current) => ({
      ...current,
      answers: { ...current.answers, [binId]: { ...current.answers[binId], photoUrl } }
    }));
    if (photoUrl) setErrors((current) => ({ ...current, [binId]: undefined }));
    setSubmitError('');
  }

  function onUploadingChange(binId, value) {
    setUploading((current) => ({ ...current, [binId]: value }));
  }

  function scrollToFirstError(fieldErrors) {
    const firstBin = bins.find((bin) => fieldErrors[bin.id]);
    if (firstBin) {
      const card = document.querySelector(`[data-bin-id="${firstBin.id}"]`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card?.querySelector('.restock-choice')?.focus({ preventScroll: true });
      return;
    }
    if (fieldErrors.name) {
      nameInput.current?.focus();
      nameInput.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (fieldErrors.location) {
      locationSelect.current?.focus();
      locationSelect.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting || isUploading) return;

    const fieldErrors = {};
    const name = form.name.trim().replace(/\s+/g, ' ');
    if (!name) fieldErrors.name = 'Enter your name.';
    else if (name.length > 80) fieldErrors.name = 'Use 80 characters or fewer for your name.';
    if (!locations.includes(form.location)) fieldErrors.location = 'Choose one of the listed locations.';

    for (const bin of bins) {
      const answer = form.answers[bin.id] || { status: '', photoUrl: '' };
      if (!['needed', 'not_needed'].includes(answer.status)) {
        fieldErrors[bin.id] = 'Tap Yes or No for this bin.';
        continue;
      }
      if (answer.status === 'needed' && !testMode && !answer.photoUrl) {
        fieldErrors[bin.id] = 'Upload a photo for every bin marked Yes.';
      } else if (answer.status === 'not_needed' && answer.photoUrl) {
        fieldErrors[bin.id] = 'Remove the photo or mark this bin Yes.';
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      setSubmitError('Answer Yes or No for each bin and upload a photo for every Yes.');
      scrollToFirstError(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitError('');
    setIsSubmitting(true);
    const answers = bins.map((bin) => {
      const answer = form.answers[bin.id];
      return {
        bin: bin.number,
        status: answer.status,
        ...(answer.status === 'needed' && answer.photoUrl ? { photoUrl: answer.photoUrl } : {})
      };
    });

    try {
      const response = await fetch(testMode ? '/api/test/submit' : '/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, location: form.location, answers })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        const returnedErrors = data.fieldErrors && typeof data.fieldErrors === 'object' ? data.fieldErrors : {};
        setErrors(returnedErrors);
        setSubmitError(data.error || 'Your update could not be submitted. Please try again.');
        scrollToFirstError(returnedErrors);
        return;
      }
      setSuccess(data);
      setDirty(false);
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // The submitted update is already saved on the server.
      }
    } catch {
      setSubmitError('We could not reach the server. Your draft is still saved on this device; please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    const summary = success.summary || {};
    const neededBins = summary.neededBins || [];
    const slack = success.slack || {};
    return (
      <main className="form-shell">
        <div className="brand-row">
          <img className="brand-logo" src="/ksc-logo.svg" alt="KSC" />
          <span className="brand-caption">Kawaii Slime Company · Kiosk Update</span>
        </div>
        <section className="success-card" role="status" aria-live="polite">
          <div className="success-sparkles" aria-hidden="true">✨ 💖</div>
          <p className="eyebrow">{testMode ? 'Temporary test complete' : success.updated ? 'Submission updated' : 'Update submitted'}</p>
          <h1>{testMode ? 'Slack test delivered' : success.updated ? 'Your update was updated' : 'Your update was submitted'}</h1>
          <p className="success-intro">{testMode
            ? `Thanks, ${form.name.trim() || 'team member'}! Your test answers were sent to Slack but were not saved.`
            : `Thanks, ${form.name.trim() || 'team member'}! Your end-of-day bin check has been saved.`}</p>
          <div className="summary-pills">
            <span className="summary-pill needed-pill">{summary.neededCount || 0} Need Restock</span>
            <span className="summary-pill">{summary.notNeededCount ?? (bins.length - (summary.neededCount || 0))} No Restock</span>
          </div>
          <div className="success-list-wrap">
            <h2>Bins to restock</h2>
            {neededBins.length ? (
              <ul className="success-list">
                {neededBins.map((number) => <li key={number}>Bin {number}</li>)}
              </ul>
            ) : <p className="nothing-needed">No bins were marked for restock.</p>}
          </div>
          <p className="submitted-at">Submitted {summary.submittedAtLabel ? `at ${summary.submittedAtLabel}` : 'successfully'}.</p>
          {slack.status === 'failed' && <p className="delivery-warning" role="alert">{slack.error || 'Saved successfully, but Slack could not be notified. Please tell your manager.'}</p>}
          {slack.warning && <p className="delivery-warning" role="status">{slack.warning}</p>}
          {slack.status === 'posted' && !slack.warning && <p className="delivery-success">{testMode ? 'The test response was posted in the Slack test thread. No database record was created.' : 'Your update has been shared with the restock team. Thank you!'}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="form-shell">
      <div className="brand-row">
        <img className="brand-logo" src="/ksc-logo.svg" alt="KSC" />
        <span className="brand-caption">Kawaii Slime Company · Kiosk Update</span>
      </div>

      <header className="form-hero">
        <div className="hero-decoration hero-heart" aria-hidden="true">♡</div>
        <div className="hero-decoration hero-sparkle" aria-hidden="true">✦</div>
        <p className="eyebrow">{testMode ? 'Temporary test — not saved' : cycleLabel}</p>
        <h1>Topping Update</h1>
        <p>{testMode ? 'Test the quick bin check and Slack reply. Responses are not saved and photos are disabled.' : 'Quick end-of-day check: tap Yes or No for each bin. Upload a photo for every Yes.'}</p>
        <span className="hero-badge">{testMode ? 'Test only · no database save' : 'End-of-day bin check'}</span>
      </header>

      {testMode && (
        <div className="test-mode-notice" role="note">
          <span aria-hidden="true">🧪</span>
          <p><strong>Temporary test only.</strong> Submitting posts a clearly labeled reply to Slack; nothing is saved to the database. Photo uploads are disabled.</p>
        </div>
      )}

      {existingSubmission && (
        <div className="already-submitted" role="note">
          <span aria-hidden="true">💌</span>
          <p><strong>Already submitted by {existingSubmission.name} at {existingSubmission.submittedAtLabel}.</strong> Submitting again will post an updated version.</p>
        </div>
      )}

      <form className="topping-form" onSubmit={handleSubmit} noValidate>
        <section className="form-intro-card" aria-labelledby="details-title">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Team member details</p>
              <h2 id="details-title">Who checked the cart?</h2>
            </div>
            <span className="section-heart" aria-hidden="true">♡</span>
          </div>
          <div className="top-fields-grid">
            <div className="field">
              <label htmlFor="employee-name">Employee name <span className="required-word">(required)</span></label>
              <input
                ref={nameInput}
                className="form-control"
                id="employee-name"
                name="employeeName"
                type="text"
                required
                autoComplete="name"
                maxLength={80}
                value={form.name}
                onChange={(event) => {
                  updateForm({ name: event.target.value });
                  setErrors((current) => ({ ...current, name: undefined }));
                  setSubmitError('');
                }}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'employee-name-error' : undefined}
                placeholder="Your name"
              />
              {errors.name && <p className="field-error" id="employee-name-error" role="alert">{errors.name}</p>}
            </div>
            <div className="field">
              <label htmlFor="location">Location <span className="required-word">(required)</span></label>
              <select
                ref={locationSelect}
                className="form-control"
                id="location"
                name="location"
                required
                value={form.location}
                onChange={(event) => {
                  updateForm({ location: event.target.value });
                  setErrors((current) => ({ ...current, location: undefined }));
                  setSubmitError('');
                }}
                aria-invalid={Boolean(errors.location)}
                aria-describedby={errors.location ? 'location-error' : undefined}
              >
                {locations.map((location) => <option key={location} value={location}>{location}</option>)}
              </select>
              {errors.location && <p className="field-error" id="location-error" role="alert">{errors.location}</p>}
            </div>
            <div className="field date-field">
              <label htmlFor="check-date">Date <span className="optional-word">(Pacific time)</span></label>
              <input className="form-control" id="check-date" type="text" value={todayLabel} readOnly aria-readonly="true" />
            </div>
          </div>
        </section>

        <section className="bins-section" aria-labelledby="bins-title">
          <div className="section-heading-row bin-section-heading">
            <div>
              <p className="eyebrow">Cart inventory</p>
              <h2 id="bins-title">Check bins 1–28</h2>
              <p className="section-help">Tap Yes if the bin needs restocking, otherwise tap No. Add a photo for every Yes.</p>
            </div>
            <span className="section-heart" aria-hidden="true">✧</span>
          </div>
          {errors.answers && <p className="field-error form-level-error" role="alert">{errors.answers}</p>}
          <div className="bin-grid">
            {bins.map((bin) => (
              <BinCard
                key={bin.id}
                bin={bin}
                answer={form.answers[bin.id] || { status: '', photoUrl: '' }}
                error={errors[bin.id] || ''}
                token={token}
                testMode={testMode}
                onStatusChange={onStatusChange}
                onPhotoChange={onPhotoChange}
                onUploadingChange={onUploadingChange}
              />
            ))}
          </div>
        </section>

        <div className="form-end-spacer" aria-hidden="true" />
        <div className="sticky-submit-wrap">
          <div className="sticky-submit-inner">
            <div className="sticky-progress-copy">
              <div className="progress-copy-row">
                <span className="progress-summary" aria-live="polite" aria-atomic="true">{answeredCount} / {bins.length} bins complete · {neededCount} need restock</span>
                {isUploading && <span className="uploading-label" aria-live="polite">Photo uploading…</span>}
              </div>
              <ProgressBar value={answeredCount} max={bins.length} label="Bins checked" />
            </div>
            <div className="submit-action-wrap">
              <button className="button button-primary submit-button" type="submit" disabled={isSubmitting || isUploading}>
                {isSubmitting ? 'Sending…' : isUploading ? 'Uploading photo…' : 'Submit update'}
              </button>
            </div>
          </div>
          {submitError && <p className="submit-error" role="alert" aria-live="assertive">{submitError}</p>}
        </div>
      </form>
      <p className="form-footer">KSC · Disney team update</p>
    </main>
  );
}
