import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], display: "swap", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Contract Dashboard · The Engineers Club", template: "%s · The Engineers Club" },
  description: "Membership contracts for The Engineers Club.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#faf9f7" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
