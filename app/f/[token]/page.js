import BrandedMessage from '../../../components/BrandedMessage';
import ToppingForm from '../../../components/ToppingForm';
import { getAppTimezone, getLocations, getRequirePhoto, getShowBagsField, getStyles } from '../../../lib/config';
import { getRedis, getSubmission } from '../../../lib/redis';
import { resolveFormToken } from '../../../lib/token';
import { formatDateLabel, formatDateTime } from '../../../lib/time';

export const dynamic = 'force-dynamic';

export default async function FormPage({ params }) {
  const token = params?.token;
  let redis;
  let resolved;
  try {
    redis = getRedis();
    resolved = await resolveFormToken(token, redis);
  } catch {
    return (
      <BrandedMessage
        eyebrow="Just a little hiccup"
        title="We can't open this check-in right now"
        message="Please check your connection and try the Slack link again. If it still does not open, ask a manager to resend the topping update."
      />
    );
  }

  if (!resolved?.ok) {
    const expired = resolved?.reason === 'expired';
    const missing = resolved?.reason === 'missing';
    return (
      <BrandedMessage
        eyebrow="KSC Topping Update"
        title={expired ? 'This link has expired' : 'This link is not available'}
        message={expired
          ? 'This check-in link has timed out. Please ask a manager to send a fresh topping update link in Slack.'
          : missing
            ? 'This check-in is no longer available. Please open the latest link from the Disney team Slack channel.'
            : 'This link does not look right. Please open the latest topping update link from Slack.'}
      />
    );
  }

  try {
    const timezone = getAppTimezone();
    const styles = getStyles();
    const locations = getLocations();
    const [submission, todayLabel] = await Promise.all([
      getSubmission(redis, resolved.cycleId),
      Promise.resolve(formatDateLabel(new Date(), timezone))
    ]);
    let existingSubmission = null;
    if (submission || resolved.cycle.submittedAt) {
      const name = submission?.name || resolved.cycle.submissionName || 'a team member';
      const submittedAt = submission?.submittedAt || resolved.cycle.submittedAt;
      existingSubmission = {
        name,
        submittedAtLabel: submittedAt ? formatDateTime(new Date(submittedAt), timezone) : 'earlier'
      };
    }

    return (
      <ToppingForm
        token={token}
        cycleLabel={resolved.cycle.label || 'Kiosk check-in'}
        styles={styles}
        locations={locations}
        todayLabel={todayLabel}
        requirePhoto={getRequirePhoto()}
        showBagsField={getShowBagsField()}
        existingSubmission={existingSubmission}
      />
    );
  } catch {
    return (
      <BrandedMessage
        eyebrow="KSC Topping Update"
        title="This check-in needs a little help"
        message="The form settings are not ready right now. Please tell a manager so they can check the app configuration and resend the link."
      />
    );
  }
}
