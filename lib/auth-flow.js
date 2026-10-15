import { getSupabase } from './supabase';
import { resolveFormToken } from './token';
import { isSlackTestModeEnabled, verifySlackTestFormToken } from './test-mode';

export async function validateAuthReturnTo(purpose, returnTo) {
  if (
    !['staff', 'test_console'].includes(purpose) ||
    typeof returnTo !== 'string' ||
    returnTo.length > 2600 ||
    !returnTo.startsWith('/') ||
    returnTo.startsWith('//') ||
    returnTo.includes('\\') ||
    returnTo.includes('?') ||
    returnTo.includes('#')
  ) return false;

  if (purpose === 'staff') {
    const match = returnTo.match(/^\/f\/([^/]+)$/);
    if (!match) return false;
    try {
      const resolved = await resolveFormToken(match[1], getSupabase());
      return Boolean(resolved?.ok);
    } catch {
      return false;
    }
  }

  if (!isSlackTestModeEnabled()) return false;
  if (returnTo === '/test-console') return true;
  const match = returnTo.match(/^\/test-form\/([^/]+)$/);
  if (!match) return false;
  return Boolean(verifySlackTestFormToken(match[1])?.ok);
}
