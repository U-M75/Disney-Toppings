import { getAppTimezone, getLocations, getStyles } from '../../../../lib/config';
import { cleanPersonName } from '../../../../lib/validation';
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

  let styles;
  let locations;
  let timezone;
  try {
    styles = getStyles();
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

  if (!Array.isArray(body.answers)) {
    fieldErrors.answers = 'Answer every style before submitting.';
    return invalid('Please complete the required test fields.', fieldErrors);
  }

  const styleById = new Map(styles.map((style) => [style.id, style]));
  const answerById = new Map();
  for (const answer of body.answers) {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer) || typeof answer.styleId !== 'string') {
      fieldErrors.answers = 'One or more style answers are not valid.';
      continue;
    }
    if (!styleById.has(answer.styleId)) {
      fieldErrors[answer.styleId] = 'This style is not part of the current test form.';
      continue;
    }
    if (answerById.has(answer.styleId)) {
      fieldErrors[answer.styleId] = 'This style was included more than once. Refresh the test form and try again.';
      continue;
    }
    answerById.set(answer.styleId, answer);
  }
  if (body.answers.length !== styles.length) fieldErrors.answers = 'Exactly one answer is required for each of the 28 styles.';

  const normalizedAnswers = [];
  for (const style of styles) {
    const answer = answerById.get(style.id);
    if (!answer) {
      fieldErrors[style.id] = 'Choose Needed or Not Needed.';
      continue;
    }
    if (!['needed', 'not_needed'].includes(answer.status)) {
      fieldErrors[style.id] = 'Choose Needed or Not Needed.';
      continue;
    }
    if (answer.photoUrl) fieldErrors[style.id] = 'Photo uploads are disabled in this temporary test.';

    const bin = answer.bin;
    if (typeof bin !== 'number' || !Number.isInteger(bin) || bin < 1 || bin > 14) {
      fieldErrors[style.id] = 'Choose a bin from 1 to 14.';
    }
    if (typeof answer.replaceForAge !== 'boolean') {
      fieldErrors[style.id] = 'Choose Yes or No for replacement due to display time.';
    }
    const replaceForAge = answer.replaceForAge === true;
    const bags = answer.bags;
    if (typeof bags !== 'number' || !Number.isInteger(bags) || bags < 0 || bags > 9999) {
      fieldErrors[style.id] = 'Enter bags remaining as a whole number from 0 to 9999.';
    }

    normalizedAnswers.push({
      styleId: style.id,
      styleName: style.name,
      bin,
      status: answer.status,
      replaceForAge,
      bags
    });
  }

  if (Object.keys(fieldErrors).length > 0) return invalid('Please fix the highlighted fields before submitting the test.', fieldErrors);

  const submittedAt = new Date().toISOString();
  const neededCount = normalizedAnswers.filter((answer) => answer.status === 'needed').length;
  const replaceCount = normalizedAnswers.filter((answer) => answer.replaceForAge).length;
  const submission = {
    cycleId: resolved.cycle.cycleId,
    name,
    location,
    answers: normalizedAnswers,
    submittedAt,
    timeZone: timezone,
    isUpdated: false,
    neededCount,
    replaceCount,
    notNeededCount: normalizedAnswers.filter((answer) => answer.status === 'not_needed').length
  };

  try {
    await postSlackTestSubmission({ cycle: resolved.cycle, submission, styles });
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
      replaceCount,
      notNeededCount: normalizedAnswers.filter((answer) => answer.status === 'not_needed').length,
      neededStyles: normalizedAnswers
        .filter((answer) => answer.status === 'needed')
        .map((answer) => ({
          styleId: answer.styleId,
          name: answer.styleName,
          bin: answer.bin,
          bags: answer.bags
        })),
      replaceStyles: normalizedAnswers
        .filter((answer) => answer.replaceForAge)
        .map((answer) => ({
          styleId: answer.styleId,
          name: answer.styleName,
          bin: answer.bin,
          bags: answer.bags
        })),
      submittedAtLabel: formatDateTime(new Date(submittedAt), timezone)
    },
    slack: { status: 'posted', testMode: true }
  });
}
