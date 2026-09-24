import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AI Lead Intelligence & Outreach Pipeline",
    template: "%s · Lead Intelligence",
  },
  description: "Turns raw business leads into structured, evidence-backed lead intelligence.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
