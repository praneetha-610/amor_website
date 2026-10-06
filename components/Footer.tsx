import Link from "next/link";
import { siteConfig } from "@/config/site";
import { BottomMarquee } from "./BottomMarquee";

export function Footer() {
  const { location, phoneNumber, phoneTel, instagramURL, instagramHandle } = siteConfig;
  return (
    <footer className="footer">
      <div className="wrap footer__grid">
        <div>
          <p className="footer__logo">{siteConfig.brandName}</p>
          <p className="muted">{siteConfig.cafeName}, {siteConfig.city}</p>
          <p className="muted footer__hours">Open daily · {location.hours}</p>
        </div>
        <nav aria-label="Footer" className="footer__links">
          <Link href="/#drops">The Drops</Link>
          <Link href="/my-reservation">My reservation</Link>
          <a href={`tel:${phoneTel}`}>{phoneNumber}</a>
          <a href={instagramURL} target="_blank" rel="noopener noreferrer">{instagramHandle}</a>
        </nav>
      </div>
      <div className="wrap footer__fine">
        <span>© {new Date().getFullYear()} {siteConfig.cafeName}. {siteConfig.dailyLimit} only. Every day.</span>
      </div>
      <BottomMarquee />
    </footer>
  );
}
