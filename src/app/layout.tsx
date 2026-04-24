import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulseify - AI Song Discovery",
  description: "Spotify-inspired song recommendations powered by YouTube and adaptive AI."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
