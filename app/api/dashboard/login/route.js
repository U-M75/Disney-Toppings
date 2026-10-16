import { createDashboardSession, DASHBOARD_COOKIE_NAME, DASHBOARD_SESSION_SECONDS, isDashboardSecretConfigured, verifyDashboardPassword } from '../../../../lib/dashboard-auth';

export const dynamic = 'force-dynamic';

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export async function POST(request) {
  if (!isDashboardSecretConfigured()) {
    return json({ ok: false, error: 'Manager dashboard access is not configured.' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'The sign-in request was not valid.' }, 400);
  }

  let accepted = false;
  try {
    accepted = verifyDashboardPassword(body?.password);
  } catch {
    accepted = false;
  }
  if (!accepted) return json({ ok: false, error: 'The dashboard password was not accepted.' }, 401);

  const session = createDashboardSession();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const cookie = `${DASHBOARD_COOKIE_NAME}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DASHBOARD_SESSION_SECONDS}${secure}`;
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}
