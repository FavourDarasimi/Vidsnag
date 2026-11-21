import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'vidsnag — Video Downloader',
  description: 'Fast, secure video and audio downloader powered by yt-dlp and ffmpeg',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}
