import { Fredoka, Nunito } from 'next/font/google';
import './globals.css';

const headingFont = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-heading',
  display: 'swap'
});

const bodyFont = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap'
});

export const metadata = {
  title: 'KSC Disney Topping Update',
  description: 'A friendly KSC kiosk topping check-in for the Disney team.',
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
      <body className={`${headingFont.variable} ${bodyFont.variable}`}>{children}</body>
    </html>
  );
}
