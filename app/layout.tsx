import type { Metadata, Viewport } from "next";
import { Archivo, Instrument_Serif, Lobster, Yellowtail } from "next/font/google";
import { siteConfig, siteDescription } from "@/config/site";
import "@/styles/base.css";
import "@/styles/fonts.css";
import "@/styles/landing.css";
import "@/styles/burger.css";
import "@/styles/booking.css";
import "@/styles/admin.css";

const display = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-sans",
  display: "swap",
});
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["italic"],
  variable: "--font-serif",
  display: "swap",
});

// Free (OFL) STAND-IN script fonts. The licensed Sloop Script Pro / Boardley Script take over
// automatically as soon as their files are added to /public/fonts (see public/fonts/README.md).
const standInCheese = Yellowtail({ subsets: ["latin"], weight: "400", variable: "--font-standin-cheese", display: "swap" });
const standInNashville = Lobster({ subsets: ["latin"], weight: "400", variable: "--font-standin-nashville", display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteConfig.siteTitle, template: `%s | ${siteConfig.brandName}` },
  description: siteDescription,
  applicationName: siteConfig.cafeName,
  openGraph: {
    type: "website",
    siteName: siteConfig.cafeName,
    title: siteConfig.siteTitle,
    description: siteDescription,
    locale: "en_IN",
    url: "/",
  },
  twitter: { card: "summary_large_image", title: siteConfig.siteTitle, description: siteDescription },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${display.variable} ${serif.variable} ${standInCheese.variable} ${standInNashville.variable}`}>
      <body>{children}</body>
    </html>
  );
}
