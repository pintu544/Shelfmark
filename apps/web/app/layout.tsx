import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Shelfmark — Your personal library",
    template: "%s · Shelfmark",
  },
  description:
    "A calm, private place to collect books, track your reading, and rediscover favorite authors.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4efe5",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
