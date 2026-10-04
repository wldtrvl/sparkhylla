import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Golos_Text, Literata } from "next/font/google";
import "./globals.css";

// Self-hosted by next/font: no request to Google at runtime, no layout shift on swap.
// Only the first-screen faces are preloaded (UI text is Russian, headings mostly Norwegian);
// other subsets and the reading face load on demand via unicode-range when a page uses them.
const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"], variable: "--font-display" });
const read = Literata({ subsets: ["latin"], weight: ["400", "600"], style: ["normal", "italic"], variable: "--font-read", preload: false });
const ui = Golos_Text({ subsets: ["cyrillic"], variable: "--font-ui" });

export const metadata: Metadata = {
  title: "Språkhylla",
  description: "Домашняя языковая библиотека: норвежский и английский",
};

export const viewport: Viewport = { themeColor: "#2e4a3b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${display.variable} ${read.variable} ${ui.variable}`}>
      <body>{children}</body>
    </html>
  );
}
