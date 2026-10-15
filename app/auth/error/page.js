import BrandedMessage from '../../../components/BrandedMessage';

export const dynamic = 'force-dynamic';

const MESSAGES = {
  disabled: ['Slack sign-in is not enabled', 'Ask an administrator to finish the Slack OAuth setup before using this sign-in flow.'],
  invalid_link: ['This link is no longer available', 'Open the current staff link from Slack, or start a fresh temporary test from the private console.'],
  denied: ['Slack sign-in was cancelled', 'Return to the form and try signing in with Slack again.'],
  state: ['We could not confirm that sign-in', 'The sign-in session expired or could not be verified. Start again from the original form link.'],
  rate_limited: ['Please wait before requesting another code', 'A code was recently requested for this Slack account. Wait a minute, then start again.'],
  unavailable: ['Slack sign-in is temporarily unavailable', 'Please try again shortly. If the problem continues, ask an administrator to check the Slack app and deployment configuration.']
};

export default function SlackAuthErrorPage({ searchParams }) {
  const reason = typeof searchParams?.reason === 'string' ? searchParams.reason : '';
  const [title, message] = MESSAGES[reason] || MESSAGES.unavailable;
  return (
    <BrandedMessage
      eyebrow="Secure KSC access"
      title={title}
      message={message}
      home={false}
    />
  );
}
