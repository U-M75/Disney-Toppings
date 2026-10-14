import { Nunito } from 'next/font/google';
import './globals.css';

const appFont = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap'
});

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
      <body className={appFont.variable}>{children}</body>
    </html>
  );
}
