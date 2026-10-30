import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">Tower Arctic Ltd</p>
              <p className="mt-1 font-heading text-xl tracking-tight">Crew Logistics</p>
            </div>
            <p className="text-xs text-muted-foreground">Pilot · local</p>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 sm:px-8">{children}</main>
      </body>
    </html>
  );
}
