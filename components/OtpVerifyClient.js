'use client';

import { useState } from 'react';

export default function OtpVerifyClient({ challengeId }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [continueTo, setContinueTo] = useState('');

  async function verifyCode(event) {
    event.preventDefault();
    const normalizedCode = code.replace(/\D/g, '').slice(0, 5);
    if (!/^[0-9]{5}$/.test(normalizedCode)) {
      setError('Enter the five-digit code from your Slack direct message.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ challengeId, code: normalizedCode })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || typeof data.returnTo !== 'string') {
        setError(data.error || 'That code could not be verified. Request a new sign-in code and try again.');
        return;
      }
      if (data.dmUpdated === false) {
        setNotice('Code accepted. Slack could not update the original DM, but the code has been consumed.');
        setContinueTo(data.returnTo);
        return;
      }
      window.location.assign(data.returnTo);
    } catch {
      setError('We could not reach the sign-in service. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="message-shell">
      <img className="brand-logo message-logo" src="/ksc-logo.svg" alt="KSC" />
      <section className="message-card auth-card">
        <div className="message-decoration" aria-hidden="true">✦ 💌 ♡</div>
        <p className="eyebrow">Slack verification</p>
        <h1>Check your Slack DM</h1>
        <p className="message-copy">Enter the five-digit code we sent to your Slack direct messages. It expires in five minutes and works once.</p>
        {challengeId ? (
          <form className="auth-code-form" onSubmit={verifyCode}>
            <div className="field">
              <label htmlFor="otp-code">Five-digit code</label>
              <input
                className="form-control auth-code-input"
                id="otp-code"
                name="one-time-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{5}"
                maxLength={5}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 5))}
                aria-describedby={error ? 'otp-error' : 'otp-help'}
                required
                autoFocus
              />
              <p className="test-console-help" id="otp-help">After you verify, the Slack DM will be edited to show that the code was used.</p>
            </div>
            <button className="button button-primary" type="submit" disabled={busy || code.length !== 5}>
              {busy ? 'Verifying…' : 'Verify code'}
            </button>
          </form>
        ) : (
          <p className="field-error" role="alert">This verification link is incomplete. Return to the form and start Slack sign-in again.</p>
        )}
        {error && <p className="field-error" id="otp-error" role="alert" aria-live="assertive">{error}</p>}
        {notice && <p className="delivery-warning" role="status">{notice}</p>}
        {continueTo && <a className="button button-secondary" href={continueTo}>Continue to KSC</a>}
      </section>
      <p className="message-footer">One-use code · 5-minute expiry <span aria-hidden="true">♡</span></p>
    </main>
  );
}
