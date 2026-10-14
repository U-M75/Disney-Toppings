import { getAppTimezone } from './config';

function partsMap(date, options, timeZone = getAppTimezone()) {
  const parts = new Intl.DateTimeFormat('en-US', { ...options, timeZone }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

export function getPacificDateKey(date = new Date(), timeZone = getAppTimezone()) {
  const parts = partsMap(date, { year: 'numeric', month: '2-digit', day: '2-digit' }, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getPacificWeekday(date = new Date(), timeZone = getAppTimezone()) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(date);
}

export function getCycleLabel(date = new Date(), timeZone = getAppTimezone()) {
  return `${getPacificWeekday(date, timeZone)} night`;
}

export function getZonedWeekdayHour(date = new Date(), timeZone = getAppTimezone()) {
  const parts = partsMap(date, { weekday: 'short', hour: '2-digit', hourCycle: 'h23' }, timeZone);
  return { weekday: parts.weekday, hour: Number(parts.hour) };
}

export function isSendPacificWindow(date = new Date(), timeZone = getAppTimezone()) {
  const { weekday, hour } = getZonedWeekdayHour(date, timeZone);
  return ['Thu', 'Sun'].includes(weekday) && hour === 23;
}

export function isReminderPacificWindow(date = new Date(), timeZone = getAppTimezone()) {
  const { weekday, hour } = getZonedWeekdayHour(date, timeZone);
  return ['Fri', 'Mon'].includes(weekday) && hour === 8;
}

export function formatDateLabel(date = new Date(), timeZone = getAppTimezone()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

export function formatDateTime(date = new Date(), timeZone = getAppTimezone()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}

export function formatExpiryDateTime(date = new Date(), timeZone = getAppTimezone()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}

export function formatDateKeyLabel(dateKey, timeZone = getAppTimezone()) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return dateKey;
  return formatDateLabel(date, timeZone);
}
