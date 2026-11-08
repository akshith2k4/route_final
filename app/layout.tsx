import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./styles/maps.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LinenGrass — Bengaluru Coverage Atlas",
  description:
    "Interactive coverage map of 102 hotels across five LinenGrass operational regions in Bengaluru.",
};

export const viewport: Viewport = {
  themeColor: "#F0EBDD",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${instrumentSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
