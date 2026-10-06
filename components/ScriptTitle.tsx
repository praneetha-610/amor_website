import type { BurgerKey } from "@/config/site";

/**
 * Decorative script rendering of the burger title (the real <h1> text stays in the DOM for
 * screen readers/SEO — this is aria-hidden). Uses the licensed font when its files exist, otherwise a free stand-in script.
 */
export function ScriptTitle({ burger, text }: { burger: BurgerKey; text: string }) {
  if (burger === "cheese") {
    return <span className="script script--sloop" aria-hidden>{text}</span>;
  }
  return (
    <span className="script script--boardley" aria-hidden>
      <span className="layer layer--extrude">{text}</span>
      <span className="layer layer--base">{text}</span>
    </span>
  );
}
