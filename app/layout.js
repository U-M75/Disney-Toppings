import './globals.css';

export const metadata = {
  title: 'KSC Disney Topping Update',
  description: 'A concise KSC kiosk topping check-in for the Disney team.',
  applicationName: 'KSC Disney Topping Update'
};

export const viewport = {
  themeColor: '#FFA8BD'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body>{children}</body>
    </html>
  );
}
