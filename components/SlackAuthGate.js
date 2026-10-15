export default function SlackAuthGate({ purpose, returnTo }) {
  const isTestConsole = purpose === 'test_console';
  const query = new URLSearchParams({ purpose, returnTo }).toString();
  const signInUrl = `/api/auth/slack/start?${query}`;

  return (
    <main className="message-shell">
      <img className="brand-logo message-logo" src="/ksc-logo.svg" alt="KSC" />
      <section className="message-card auth-card">
        <div className="message-decoration" aria-hidden="true">♡ ✦ 💬</div>
        <p className="eyebrow">{isTestConsole ? 'Private test console' : 'Staff sign-in'}</p>
        <h1>{isTestConsole ? 'Confirm it’s you' : 'One quick Slack check'}</h1>
        <p className="message-copy">
          {isTestConsole
            ? 'Sign in with your Disney Slack account to open the temporary test console.'
            : 'Sign in with your Disney Slack account to open this staff check-in.'}
        </p>
        <a className="button button-primary auth-signin-button" href={signInUrl}>Sign in with Slack</a>
        <div className="auth-details">
          <p>We’ll send a five-digit, one-use code to your Slack direct messages. It expires in five minutes; after verification, your sign-in lasts 24 hours.</p>
          {!isTestConsole && <p>Your form link keeps its normal expiry and can still be updated while valid. Signing in does not use up the link.</p>}
        </div>
      </section>
      <p className="message-footer">KSC · secure team access <span aria-hidden="true">♡</span></p>
    </main>
  );
}
