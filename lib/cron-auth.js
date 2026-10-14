export function checkCronAuthorization(request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return { configured: false, authorized: false };
  return {
    configured: true,
    authorized: request.headers.get('authorization') === `Bearer ${secret}`
  };
}
