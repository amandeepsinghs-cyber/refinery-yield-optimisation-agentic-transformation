import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/shell/Providers";
import AppShell from "@/components/shell/AppShell";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

const sans = DM_Sans({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "FCC Decision Cockpit", template: "%s · FCC Decision Cockpit" },
  description:
    "FCC soft-sensor Decision Cockpit: probabilistic LCO/HN T98 estimates, spread gate, recommendations and model health on simulated data.",
};

export const viewport: Viewport = {
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Sets data-theme before first paint: no flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
