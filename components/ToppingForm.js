'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import StyleCard from './StyleCard';
import ProgressBar from './ProgressBar';

function emptyAnswers(styles) {
  return Object.fromEntries(styles.map((style) => [style.id, {
    bin: '',
    status: '',
    replaceForAge: null,
    photoUrl: '',
    bags: ''
  }]));
}

function isValidBagCount(value) {
  if (value === '' || value === null || value === undefined) return false;
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 && count <= 9999;
}

function isCompleteAnswer(answer, requirePhoto) {
  const bin = Number(answer?.bin);
  const validBin = Number.isInteger(bin) && bin >= 1 && bin <= 14;
  const needsPhoto = answer?.status === 'needed' || Boolean(answer?.replaceForAge);
  const photoComplete = !requirePhoto || !needsPhoto || Boolean(answer?.photoUrl);
  return Boolean(answer?.status && typeof answer?.replaceForAge === 'boolean' && validBin && isValidBagCount(answer?.bags) && photoComplete);
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
  existingSubmission,
  testMode = false
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
              bin: typeof savedAnswer.bin === 'string' || typeof savedAnswer.bin === 'number' ? String(savedAnswer.bin) : '',
              status: savedAnswer.status,
              replaceForAge: typeof savedAnswer.replaceForAge === 'boolean' ? savedAnswer.replaceForAge : null,
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

  const answeredCount = styles.reduce((count, style) => count + (isCompleteAnswer(form.answers[style.id], requirePhoto) ? 1 : 0), 0);
  const neededCount = styles.reduce((count, style) => count + (form.answers[style.id]?.status === 'needed' ? 1 : 0), 0);
  const replaceCount = styles.reduce((count, style) => count + (form.answers[style.id]?.replaceForAge ? 1 : 0), 0);
  const isUploading = Object.values(uploading).some(Boolean);

  function updateForm(patcher) {
    setForm((current) => typeof patcher === 'function' ? patcher(current) : { ...current, ...patcher });
    setDirty(true);
  }

  function clearStyleError(styleId) {
    setErrors((current) => {
      const next = { ...current, [styleId]: undefined };
      delete next.answers;
      return next;
    });
    setSubmitError('');
  }

  function onBinChange(styleId, bin) {
    updateForm((current) => ({
      ...current,
      answers: { ...current.answers, [styleId]: { ...current.answers[styleId], bin } }
    }));
    clearStyleError(styleId);
  }

  function onStatusChange(styleId, status) {
    const previous = form.answers[styleId];
    const keepPhoto = status === 'needed' || Boolean(previous?.replaceForAge);
    if (!keepPhoto && previous?.photoUrl) deletePhotoBestEffort(token, previous.photoUrl);
    updateForm((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [styleId]: {
          ...current.answers[styleId],
          status,
          ...(!keepPhoto ? { photoUrl: '' } : {})
        }
      }
    }));
    clearStyleError(styleId);
  }

  function onReplaceForAgeChange(styleId, replaceForAge) {
    const previous = form.answers[styleId];
    const keepPhoto = replaceForAge || previous?.status === 'needed';
    if (!keepPhoto && previous?.photoUrl) deletePhotoBestEffort(token, previous.photoUrl);
    updateForm((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [styleId]: {
          ...current.answers[styleId],
          replaceForAge,
          ...(!keepPhoto ? { photoUrl: '' } : {})
        }
      }
    }));
    clearStyleError(styleId);
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
    const confirmed = window.confirm(`Set the status of all ${unanswered.length} unanswered styles to Not Needed? You must still choose each bin, enter bags remaining, and answer Replace Yes/No.`);
    if (!confirmed) return;
    updateForm((current) => {
      const answers = { ...current.answers };
      for (const style of unanswered) {
        const answer = answers[style.id];
        const keepPhoto = Boolean(answer.replaceForAge);
        if (!keepPhoto && answer.photoUrl) deletePhotoBestEffort(token, answer.photoUrl);
        answers[style.id] = {
          ...answer,
          status: 'not_needed',
          ...(!keepPhoto ? { photoUrl: '' } : {})
        };
      }
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

    const addStyleError = (styleId, message) => {
      if (!fieldErrors[styleId]) fieldErrors[styleId] = message;
    };
    for (const style of styles) {
      const answer = form.answers[style.id] || { bin: '', status: '', replaceForAge: null, photoUrl: '', bags: '' };
      const bin = Number(answer.bin);
      if (!Number.isInteger(bin) || bin < 1 || bin > 14) addStyleError(style.id, 'Choose a bin from 1 to 14.');
      if (!answer.status) addStyleError(style.id, 'Choose Needed or Not Needed.');
      if (typeof answer.replaceForAge !== 'boolean') addStyleError(style.id, 'Choose Yes or No for replacement due to display time.');
      if (!isValidBagCount(answer.bags)) addStyleError(style.id, 'Enter bags remaining as a whole number from 0 to 9999.');
      const needsPhoto = answer.status === 'needed' || Boolean(answer.replaceForAge);
      if (needsPhoto && requirePhoto && !answer.photoUrl) addStyleError(style.id, 'Add a photo for a style marked Needed or Replace.');
      if (!needsPhoto && answer.photoUrl) addStyleError(style.id, 'Remove the photo or mark the style Needed/Replace.');
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
      const needsPhoto = answer.status === 'needed' || Boolean(answer.replaceForAge);
      return {
        styleId: style.id,
        bin: Number(answer.bin),
        status: answer.status,
        replaceForAge: Boolean(answer.replaceForAge),
        bags: Number(answer.bags),
        ...(needsPhoto && answer.photoUrl ? { photoUrl: answer.photoUrl } : {})
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
    const neededStyles = summary.neededStyles || [];
    const replaceStyles = summary.replaceStyles || [];
    const slack = success.slack || {};
    return (
      <main className="form-shell">
        <div className="brand-row">
          <img className="brand-logo" src="/ksc-logo.svg" alt="KSC" />
          <span className="brand-caption">Kawaii Slime Company · Kiosk Update</span>
        </div>
        <section className="success-card" role="status" aria-live="polite">
          <div className="success-sparkles" aria-hidden="true">✨ 💖 🍬</div>
          <p className="eyebrow">{testMode ? 'Temporary test complete' : success.updated ? 'Submission updated' : 'Update submitted'}</p>
          <h1>{testMode ? 'Slack test delivered' : success.updated ? 'Your update was updated' : 'Your update was submitted'}</h1>
          <p className="success-intro">{testMode
            ? `Thanks, ${form.name.trim() || 'team member'}! Your test answers were sent to Slack but were not saved.`
            : `Thanks, ${form.name.trim() || 'team member'}! Your kiosk update has been saved.`}</p>
          <div className="summary-pills">
            <span className="summary-pill needed-pill">🔴 {summary.neededCount || 0} Needed</span>
            <span className="summary-pill">♻️ {summary.replaceCount || 0} Replace</span>
            <span className="summary-pill">✅ {summary.notNeededCount || 0} Not Needed</span>
          </div>
          <div className="success-list-wrap">
            <h2>Styles to restock</h2>
            {neededStyles.length ? (
              <ul className="success-list">
                {neededStyles.map((style) => (
                  <li key={style.styleId}>Bin {style.bin} · {style.name} · {style.bags} bags remaining</li>
                ))}
              </ul>
            ) : <p className="nothing-needed">No styles were marked Needed.</p>}
          </div>
          <div className="success-list-wrap">
            <h2>Replace due to display time</h2>
            {replaceStyles.length ? (
              <ul className="success-list">
                {replaceStyles.map((style) => (
                  <li key={style.styleId}>Bin {style.bin} · {style.name} · {style.bags} bags remaining</li>
                ))}
              </ul>
            ) : <p className="nothing-needed">No styles were marked for replacement.</p>}
          </div>
          <p className="submitted-at">Submitted {summary.submittedAtLabel ? `at ${summary.submittedAtLabel}` : 'successfully'}.</p>
          {slack.status === 'failed' && <p className="delivery-warning" role="alert">{slack.error || 'Saved successfully, but Slack could not be notified. Please tell your manager.'}</p>}
          {slack.warning && <p className="delivery-warning" role="status">{slack.warning}</p>}
          {slack.status === 'posted' && !slack.warning && <p className="delivery-success">{testMode ? 'The test response was posted in the Slack test thread. No database record was created.' : 'Your update has been shared with the restock team. Thank you! 💕'}</p>}
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
        <p>{testMode ? 'Test the form and Slack reply. Responses are not saved and photos are disabled.' : 'Review the kiosk and report which toppings need restocking.'}</p>
        <span className="hero-badge">{testMode ? '🧪 Test only · no database save' : 'Kiosk · quick check-in'}</span>
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
              <p className="eyebrow">Topping inventory</p>
              <h2 id="styles-title">Check each style</h2>
              <p className="section-help">{testMode ? 'For every style, choose Bin 1–14, status, bags remaining, and whether it should be replaced due to display time. Photos are disabled in this test.' : 'For every style, choose Bin 1–14 and Needed/Not Needed, enter bags remaining, and mark Replace if it has been displayed too long. Add a photo for every style marked Needed or Replace.'}</p>
            </div>
            <span className="section-heart" aria-hidden="true">✧</span>
          </div>
          {errors.answers && <p className="field-error form-level-error" role="alert">{errors.answers}</p>}
          <button className="button button-outline bulk-button" type="button" onClick={setUnansweredToNotNeeded}>
            Set unanswered statuses to Not Needed
          </button>
          <div className="style-grid">
            {styles.map((style) => (
              <StyleCard
                key={style.id}
                style={style}
                answer={form.answers[style.id] || { bin: '', status: '', replaceForAge: null, photoUrl: '', bags: '' }}
                error={errors[style.id] || ''}
                token={token}
                requirePhoto={requirePhoto}
                testMode={testMode}
                onBinChange={onBinChange}
                onStatusChange={onStatusChange}
                onReplaceForAgeChange={onReplaceForAgeChange}
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
                <span className="progress-summary" aria-live="polite" aria-atomic="true">{answeredCount} / {styles.length} complete · {neededCount} needed · {replaceCount} replace</span>
                {isUploading && <span className="uploading-label" aria-live="polite">Photo uploading…</span>}
              </div>
              <ProgressBar value={answeredCount} max={styles.length} label="Styles complete" />
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
