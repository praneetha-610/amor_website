import type { Metadata } from "next";
import { BurgerPage } from "@/components/BurgerPage";
import { getBurger, siteConfig } from "@/config/site";
import { getHeadlineLimits } from "@/lib/capacity-server";

export const dynamic = "force-dynamic";
const b = getBurger("nashville");
const title = b.name.split(" ").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");

export async function generateMetadata(): Promise<Metadata> {
  const limit = (await getHeadlineLimits()).nashville; // live, admin-editable
  return {
    title: { absolute: `${title} — ${limit} a day | ${siteConfig.brandName}` },
    description: `${b.tagline} Only ${limit} ${title}s a day at ${siteConfig.cafeName}, ${siteConfig.city}. Reserve yours before you arrive.`,
    alternates: { canonical: b.path },
    openGraph: { url: b.path, title: `${title} | ${siteConfig.brandName}` },
  };
}

export default function Page() {
  return <BurgerPage burger="nashville" />;
}
