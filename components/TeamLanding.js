export default function TeamLanding() {
  return (
    <main className="message-shell landing-shell">
      <img className="brand-logo message-logo" src="/ksc-logo.svg" alt="KSC" />
      <section className="message-card team-landing-card">
        <p className="eyebrow">KSC · Disney team</p>
        <h1>Topping Update</h1>
        <p className="message-copy">The check-in form opens from the private link shared in Slack.</p>
        <div className="landing-instructions">
          <p className="landing-instructions-title">To submit your update</p>
          <ol className="landing-steps">
            <li>Open the latest <strong>Topping Update</strong> message in your Disney team Slack channel.</li>
            <li>Select <strong>Open update form</strong> in that message.</li>
            <li>On each of the 28 physical bins, optionally enter one or more topping/style names and the whole-number bag count for each named style (0 is allowed).</li>
            <li>Tap Yes or No for “Restock Needed?” once per bin. The answer applies to the whole bin, not each style.</li>
            <li>Add a photo for every bin marked Yes, then submit the update.</li>
          </ol>
        </div>
        <p className="landing-note">Need a fresh link? Ask your manager to send or resend the latest Slack update.</p>
        <aside className="landing-manager-access" aria-label="Manager access">
          <div className="landing-manager-copy">
            <p className="eyebrow">For managers</p>
            <p>Review recent bin checks and per-style bag counts. A password is required.</p>
          </div>
          <a className="button button-primary landing-manager-button" href="/dashboard">Manager dashboard</a>
        </aside>
      </section>
      <p className="message-footer">KSC · Disney team resources</p>
    </main>
  );
}
