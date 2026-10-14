import BrandedMessage from '../../components/BrandedMessage';
import TestConsoleClient from '../../components/TestConsoleClient';
import { isSlackTestModeEnabled } from '../../lib/test-mode';

export const dynamic = 'force-dynamic';

export default function TestConsolePage() {
  if (!isSlackTestModeEnabled()) {
    return (
      <BrandedMessage
        eyebrow="Temporary test"
        title="Test mode is off"
        message="This private testing tool is disabled. Ask an administrator to enable it only while running a Slack test."
        home={false}
      />
    );
  }
  return <TestConsoleClient />;
}
