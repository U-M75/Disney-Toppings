import { cookies } from 'next/headers';
import BrandedMessage from '../../components/BrandedMessage';
import DashboardClient from '../../components/DashboardClient';
import DashboardLogin from '../../components/DashboardLogin';
import { DASHBOARD_COOKIE_NAME, isDashboardSecretConfigured, verifyDashboardSession } from '../../lib/dashboard-auth';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  if (!isDashboardSecretConfigured()) {
    return (
      <BrandedMessage
        eyebrow="Manager dashboard setup"
        title="Dashboard access is not configured"
        message="An administrator needs to set DASHBOARD_SECRET in the hosting environment and redeploy. Do not send the secret in chat."
        home={false}
      />
    );
  }

  const session = cookies().get(DASHBOARD_COOKIE_NAME)?.value;
  if (!verifyDashboardSession(session)) return <DashboardLogin />;
  return <DashboardClient />;
}
