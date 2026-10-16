import { getAppTimezone, getBins, getLocations } from '../../../../lib/config';
import { cleanPersonName } from '../../../../lib/validation';
import { normalizeBinAnswers } from '../../../../lib/bin-submission';
import { verifySlackTestFormToken, isSlackTestModeEnabled } from '../../../../lib/test-mode';
import { formatDateTime } from '../../../../lib/time';
import { postSlackTestSubmission } from '../../../../lib/slack';

export const dynamic = 'force-dynamic';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function invalid(message, fieldErrors, status = 400) {
  return json({ ok: false, error: message, fieldErrors }, status);
}

export async function POST(request) {
  if (!isSlackTestModeEnabled()) return json({ ok: false, error: 'Temporary Slack test mode is disabled.' }, 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return invalid('The test submission could not be read. Please review the form and try again.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return invalid('The test submission must be a JSON object.');
  }
  if (typeof body.token !== 'string') return invalid('This temporary test link is not valid.', { token: 'Open the test form from the latest Slack test alert.' }, 401);

  const resolved = verifySlackTestFormToken(body.token);
  if (!resolved.ok) {
    const expired = resolved.reason === 'expired';
    const message = expired
      ? 'This temporary test link has expired. Start a new test from the test console.'
      : 'This temporary test link is not valid or test mode has been disabled.';
    return invalid(message, { token: message }, expired ? 410 : 401);
  }

  let bins;
  let locations;
  let timezone;
  try {
    bins = getBins();
    locations = getLocations();
    timezone = getAppTimezone();
  } catch {
    return json({ ok: false, error: 'The test form settings are not available. Please try again later.' }, 500);
  }

  const name = cleanPersonName(body.name);
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const fieldErrors = {};
  if (!name) fieldErrors.name = 'Enter your name.';
  else if (name.length > 80) fieldErrors.name = 'Use 80 characters or fewer for your name.';
  if (!locations.includes(location)) fieldErrors.location = 'Choose one of the listed locations.';

  const normalized = normalizeBinAnswers(body.answers, bins, { photosDisabled: true });
  Object.assign(fieldErrors, normalized.fieldErrors);
  if (Object.keys(fieldErrors).length > 0) {
    return invalid('Answer Yes or No for every bin before submitting the test.', fieldErrors);
  }

  const normalizedAnswers = normalized.answers;
  const submittedAt = new Date().toISOString();
  const neededCount = normalizedAnswers.filter((answer) => answer.status === 'needed').length;
  const notNeededCount = normalizedAnswers.filter((answer) => answer.status === 'not_needed').length;
  const submission = {
    cycleId: resolved.cycle.cycleId,
    name,
    location,
    answers: normalizedAnswers,
    submittedAt,
    timeZone: timezone,
    isUpdated: false,
    neededCount,
    notNeededCount
  };

  try {
    await postSlackTestSubmission({ cycle: resolved.cycle, submission, bins });
  } catch {
    return json({ ok: false, error: 'The test answers were validated, but Slack could not post the reply. Check the bot channel access and chat:write scope, then try again.' }, 502);
  }

  return json({
    ok: true,
    saved: false,
    testMode: true,
    updated: false,
    summary: {
      neededCount,
      notNeededCount,
      neededBins: normalizedAnswers.filter((answer) => answer.status === 'needed').map((answer) => answer.bin),
      submittedAtLabel: formatDateTime(new Date(submittedAt), timezone)
    },
    slack: { status: 'posted', testMode: true }
  });
}
