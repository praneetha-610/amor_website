import type { Metadata } from "next";
import { BurgerPage } from "@/components/BurgerPage";
import { getBurger, siteConfig } from "@/config/site";

export const dynamic = "force-dynamic";
const b = getBurger("nashville");

export const metadata: Metadata = {
  title: { absolute: `Nashville Fried Chicken Burger — ${b.dailyLimit} a day | ${siteConfig.brandName}` },
  description: `${b.tagline} Only ${b.dailyLimit} Nashville Fried Chicken Burgers a day at ${siteConfig.cafeName}, ${siteConfig.city}. Reserve yours before you arrive.`,
  alternates: { canonical: b.path },
  openGraph: { url: b.path, title: `Nashville Fried Chicken Burger | ${siteConfig.brandName}` },
};

export default function Page() {
  return <BurgerPage burger="nashville" />;
}
