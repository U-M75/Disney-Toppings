import { del } from '@vercel/blob';
import { getRequiredEnv, getSlackAlertMention, MAX_PHOTO_BYTES } from './config';
import { formatDateLabel, formatDateTime, formatExpiryDateTime } from './time';
import { cleanSlackText, isAllowedImageType, isSafeVercelBlobUrl } from './validation';
import { removeAllowedBlob } from './supabase';

const SLACK_API = 'https://slack.com/api';
const PINK_DIVIDER = Array(10).fill(':pinkline:').join('');

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMs(response) {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) : 1000;
}

async function slackApi(method, payload) {
  const token = getRequiredEnv('SLACK_BOT_TOKEN');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });

    if (response.status === 429 && attempt < 3) {
      await wait(retryAfterMs(response));
      continue;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok || !data?.ok) {
      const code = typeof data?.error === 'string' ? data.error : `http_${response.status}`;
      throw new Error(`Slack ${method} failed (${code}).`);
    }
    return data;
  }
  throw new Error(`Slack ${method} failed after rate-limit retries.`);
}

export async function postAlertMessage({ channel, formUrl, expiresAt }) {
  const mention = getSlackAlertMention();
  const mentionPrefix = mention ? `${mention} ` : '';
  const expiryText = formatExpiryDateTime(new Date(expiresAt));
  const title = '🍬 KSC · Topping Update';
  const detail = `${mentionPrefix}*Disney CA end-of-day bin check*\nFor Bin 1–28, tap *Yes* or *No* for “Restock Needed?” Add a photo for every bin marked *Yes*.\n_Submit by ${expiryText}._`;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: PINK_DIVIDER } },
    { type: 'section', text: { type: 'mrkdwn', text: detail } },
    {
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'Open update form', emoji: true },
        url: formUrl,
        action_id: 'open_topping_update',
        style: 'primary'
      }]
    },
    { type: 'section', text: { type: 'mrkdwn', text: PINK_DIVIDER } }
  ];
  const result = await slackApi('chat.postMessage', {
    channel,
    text: `${title}\n${PINK_DIVIDER}\n${mentionPrefix}*Disney CA end-of-day bin check* — For Bin 1–28, tap Yes or No for “Restock Needed?” Add a photo for every bin marked Yes.\n_Submit by ${expiryText}._\n${PINK_DIVIDER}`,
    blocks,
    unfurl_links: false,
    unfurl_media: false
  });
  return { ts: result.ts, channel: result.channel || channel };
}

export async function postSlackTestAlert({ channel }) {
  const title = '🧪 TEST ONLY — Topping Update';
  const result = await slackApi('chat.postMessage', {
    channel,
    text: `${title}\n${PINK_DIVIDER}\nTemporary test only. This is not a live restock request; responses are not saved.\n${PINK_DIVIDER}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: PINK_DIVIDER } },
      { type: 'section', text: { type: 'mrkdwn', text: '*Temporary test only.* This is not a live restock request. The short-lived form link will follow in this thread; bin answers are posted here but not saved. Photos are disabled.' } },
      { type: 'section', text: { type: 'mrkdwn', text: PINK_DIVIDER } }
    ],
    unfurl_links: false,
    unfurl_media: false
  });
  return { ts: result.ts, channel: result.channel || channel };
}

export async function postSlackTestFormLink({ channel, threadTs, formUrl, expiresAt }) {
  const expiryText = formatExpiryDateTime(new Date(expiresAt));
  return slackApi('chat.postMessage', {
    channel,
    thread_ts: threadTs,
    text: `${PINK_DIVIDER}\nTemporary test form link (expires ${expiryText}). <${formUrl}|Open the test form> to tap Yes or No for Restock Needed across Bin 1–28 and check the Slack summary. Responses are not saved; photos are disabled.\n${PINK_DIVIDER}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: PINK_DIVIDER } },
      { type: 'section', text: { type: 'mrkdwn', text: '*The test form is ready.* Tap Yes or No for “Restock Needed?” for Bin 1–28. _Responses are not saved; photos are disabled._' } },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Open temporary test form', emoji: true },
          url: formUrl,
          action_id: 'open_temporary_test_form',
          style: 'primary'
        }]
      },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `_Link expires ${expiryText}._` }] },
      { type: 'section', text: { type: 'mrkdwn', text: PINK_DIVIDER } }
    ],
    unfurl_links: false,
    unfurl_media: false
  });
}

export async function postReminderMessage({ channel, threadTs, formUrl }) {
  const title = '⏰ Topping Update reminder';
  const detail = `A quick reminder to complete the kiosk check. <${formUrl}|Open the update form>`;
  return slackApi('chat.postMessage', {
    channel,
    thread_ts: threadTs,
    text: `${title}\n${PINK_DIVIDER}\n${detail}\n${PINK_DIVIDER}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: PINK_DIVIDER } },
      { type: 'section', text: { type: 'mrkdwn', text: '*A quick reminder* to submit the kiosk topping check.' } },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Continue update', emoji: true },
          url: formUrl,
          action_id: 'open_reminder_topping_update',
          style: 'primary'
        }]
      },
      { type: 'section', text: { type: 'mrkdwn', text: PINK_DIVIDER } }
    ],
    unfurl_links: false,
    unfurl_media: false
  });
}

function packLines(lines, maxCharacters = 2800, separator = '\n') {
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const candidate = current ? `${current}${separator}${line}` : line;
    if (candidate.length > maxCharacters && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function headerText(text) {
  return Array.from(text).slice(0, 150).join('');
}

export function buildResultMessage({ submission, bins, testMode = false }) {
  const answers = submission.answers;
  const needed = answers.filter((answer) => answer.status === 'needed');
  const notNeeded = answers.filter((answer) => answer.status === 'not_needed');
  const timezone = submission.timeZone;
  const submittedAt = new Date(submission.submittedAt);
  const location = cleanSlackText(submission.location);
  const date = formatDateLabel(submittedAt, timezone);
  const binLabels = new Map(bins.map((bin) => [bin.number, bin.label]));
  const getLabel = (answer) => cleanSlackText(binLabels.get(answer.bin) || `Bin ${answer.bin}`);
  const submitter = cleanSlackText(submission.name);
  const submittedAtLabel = formatDateTime(submittedAt, timezone);
  const isUpdated = Boolean(submission.isUpdated);
  const title = headerText(testMode
    ? `🧪 TEST ONLY · ${location} · ${date}`
    : `${isUpdated ? '♻️ Updated Topping Update' : '🧁 Topping Update'} · ${location} · ${date}`);

  const bodyLines = [];
  if (isUpdated) bodyLines.push('_♻️ Updated submission — replaces the previous bin check._');
  bodyLines.push(`*Submitted by* *${submitter}* · _${submittedAtLabel}_`);
  bodyLines.push(`*Summary* · 🔴 *${needed.length} Need Restock* · ✅ *${notNeeded.length} No Restock*`);
  if (needed.length) {
    bodyLines.push('*Marked Yes — Restock Needed*');
    bodyLines.push(...needed.map((answer) => `• *${getLabel(answer)}*`));
  } else {
    bodyLines.push('✅ *No bins need restocking.*');
  }

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: PINK_DIVIDER } },
    ...packLines(bodyLines, 2500).map((chunk) => ({ type: 'section', text: { type: 'mrkdwn', text: chunk } }))
  ];

  const plainTableCell = (value) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
  const sortedAnswers = [...answers].sort((a, b) => a.bin - b.bin);
  blocks.push({
    type: 'table',
    column_settings: [
      { is_wrapped: false },
      { is_wrapped: false },
      { is_wrapped: false }
    ],
    rows: [
      ['Bin', 'Restock Needed?', 'Photo'].map((text) => ({ type: 'raw_text', text })),
      ...sortedAnswers.map((answer) => [
        { type: 'raw_text', text: plainTableCell(getLabel(answer)) },
        { type: 'raw_text', text: answer.status === 'needed' ? 'Yes' : 'No' },
        { type: 'raw_text', text: answer.photoUrl ? 'Attached' : '—' }
      ])
    ]
  });
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: PINK_DIVIDER } });

  const inventoryLines = sortedAnswers.map((answer) =>
    `${plainTableCell(getLabel(answer))} | Restock Needed: ${answer.status === 'needed' ? 'Yes' : 'No'} | Photo: ${answer.photoUrl ? 'Attached' : '—'}`
  );
  const fallbackText = [
    title,
    PINK_DIVIDER,
    `Submitted by ${submitter} · ${submittedAtLabel}`,
    `Summary: ${needed.length} Need Restock · ${notNeeded.length} No Restock`,
    ...inventoryLines,
    PINK_DIVIDER
  ].join('\n');
  const photos = answers
    .filter((answer) => answer.photoUrl)
    .map((answer) => ({ photoUrl: answer.photoUrl, binLabel: getLabel(answer) }));

  return { blocks: blocks.slice(0, 50), text: fallbackText.slice(0, 2900), needed, notNeeded, photos };
}

function safeFilenamePart(value) {
  return String(value || 'topping')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'topping';
}

async function fetchBlobBytes(url) {
  if (!isSafeVercelBlobUrl(url)) throw new Error('Photo URL is not from the Vercel Blob store.');
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Photo download returned HTTP ${response.status}.`);
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!isAllowedImageType(contentType)) throw new Error('Photo is not an allowed image type.');
  const announcedSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(announcedSize) && announcedSize > MAX_PHOTO_BYTES) {
    throw new Error('Photo exceeds the 5 MB limit.');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) throw new Error('Photo is empty or exceeds the 5 MB limit.');
  return { bytes, contentType };
}

async function postFileBytes(uploadUrl, bytes, contentType) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: bytes,
      cache: 'no-store'
    });
    if (response.status === 429 && attempt < 3) {
      await wait(retryAfterMs(response));
      continue;
    }
    if (!response.ok) throw new Error(`Slack file byte upload returned HTTP ${response.status}.`);
    return;
  }
  throw new Error('Slack file byte upload failed after rate-limit retries.');
}

async function prepareSlackFile(photo, index) {
  const { bytes, contentType } = await fetchBlobBytes(photo.photoUrl);
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : contentType === 'image/heic' ? 'heic' : 'jpg';
  const title = String(photo.binLabel || 'Bin photo').slice(0, 120);
  const filename = `${safeFilenamePart(photo.binLabel)}-${index + 1}.${extension}`;
  const upload = await slackApi('files.getUploadURLExternal', { filename, length: bytes.length });
  if (!upload.upload_url || !upload.file_id) throw new Error('Slack did not return a file upload URL.');
  await postFileBytes(upload.upload_url, bytes, contentType);
  return { id: upload.file_id, title, photo };
}

async function mapWithConcurrency(items, concurrency, handler) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, value: await handler(items[index], index) };
      } catch {
        results[index] = { ok: false, item: items[index] };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function postPhotoFallback({ channel, threadTs, photos }) {
  if (photos.length === 0) return true;
  const lines = photos.map((photo) => `• <${photo.photoUrl}|${cleanSlackText(photo.binLabel || 'Bin photo')}>`);
  const chunks = packLines(lines, 2700);
  for (const chunk of chunks) {
    await slackApi('chat.postMessage', {
      channel,
      thread_ts: threadTs,
      text: `${PINK_DIVIDER}\n*Photo links* _· native photo attachment unavailable_\n${chunk}\n${PINK_DIVIDER}`,
      unfurl_links: false,
      unfurl_media: false
    });
  }
  return true;
}

export async function uploadSubmissionPhotos({ photos, channel, threadTs, supabase }) {
  if (!photos.length) return { status: 'not_needed', uploadedCount: 0, fallbackCount: 0 };

  const fallbackPhotos = [];
  let uploadedCount = 0;
  let cleanupWarning = false;

  for (let start = 0; start < photos.length; start += 10) {
    const batch = photos.slice(start, start + 10);
    const prepared = await mapWithConcurrency(batch, 4, (photo, index) => prepareSlackFile(photo, start + index));
    const ready = prepared.filter((result) => result.ok).map((result) => result.value);
    prepared.filter((result) => !result.ok).forEach((result) => fallbackPhotos.push(result.item));

    if (ready.length === 0) continue;
    try {
      await slackApi('files.completeUploadExternal', {
        files: ready.map(({ id, title }) => ({ id, title })),
        channel_id: channel,
        thread_ts: threadTs
      });
      uploadedCount += ready.length;
      await Promise.all(ready.map(async ({ photo }) => {
        try {
          await del(photo.photoUrl);
          await removeAllowedBlob(supabase, photo.photoUrl);
        } catch {
          cleanupWarning = true;
        }
      }));
    } catch {
      ready.forEach(({ photo }) => fallbackPhotos.push(photo));
    }
  }

  let fallbackPosted = false;
  if (fallbackPhotos.length > 0) {
    try {
      await postPhotoFallback({ channel, threadTs, photos: fallbackPhotos });
      fallbackPosted = true;
    } catch {
      fallbackPosted = false;
    }
  }

  let status = 'attached';
  if (uploadedCount === 0 && fallbackPhotos.length === 0) status = 'failed';
  else if (fallbackPhotos.length > 0 && fallbackPosted) status = 'fallback_links';
  else if (fallbackPhotos.length > 0) status = 'failed';
  return {
    status,
    uploadedCount,
    fallbackCount: fallbackPhotos.length,
    fallbackPosted,
    cleanupWarning
  };
}

export async function postSubmissionResult({ cycle, submission, bins }) {
  const threadChannel = cycle.alertChannel || getRequiredEnv('SLACK_ALERT_CHANNEL_ID');
  if (!cycle.alertTs) throw new Error('The alert thread is unavailable for this cycle.');
  const resultChannel = process.env.SLACK_RESULTS_CHANNEL_ID?.trim() || threadChannel;
  const message = buildResultMessage({ submission, bins });
  const posted = await slackApi('chat.postMessage', {
    channel: threadChannel,
    thread_ts: cycle.alertTs,
    reply_broadcast: true,
    text: message.text,
    blocks: message.blocks,
    unfurl_links: false,
    unfurl_media: false
  });

  let mirrorStatus = 'not_needed';
  if (resultChannel !== threadChannel) {
    try {
      await slackApi('chat.postMessage', {
        channel: resultChannel,
        text: message.text,
        blocks: message.blocks,
        unfurl_links: false,
        unfurl_media: false
      });
      mirrorStatus = 'posted';
    } catch {
      mirrorStatus = 'failed';
    }
  }
  return {
    channel: posted.channel || threadChannel,
    threadTs: cycle.alertTs,
    messageTs: posted.ts,
    photos: message.photos,
    mirrorStatus,
    resultChannel
  };
}

export async function postSlackTestSubmission({ cycle, submission, bins }) {
  const message = buildResultMessage({ submission, bins, testMode: true });
  const posted = await slackApi('chat.postMessage', {
    channel: cycle.alertChannel,
    thread_ts: cycle.alertTs,
    reply_broadcast: true,
    text: message.text,
    blocks: message.blocks,
    unfurl_links: false,
    unfurl_media: false
  });
  return { channel: posted.channel || cycle.alertChannel, threadTs: cycle.alertTs, messageTs: posted.ts };
}
