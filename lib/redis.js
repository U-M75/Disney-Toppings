import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { RETENTION_SECONDS } from './config';

const PREFIX = 'ksc:topping-update';

export function getRedis() {
  const kvUrl = process.env.KV_REST_API_URL?.trim();
  const kvToken = process.env.KV_REST_API_TOKEN?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (kvUrl && kvToken) return new Redis({ url: kvUrl, token: kvToken });
  if (upstashUrl && upstashToken) return new Redis({ url: upstashUrl, token: upstashToken });
  throw new Error('Redis credentials are missing. Set KV_REST_API_URL and KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
}

export function cycleKey(cycleId) {
  return `${PREFIX}:cycle:${cycleId}`;
}

export function submissionKey(cycleId) {
  return `${PREFIX}:submission:${cycleId}`;
}

export function latestCycleKey() {
  return `${PREFIX}:latest-cycle`;
}

export function lockKey(kind, id) {
  return `${PREFIX}:lock:${kind}:${id}`;
}

export function blobAllowKey(url) {
  const digest = createHash('sha256').update(url).digest('hex');
  return `${PREFIX}:blob-allow:${digest}`;
}

export async function getCycle(redis, cycleId) {
  return redis.get(cycleKey(cycleId));
}

export async function saveCycle(redis, cycle, updateLatest = false) {
  await redis.set(cycleKey(cycle.cycleId), cycle, { ex: RETENTION_SECONDS });
  if (updateLatest) {
    await redis.set(latestCycleKey(), cycle.cycleId, { ex: RETENTION_SECONDS });
  }
}

export async function getSubmission(redis, cycleId) {
  return redis.get(submissionKey(cycleId));
}

export async function saveSubmission(redis, cycleId, submission) {
  await redis.set(submissionKey(cycleId), submission, { ex: RETENTION_SECONDS });
}

export async function registerBlobUrl(redis, cycleId, url) {
  await redis.set(blobAllowKey(url), { cycleId, url }, { ex: RETENTION_SECONDS });
}

export async function getAllowedBlob(redis, cycleId, url) {
  const record = await redis.get(blobAllowKey(url));
  return Boolean(record && record.cycleId === cycleId && record.url === url);
}

export async function removeAllowedBlob(redis, url) {
  await redis.del(blobAllowKey(url));
}
