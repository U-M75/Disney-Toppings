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
            <li>For every style, choose Bin 1–14, Needed/Not Needed, and bags remaining.</li>
            <li>Check Replace when the style has been displayed too long, then submit.</li>
          </ol>
          <p className="landing-photo-note">Add a photo for every style marked Needed or Replace.</p>
        </div>
        <p className="landing-note">Need a fresh link? Ask your manager to send or resend the latest Slack update.</p>
      </section>
      <p className="message-footer">KSC · Disney team resources</p>
    </main>
  );
}
