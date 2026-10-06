import { siteConfig } from "@/config/site";

/**
 * Seamless infinite teaser marquee. Two identical halves; the track slides exactly
 * one half (-50%) and loops, so there's never a visible jump. Pure CSS — no JS.
 * Screen readers get the message once; the repeats are aria-hidden.
 */
export function BottomMarquee() {
  const msg = siteConfig.teaserMessage;
  return (
    <div className="teaser" role="marquee" aria-label={msg}>
      <div className="teaser__track" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="teaser__item">{msg}</span>
        ))}
      </div>
    </div>
  );
}
