import type { Metadata } from "next";
import { Inter_Tight, IBM_Plex_Mono, Archivo_Narrow } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet/WalletProvider";
import { SiteHeader } from "@/components/layout/SiteHeader";

const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });
const archivoNarrow = Archivo_Narrow({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-archivo-narrow", display: "swap" });

export const metadata: Metadata = {
  title: "Failover — Release-Integrity Emergency Gate",
  description:
    "A public-frontend and release-integrity emergency gate for autonomous apps, backed by GenLayer consensus.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} ${plexMono.variable} ${archivoNarrow.variable}`}>
      <body>
        <WalletProvider>
          <SiteHeader />
          <main id="main-content">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
