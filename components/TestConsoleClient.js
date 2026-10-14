'use client';

import { useState } from 'react';

export default function TestConsoleClient() {
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [testUrl, setTestUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  async function startTest(event) {
    event.preventDefault();
    const authorizationSecret = secret.trim();
    if (!authorizationSecret) {
      setError('Enter the CRON_SECRET from your Vercel environment variables.');
      return;
    }

    setBusy(true);
    setError('');
    setTestUrl('');
    setExpiresAt('');
    try {
      const response = await fetch('/api/test/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authorizationSecret}` },
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      setSecret('');
      if (!response.ok || !data.ok || typeof data.testUrl !== 'string') {
        setError(data.error || 'The test alert could not be started. Please try again.');
        return;
      }
      setTestUrl(data.testUrl);
      setExpiresAt(data.expiresAt || 'in 30 minutes');
    } catch {
      setSecret('');
      setError('We could not reach the test service. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="message-shell">
      <img className="brand-logo message-logo" src="/ksc-logo.svg" alt="KSC" />
      <section className="message-card test-console-card">
        <div className="message-decoration" aria-hidden="true">🧪 ♡ ✦</div>
        <p className="eyebrow">Temporary Slack test</p>
        <h1>Start a test alert</h1>
        <p className="message-copy">This sends a clearly labeled test message to the configured Slack channel and creates a 30-minute test form link. Test responses are posted to Slack but are not saved. Photos are disabled.</p>
        <form className="test-console-form" onSubmit={startTest}>
          <div className="field">
            <label htmlFor="cron-secret">Vercel CRON_SECRET <span className="required-word">(required)</span></label>
            <input
              className="form-control"
              id="cron-secret"
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              aria-describedby="cron-secret-help"
              required
            />
            <p className="test-console-help" id="cron-secret-help">Enter it only here. It is sent to this site over HTTPS, is not saved in the browser, and must not be shared in chat.</p>
          </div>
          <button className="button button-primary" type="submit" disabled={busy || !secret.trim()}>
            {busy ? 'Sending test alert…' : 'Send test alert to Slack'}
          </button>
        </form>
        {error && <p className="field-error" role="alert" aria-live="assertive">{error}</p>}
        {testUrl && (
          <div className="test-console-result" role="status" aria-live="polite">
            <p><strong>Test alert sent.</strong> Open the button in the Slack test thread, or use this direct test link:</p>
            <a className="button button-secondary" href={testUrl}>Open temporary test form</a>
            <p className="test-console-help">Link expires {expiresAt}. The test response will not be saved and cannot include photos.</p>
          </div>
        )}
      </section>
      <p className="message-footer">Temporary test only · no database writes <span aria-hidden="true">♡</span></p>
    </main>
  );
}
