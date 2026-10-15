import BrandedMessage from '../../../components/BrandedMessage';
import SlackAuthGate from '../../../components/SlackAuthGate';
import ToppingForm from '../../../components/ToppingForm';
import { getAppTimezone, getLocations, getShowBagsField, getStyles } from '../../../lib/config';
import { getCurrentAuthSession, isSlackOtpAuthEnabled } from '../../../lib/otp-auth';
import { verifySlackTestFormToken } from '../../../lib/test-mode';
import { formatDateLabel } from '../../../lib/time';

export const dynamic = 'force-dynamic';

export default async function TemporaryTestFormPage({ params }) {
  const token = params?.token;
  const resolved = verifySlackTestFormToken(token);

  if (!resolved.ok) {
    const expired = resolved.reason === 'expired';
    return (
      <BrandedMessage
        eyebrow="Temporary Slack test"
        title={expired ? 'This test link expired' : 'This test link is unavailable'}
        message={expired
          ? 'The 30-minute test link has expired. Start a fresh test from the private test console.'
          : 'This temporary test link is not valid or test mode has been turned off.'}
        home={false}
      />
    );
  }

  if (isSlackOtpAuthEnabled()) {
    try {
      const session = await getCurrentAuthSession('test_console');
      if (!session) return <SlackAuthGate purpose="test_console" returnTo={`/test-form/${token}`} />;
    } catch {
      return (
        <BrandedMessage
          eyebrow="Temporary Slack test"
          title="Secure sign-in is unavailable"
          message="Please try again shortly or ask an administrator to check the Slack sign-in setup."
          home={false}
        />
      );
    }
  }

  try {
    const timezone = getAppTimezone();
    return (
      <ToppingForm
        token={token}
        cycleLabel="Temporary Slack test"
        styles={getStyles()}
        locations={getLocations()}
        todayLabel={formatDateLabel(new Date(), timezone)}
        requirePhoto={false}
        showBagsField={getShowBagsField()}
        existingSubmission={null}
        testMode
      />
    );
  } catch {
    return (
      <BrandedMessage
        eyebrow="Temporary Slack test"
        title="This test form needs a little help"
        message="The test form settings are unavailable right now. Start a new test or ask an administrator to check the app configuration."
        home={false}
      />
    );
  }
}
