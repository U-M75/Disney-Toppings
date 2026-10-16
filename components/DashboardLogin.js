'use client';

import { useState } from 'react';

export default function DashboardLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(event) {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/dashboard/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ password })
      });
      const data = await response.json().catch(() => ({}));
      setPassword('');
      if (!response.ok || !data.ok) {
        setError(data.error || 'Access was not accepted. Check the dashboard sign-in and try again.');
        return;
      }
      window.location.reload();
    } catch {
      setPassword('');
      setError('The dashboard could not be reached. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="message-shell dashboard-login-shell">
      <img className="brand-logo message-logo" src="/ksc-logo.svg" alt="KSC" />
      <section className="message-card dashboard-login-card">
        <p className="eyebrow">KSC · Manager access</p>
        <h1>Bin check dashboard</h1>
        <p className="message-copy">Sign in to review the latest updates and the last 90 days of submissions.</p>
        <form className="dashboard-login-form" onSubmit={signIn}>
          <div className="field">
            <label htmlFor="dashboard-password">Dashboard password</label>
            <input
              className="form-control"
              id="dashboard-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              maxLength={512}
            />
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="dashboard-login-note">This is separate manager access. The associate form remains OTP-free.</p>
      </section>
    </main>
  );
}
