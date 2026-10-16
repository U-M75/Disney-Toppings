import { getAppTimezone, getBins, getLocations } from '../../../lib/config';
import { acquireLock, getCycle, getSubmission, getAllowedBlob, getSupabase, releaseLock, saveCycle, saveSubmission } from '../../../lib/supabase';
import { resolveFormToken } from '../../../lib/token';
import { cleanPersonName, isSafeVercelBlobUrl } from '../../../lib/validation';
import { normalizeBinAnswers } from '../../../lib/bin-submission';
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

  let bins;
  let locations;
  let timezone;
  try {
    bins = getBins();
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

  const normalized = normalizeBinAnswers(body.answers, bins);
  Object.assign(fieldErrors, normalized.fieldErrors);
  const normalizedAnswers = normalized.answers;
  for (const answer of normalizedAnswers) {
    if (answer.photoUrl && !isSafeVercelBlobUrl(answer.photoUrl)) {
      fieldErrors[answer.binId] = 'Upload the photo using this form before submitting.';
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return invalid('Answer Yes or No for every bin and upload a photo for each Yes.', fieldErrors);
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
        fieldErrors[answer.binId] = 'This photo was not uploaded by this form. Please upload it again.';
      }
    }
    if (Object.keys(fieldErrors).length > 0) return invalid('Please upload the required photos again.', fieldErrors);

    const previousSubmission = await getSubmission(supabase, resolved.cycleId);
    const submittedAt = new Date().toISOString();
    const neededCount = normalizedAnswers.filter((answer) => answer.status === 'needed').length;
    const notNeededCount = normalizedAnswers.filter((answer) => answer.status === 'not_needed').length;
    const submission = {
      cycleId: resolved.cycleId,
      name,
      location,
      answers: normalizedAnswers,
      submittedAt,
      timeZone: timezone,
      isUpdated: Boolean(previousSubmission),
      neededCount,
      notNeededCount
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
      const posted = await postSubmissionResult({ cycle: updatedCycle, submission, bins });
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
        notNeededCount,
        neededBins: normalizedAnswers.filter((answer) => answer.status === 'needed').map((answer) => answer.bin),
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
