import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rimuru | Sovereign Assistant",
  description: "The premium AI assistant for sovereign developers.",
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
