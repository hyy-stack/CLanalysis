import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Anrok Deal Analyzer',
  description: 'Automated deal analysis with Gong, Claude, and Slack',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

