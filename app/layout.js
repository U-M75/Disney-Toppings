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
        <link rel="preload" href="/fonts/quicksand-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/nunito-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
