'use client';

import './globals.css';

export default function GlobalError({ reset }) {
  return (
    <html lang="en">
      <head><meta name="robots" content="noindex, nofollow" /></head>
      <body>
        <main className="message-shell">
          <img className="brand-logo message-logo" src="/ksc-logo.svg" alt="KSC" />
          <section className="message-card" role="alert">
            <div className="message-decoration" aria-hidden="true">✨ ♡ ✦</div>
            <p className="eyebrow">KSC Disney team</p>
            <h1>Something went a little sideways</h1>
            <p className="message-copy">Please try again, or open the latest topping update link from Slack.</p>
            <button className="button button-primary message-home-link" type="button" onClick={() => reset()}>Try again</button>
          </section>
        </main>
      </body>
    </html>
  );
}
