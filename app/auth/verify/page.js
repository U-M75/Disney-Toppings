import OtpVerifyClient from '../../../components/OtpVerifyClient';

export const dynamic = 'force-dynamic';

export default function VerifySlackCodePage({ searchParams }) {
  const challengeId = typeof searchParams?.challenge === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(searchParams.challenge)
    ? searchParams.challenge
    : '';
  return <OtpVerifyClient challengeId={challengeId} />;
}
