import Link from "next/link";
import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer__grid">
        <div>
          <p className="footer__logo">{siteConfig.brandName}</p>
          <p className="muted">{siteConfig.cafeName}, {siteConfig.city}</p>
        </div>
        <nav aria-label="Footer" className="footer__links">
          <Link href="/#drops">The Drops</Link>
          <Link href="/my-reservation">My reservation</Link>
          <a href={siteConfig.instagramURL} target="_blank" rel="noopener noreferrer">{siteConfig.instagramHandle}</a>
        </nav>
      </div>
      <div className="wrap footer__fine">
        <span>© {new Date().getFullYear()} {siteConfig.cafeName}. 30 only. Every day.</span>
      </div>
    </footer>
  );
}
