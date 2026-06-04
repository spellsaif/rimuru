import type { Metadata } from "next";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import "fumadocs-ui/style.css";
import "./global.css";

export const metadata: Metadata = {
  title: {
    default: "Rimuru - Local-first AI assistant platform",
    template: "%s | Rimuru",
  },
  description:
    "Rimuru is a safe, auditable local-first AI assistant platform with Gate, Runes, Circles, memory, traces, plugins, and a sky-blue slime soul.",
  metadataBase: new URL("https://rimuru.local"),
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider theme={{ defaultTheme: "dark" }}>{children}</RootProvider>
      </body>
    </html>
  );
}
