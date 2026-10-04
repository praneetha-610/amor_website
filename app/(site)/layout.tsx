import { DemoBanner } from "@/components/DemoBanner";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { BottomCta } from "@/components/BottomCta";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <DemoBanner />
      <Nav />
      <main id="main">{children}</main>
      <Footer />
      <BottomCta />
    </>
  );
}
