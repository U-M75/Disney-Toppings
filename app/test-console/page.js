import BrandedMessage from '../../components/BrandedMessage';
import SlackAuthGate from '../../components/SlackAuthGate';
import TestConsoleClient from '../../components/TestConsoleClient';
import { isSlackOtpAuthEnabled, getCurrentAuthSession } from '../../lib/otp-auth';
import { isSlackTestModeEnabled } from '../../lib/test-mode';

export const dynamic = 'force-dynamic';

export default async function TestConsolePage() {
  if (!isSlackTestModeEnabled()) {
    return (
      <BrandedMessage
        eyebrow="Temporary test"
        title="Test mode is off"
        message="This private testing tool is disabled. Ask an administrator to enable it only while running a Slack test."
        home={false}
      />
    );
  }

  const otpRequired = isSlackOtpAuthEnabled();
  if (otpRequired) {
    try {
      const session = await getCurrentAuthSession('test_console');
      if (!session) return <SlackAuthGate purpose="test_console" returnTo="/test-console" />;
    } catch {
      return (
        <BrandedMessage
          eyebrow="Temporary test"
          title="Secure sign-in is unavailable"
          message="Please try again shortly. If the problem continues, ask an administrator to check the Slack sign-in setup."
          home={false}
        />
      );
    }
  }

  return <TestConsoleClient otpRequired={otpRequired} />;
}
