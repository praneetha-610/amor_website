import { publicStrip, type PublicScarcity } from "@/lib/scarcity";

/**
 * Scarcity Control on the public booking page: the live count of burgers customers can book, plus the owner's message.
 * Used by the booking form and by the admin's live preview, so what the owner previews is exactly what customers get.
 * Renders nothing when scarcity mode is OFF. It only ever receives the public number — never the held-back stock.
 */
export function ScarcityStrip({ scarcity, remaining, className = "" }: { scarcity: PublicScarcity; remaining: number; className?: string }) {
  const s = publicStrip(scarcity, remaining);
  if (!s) return null;
  return (
    <div className={`scarce ${className}`} data-urgent={s.urgent || undefined} data-soldout={s.soldOut || undefined} role="status" aria-live="polite">
      <span className="scarce__dot" aria-hidden />
      <div className="scarce__text">
        {/* key = the number, so the line re-mounts (and fades in once) every time the count changes */}
        <p className="scarce__count" key={s.headline}>{s.headline}</p>
        {s.message && <p className="scarce__msg">{s.message}</p>}
      </div>
    </div>
  );
}
