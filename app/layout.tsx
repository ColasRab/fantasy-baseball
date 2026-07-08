import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Night Ledger Baseball",
  description: "A fantasy baseball league management sim with ballpark ledger storytelling.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
