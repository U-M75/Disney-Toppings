import BrandedMessage from '../components/BrandedMessage';

export default function HomePage() {
  return (
    <BrandedMessage
      eyebrow="Kawaii Slime Company"
      title="This page is for the KSC Disney team"
      message="Topping check-ins are opened from the private link shared in the Disney team Slack channel. Please use that link to send an update."
      home={false}
    />
  );
}
