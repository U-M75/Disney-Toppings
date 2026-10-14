'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import StyleCard from './StyleCard';
import ProgressBar from './ProgressBar';

function emptyAnswers(styles) {
  return Object.fromEntries(styles.map((style) => [style.id, { status: '', photoUrl: '', bags: '' }]));
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
  styles,
  locations,
  todayLabel,
  requirePhoto,
  showBagsField,
  existingSubmission
}) {
  const draftKey = useMemo(() => `ksc-topping-update:draft:${token}`, [token]);
  const [form, setForm] = useState(() => ({
    name: '',
    location: locations.includes('Disney CA') ? 'Disney CA' : locations[0],
    answers: emptyAnswers(styles)
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
        const answers = emptyAnswers(styles);
        for (const style of styles) {
          const savedAnswer = draft?.answers?.[style.id];
          if (savedAnswer && ['', 'needed', 'not_needed'].includes(savedAnswer.status)) {
            answers[style.id] = {
              status: savedAnswer.status,
              photoUrl: typeof savedAnswer.photoUrl === 'string' ? savedAnswer.photoUrl : '',
              bags: typeof savedAnswer.bags === 'string' || typeof savedAnswer.bags === 'number' ? String(savedAnswer.bags) : ''
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
  }, [draftKey, locations, styles]);

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

  const answeredCount = styles.reduce((count, style) => count + (form.answers[style.id]?.status ? 1 : 0), 0);
  const neededCount = styles.reduce((count, style) => count + (form.answers[style.id]?.status === 'needed' ? 1 : 0), 0);
  const isUploading = Object.values(uploading).some(Boolean);

  function updateForm(patcher) {
    setForm((current) => typeof patcher === 'function' ? patcher(current) : { ...current, ...patcher });
    setDirty(true);
  }

  function onStatusChange(styleId, status) {
    const previous = form.answers[styleId];
    if (status === 'not_needed' && previous?.photoUrl) deletePhotoBestEffort(token, previous.photoUrl);
    updateForm((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [styleId]: {
          ...current.answers[styleId],
          status,
          ...(status === 'not_needed' ? { photoUrl: '', bags: '' } : {})
        }
      }
    }));
    setErrors((current) => {
      const next = { ...current, [styleId]: undefined };
      delete next.answers;
      return next;
    });
    setSubmitError('');
  }

  function onPhotoChange(styleId, photoUrl) {
    updateForm((current) => ({
      ...current,
      answers: { ...current.answers, [styleId]: { ...current.answers[styleId], photoUrl } }
    }));
    if (photoUrl) setErrors((current) => ({ ...current, [styleId]: undefined }));
    setSubmitError('');
  }

  function onBagsChange(styleId, bags) {
    updateForm((current) => ({
      ...current,
      answers: { ...current.answers, [styleId]: { ...current.answers[styleId], bags } }
    }));
    setErrors((current) => ({ ...current, [styleId]: undefined }));
  }

  function onUploadingChange(styleId, value) {
    setUploading((current) => ({ ...current, [styleId]: value }));
  }

  function setUnansweredToNotNeeded() {
    const unanswered = styles.filter((style) => !form.answers[style.id]?.status);
    if (!unanswered.length) return;
    const confirmed = window.confirm(`Set all ${unanswered.length} unanswered styles to Not Needed?`);
    if (!confirmed) return;
    updateForm((current) => {
      const answers = { ...current.answers };
      for (const style of unanswered) answers[style.id] = { ...answers[style.id], status: 'not_needed', photoUrl: '', bags: '' };
      return { ...current, answers };
    });
    setErrors((current) => {
      const next = { ...current };
      unanswered.forEach((style) => delete next[style.id]);
      delete next.answers;
      return next;
    });
  }

  function scrollToFirstError(fieldErrors) {
    const firstStyle = styles.find((style) => fieldErrors[style.id]);
    if (firstStyle) {
      const card = document.querySelector(`[data-style-id="${firstStyle.id}"]`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card?.querySelector('select')?.focus({ preventScroll: true });
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

    for (const style of styles) {
      const answer = form.answers[style.id] || { status: '', photoUrl: '' };
      if (!answer.status) fieldErrors[style.id] = 'Choose Needed or Not Needed.';
      else if (answer.status === 'needed' && requirePhoto && !answer.photoUrl) fieldErrors[style.id] = 'Add a photo for this needed style.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      setSubmitError('Please complete the highlighted fields.');
      scrollToFirstError(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitError('');
    setIsSubmitting(true);
    const answers = styles.map((style) => {
      const answer = form.answers[style.id];
      return {
        styleId: style.id,
        status: answer.status,
        ...(answer.status === 'needed' && answer.photoUrl ? { photoUrl: answer.photoUrl } : {}),
        ...(answer.status === 'needed' && showBagsField && answer.bags !== '' ? { bags: Number(answer.bags) } : {})
      };
    });

    try {
      const response = await fetch('/api/submit', {
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
    const neededStyles = summary.neededStyles || [];
    const slack = success.slack || {};
    return (
      <main className="form-shell">
        <div className="brand-row">
          <img className="brand-logo" src="/ksc-logo.svg" alt="KSC" />
          <span className="brand-caption">Kawaii Slime Company · Disney CA</span>
        </div>
        <section className="success-card" role="status" aria-live="polite">
          <div className="success-sparkles" aria-hidden="true">✨ 💖 🍬</div>
          <p className="eyebrow">{success.updated ? 'Update refreshed' : 'Topping update received'}</p>
          <h1>{success.updated ? 'Your update is all refreshed!' : 'You made our day!'}</h1>
          <p className="success-intro">Thanks, {form.name.trim() || 'team member'}! Your kiosk update has been saved.</p>
          <div className="summary-pills">
            <span className="summary-pill needed-pill">🔴 {summary.neededCount || 0} Needed</span>
            <span className="summary-pill">✅ {summary.notNeededCount || 0} Not Needed</span>
          </div>
          <div className="success-list-wrap">
            <h2>Styles to restock</h2>
            {neededStyles.length ? (
              <ul className="success-list">
                {neededStyles.map((style) => (
                  <li key={style.styleId}>{style.name}{style.bags !== undefined ? ` · ${style.bags} bags remaining` : ''}</li>
                ))}
              </ul>
            ) : <p className="nothing-needed">✅ Nothing needs restocking this round.</p>}
          </div>
          <p className="submitted-at">Submitted {summary.submittedAtLabel ? `at ${summary.submittedAtLabel}` : 'successfully'}.</p>
          {slack.status === 'failed' && <p className="delivery-warning" role="alert">{slack.error || 'Saved successfully, but Slack could not be notified. Please tell your manager.'}</p>}
          {slack.warning && <p className="delivery-warning" role="status">{slack.warning}</p>}
          {slack.status === 'posted' && !slack.warning && <p className="delivery-success">Your update has been shared with the restock team. Thank you! 💕</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="form-shell">
      <div className="brand-row">
        <img className="brand-logo" src="/ksc-logo.svg" alt="KSC" />
        <span className="brand-caption">Kawaii Slime Company · Disney CA</span>
      </div>

      <header className="form-hero">
        <div className="hero-decoration hero-heart" aria-hidden="true">♡</div>
        <div className="hero-decoration hero-sparkle" aria-hidden="true">✦</div>
        <p className="eyebrow">{cycleLabel}</p>
        <h1>Topping Update</h1>
        <p>Let the restock team know what the kiosk needs. It takes about 3 minutes. ✨</p>
        <span className="hero-badge">Disney CA kiosk · quick check-in</span>
      </header>

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
              <p className="eyebrow">First, a few details</p>
              <h2 id="details-title">Who checked the kiosk?</h2>
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

        <section className="styles-section" aria-labelledby="styles-title">
          <div className="section-heading-row style-section-heading">
            <div>
              <p className="eyebrow">One quick look around</p>
              <h2 id="styles-title">How is each style?</h2>
              <p className="section-help">Choose Needed or Not Needed for all 28 styles. Add a photo for every style marked Needed.</p>
            </div>
            <span className="section-heart" aria-hidden="true">✧</span>
          </div>
          {errors.answers && <p className="field-error form-level-error" role="alert">{errors.answers}</p>}
          <button className="button button-outline bulk-button" type="button" onClick={setUnansweredToNotNeeded}>
            Set all unanswered to Not Needed
          </button>
          <div className="style-grid">
            {styles.map((style) => (
              <StyleCard
                key={style.id}
                style={style}
                answer={form.answers[style.id] || { status: '', photoUrl: '', bags: '' }}
                error={errors[style.id] || ''}
                token={token}
                requirePhoto={requirePhoto}
                showBagsField={showBagsField}
                onStatusChange={onStatusChange}
                onPhotoChange={onPhotoChange}
                onBagsChange={onBagsChange}
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
                <span className="progress-summary" aria-live="polite" aria-atomic="true">{answeredCount} / {styles.length} answered · {neededCount} needed</span>
                {isUploading && <span className="uploading-label" aria-live="polite">Photo uploading…</span>}
              </div>
              <ProgressBar value={answeredCount} max={styles.length} label="Styles answered" />
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
      <p className="form-footer">Made with a little KSC sparkle <span aria-hidden="true">♡</span></p>
    </main>
  );
}
