import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay | Guided Tech Support",
  description: "Your private workspace for computer and connectivity troubleshooting.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
