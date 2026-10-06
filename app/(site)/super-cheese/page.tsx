import type { Metadata } from "next";
import { BurgerPage } from "@/components/BurgerPage";
import { getBurger, siteConfig } from "@/config/site";

export const dynamic = "force-dynamic";
const b = getBurger("cheese");
const title = b.name.split(" ").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");

export const metadata: Metadata = {
  title: { absolute: `${title} — ${b.dailyLimit} a day | ${siteConfig.brandName}` },
  description: `${b.tagline} Only ${b.dailyLimit} ${title}s a day at ${siteConfig.cafeName}, ${siteConfig.city}. Reserve yours before you arrive.`,
  alternates: { canonical: b.path },
  openGraph: { url: b.path, title: `${title} | ${siteConfig.brandName}` },
};

export default function Page() {
  return <BurgerPage burger="cheese" />;
}
