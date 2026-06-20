import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NexaBuy — Purchase Copilot',
  description: 'Know if the price is good, watch it for drops, see the trend, and get out cleanly if you change your mind.',
  keywords: 'price comparison, deal finder, price tracker, shopping assistant',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
