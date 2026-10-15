import { getAppTimezone, getLocations, getStyles } from '../../../lib/config';
import { acquireLock, getCycle, getSubmission, getAllowedBlob, getSupabase, releaseLock, saveCycle, saveSubmission } from '../../../lib/supabase';
import { resolveFormToken } from '../../../lib/token';
import { cleanPersonName, isSafeVercelBlobUrl } from '../../../lib/validation';
import { postSubmissionResult, uploadSubmissionPhotos } from '../../../lib/slack';
import { formatDateTime } from '../../../lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function invalid(message, fieldErrors, status = 400) {
  return json({ ok: false, error: message, fieldErrors }, status);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return invalid('The submission could not be read. Please review the form and try again.');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return invalid('The submission body must be a JSON object.');
  }
  if (typeof body.token !== 'string') return invalid('This form link is not valid.', { token: 'Refresh the link and try again.' }, 401);

  let supabase;
  let resolved;
  try {
    supabase = getSupabase();
    resolved = await resolveFormToken(body.token, supabase);
  } catch {
    return json({ ok: false, error: 'The form could not verify your link because the service is temporarily unavailable. Please try again.' }, 503);
  }
  if (!resolved.ok) {
    const message = resolved.reason === 'expired'
      ? 'This form link has expired. Please ask your manager for a fresh link.'
      : 'This form link is not valid. Please open the latest link from Slack.';
    return invalid(message, { token: message }, resolved.reason === 'expired' ? 410 : 401);
  }

  let styles;
  let locations;
  let timezone;
  try {
    styles = getStyles();
    locations = getLocations();
    timezone = getAppTimezone();
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'The form configuration is invalid.' }, 500);
  }

  const name = cleanPersonName(body.name);
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const fieldErrors = {};
  if (!name) fieldErrors.name = 'Enter your name.';
  else if (name.length > 80) fieldErrors.name = 'Use 80 characters or fewer for your name.';
  if (!locations.includes(location)) fieldErrors.location = 'Choose one of the listed locations.';

  if (!Array.isArray(body.answers)) {
    fieldErrors.answers = 'Answer every style before submitting.';
    return invalid('Please complete the required fields.', fieldErrors);
  }

  const styleById = new Map(styles.map((style) => [style.id, style]));
  const answerById = new Map();
  for (const answer of body.answers) {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer) || typeof answer.styleId !== 'string') {
      fieldErrors.answers = 'One or more style answers are not valid.';
      continue;
    }
    if (!styleById.has(answer.styleId)) {
      fieldErrors[answer.styleId] = 'This style is not part of the current form.';
      continue;
    }
    if (answerById.has(answer.styleId)) {
      fieldErrors[answer.styleId] = 'This style was included more than once. Refresh the form and try again.';
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

    const bin = answer.bin;
    if (typeof bin !== 'number' || !Number.isInteger(bin) || bin < 1 || bin > 14) {
      fieldErrors[style.id] = 'Choose a bin from 1 to 14.';
    }
    if (typeof answer.replaceForAge !== 'boolean') {
      fieldErrors[style.id] = 'Choose Yes or No for replacement due to display time.';
    }
    const replaceForAge = answer.replaceForAge === true;
    const photoUrl = typeof answer.photoUrl === 'string' && answer.photoUrl.trim() ? answer.photoUrl.trim() : undefined;
    const needsPhoto = answer.status === 'needed' || replaceForAge;
    if (needsPhoto) {
      if (!photoUrl) fieldErrors[style.id] = 'Add a photo for a style marked Needed or Replace.';
      if (photoUrl && !isSafeVercelBlobUrl(photoUrl)) fieldErrors[style.id] = 'Upload the photo using this form before submitting.';
    } else if (photoUrl) {
      fieldErrors[style.id] = 'Remove the photo or mark the style Needed/Replace.';
    }

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
      ...(photoUrl ? { photoUrl } : {}),
      bags
    });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return invalid('Please fix the highlighted fields before submitting.', fieldErrors);
  }

  const lock = `submit:${resolved.cycleId}`;
  let lockOwner;
  try {
    lockOwner = await acquireLock(supabase, lock, 120);
  } catch {
    return json({ ok: false, error: 'The form could not save right now. Please try again in a moment.' }, 503);
  }
  if (!lockOwner) return json({ ok: false, error: 'A submission for this cycle is already being processed. Wait a moment and try again.' }, 409);

  try {
    const currentCycle = await getCycle(supabase, resolved.cycleId);
    if (!currentCycle) return invalid('This form link has expired. Please ask your manager for a fresh link.', { token: 'Cycle not found.' }, 410);

    for (const answer of normalizedAnswers) {
      if (answer.photoUrl && !await getAllowedBlob(supabase, resolved.cycleId, answer.photoUrl)) {
        fieldErrors[answer.styleId] = 'This photo was not uploaded by this form. Please upload it again.';
      }
    }
    if (Object.keys(fieldErrors).length > 0) return invalid('Please upload the required photos again.', fieldErrors);

    const previousSubmission = await getSubmission(supabase, resolved.cycleId);
    const submittedAt = new Date().toISOString();
    const neededCount = normalizedAnswers.filter((answer) => answer.status === 'needed').length;
    const replaceCount = normalizedAnswers.filter((answer) => answer.replaceForAge).length;
    const submission = {
      cycleId: resolved.cycleId,
      name,
      location,
      answers: normalizedAnswers,
      submittedAt,
      timeZone: timezone,
      isUpdated: Boolean(previousSubmission),
      neededCount,
      replaceCount,
      notNeededCount: normalizedAnswers.filter((answer) => answer.status === 'not_needed').length
    };

    try {
      await saveSubmission(supabase, resolved.cycleId, submission);
    } catch {
      return json({ ok: false, error: 'Your update could not be saved because the database is unavailable. Nothing was sent to Slack; please try again.' }, 503);
    }

    const updatedCycle = {
      ...currentCycle,
      submittedAt,
      submissionName: name,
      submissionLocation: location,
      submissionNeededCount: neededCount
    };
    let cycleWriteWarning = false;
    try {
      await saveCycle(supabase, updatedCycle);
    } catch {
      cycleWriteWarning = true;
    }

    let slackStatus = { status: 'failed', error: 'Your update was saved, but the Slack message could not be posted.' };
    try {
      const posted = await postSubmissionResult({ cycle: updatedCycle, submission, styles });
      const photoStatus = await uploadSubmissionPhotos({
        photos: posted.photos,
        channel: posted.channel,
        threadTs: posted.threadTs,
        supabase
      });
      const warning = posted.mirrorStatus === 'failed'
        ? 'The threaded update was posted, but the configured results-channel copy could not be posted.'
        : photoStatus.status === 'fallback_links'
          ? 'Some photos could not be attached as Slack files; their links were added in the thread.'
          : photoStatus.status === 'failed'
            ? 'The update was posted, but photo delivery failed. The uploaded photos remain available for retry.'
            : cycleWriteWarning
              ? 'The update was saved, but the cycle status could not be refreshed in Supabase.'
              : null;
      slackStatus = {
        status: 'posted',
        photos: photoStatus,
        resultsChannel: posted.resultChannel,
        mirrorStatus: posted.mirrorStatus,
        ...(warning ? { warning } : {})
      };
    } catch {
      slackStatus = {
        status: 'failed',
        error: 'Your update was saved, but Slack could not post it. You can safely submit again to post an updated version.'
      };
    }

    return json({
      ok: true,
      saved: true,
      updated: submission.isUpdated,
      summary: {
        neededCount,
        replaceCount,
        notNeededCount: normalizedAnswers.filter((answer) => answer.status === 'not_needed').length,
        neededStyles: normalizedAnswers.filter((answer) => answer.status === 'needed').map((answer) => ({
          styleId: answer.styleId,
          name: answer.styleName,
          bin: answer.bin,
          bags: answer.bags
        })),
        replaceStyles: normalizedAnswers.filter((answer) => answer.replaceForAge).map((answer) => ({
          styleId: answer.styleId,
          name: answer.styleName,
          bin: answer.bin,
          bags: answer.bags
        })),
        submittedAtLabel: formatDateTime(new Date(submittedAt), timezone)
      },
      slack: slackStatus,
      ...(cycleWriteWarning ? { warning: 'Submission saved; Supabase cycle metadata could not be refreshed.' } : {})
    });
  } catch {
    return json({ ok: false, error: 'The submission could not be completed because the database is temporarily unavailable. Please try again.' }, 503);
  } finally {
    await releaseLock(supabase, lock, lockOwner).catch(() => {});
  }
}
