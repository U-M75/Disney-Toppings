import BrandedMessage from '../components/BrandedMessage';

export default function NotFound() {
  return (
    <BrandedMessage
      eyebrow="KSC Disney team"
      title="Oops, this page wandered off"
      message="That page could not be found. Please open the topping update from the latest link in Slack."
    />
  );
}
