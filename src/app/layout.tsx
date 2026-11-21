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
    <html lang="en" className="dark">
      <body className="antialiased bg-black text-neutral-100">
        {children}
      </body>
    </html>
  );
}
