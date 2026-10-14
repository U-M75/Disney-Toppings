export default function BrandedMessage({ eyebrow = 'KSC Disney team', title, message, home = true }) {
  return (
    <main className="message-shell">
      <img className="brand-logo message-logo" src="/ksc-logo.svg" alt="KSC" />
      <section className="message-card">
        <div className="message-decoration" aria-hidden="true">✨ ♡ ✦</div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="message-copy">{message}</p>
        {home && <a className="button button-primary message-home-link" href="/">Back to KSC team page</a>}
      </section>
      <p className="message-footer">KSC · Disney team resources</p>
    </main>
  );
}
