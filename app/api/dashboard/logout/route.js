import { DASHBOARD_COOKIE_NAME } from '../../../../lib/dashboard-auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const cookie = `${DASHBOARD_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': cookie } });
}
