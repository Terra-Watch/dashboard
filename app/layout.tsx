import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Inter, Geist_Mono } from 'next/font/google';
import { LenisProvider } from '@/components/providers/LenisProvider';
import './globals.css';

// ─── Fonts ───────────────────────────────────────────────────────────────────

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

// ─── Metadata ────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'Jalri — Every Voyage Deserves a Safe Return',
  description:
    'AI-assisted maritime safety platform for fishermen operating beyond cellular coverage. LoRa mesh networking, smart wearables, real-time fleet monitoring.',
  keywords: [
    'maritime safety',
    'fishing boat',
    'LoRa',
    'mesh network',
    'maritime IoT',
    'fishermen safety',
    'offshore monitoring',
    'fleet dashboard',
  ],
  authors: [{ name: 'Jalri' }],
  openGraph: {
    title: 'Jalri — Maritime Safety Platform',
    description: 'Every Voyage Deserves a Safe Return.',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jalri — Maritime Safety Platform',
    description: 'Every Voyage Deserves a Safe Return.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#030D1B',
  width: 'device-width',
  initialScale: 1,
};

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${geistMono.variable}`}
    >
      <body className="bg-[var(--c-navy)] text-[var(--c-white)] antialiased overflow-x-hidden">
        <LenisProvider>{children}</LenisProvider>
      </body>
    </html>
  );
}
