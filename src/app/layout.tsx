import type { Metadata, Viewport } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { CrewAppShell } from "@/components/crew-app-shell";
import "./globals.css";

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: {
    default: "Crew Logistics",
    template: "%s · Crew Logistics",
  },
  description: "Tower Arctic crew rotations, travel, and site assignments.",
};

// Phones: fit the screen, no pinch-zoom on tap, room for the notch and home bar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <CrewAppShell>{children}</CrewAppShell>
      </body>
    </html>
  );
}
