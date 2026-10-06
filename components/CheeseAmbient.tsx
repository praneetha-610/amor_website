/**
 * Slow, ambient molten-cheese glow along the top edge of the Super Cheese hero —
 * the sunny counterpart to Nashville's flames. Soft amber drips gently lengthen and
 * retract on long, offset loops. Blurred as a group, transform-only animation, behind
 * the content, pointer-events none. Static for prefers-reduced-motion.
 */
const DRIPS = [
  { x: 5, w: 46, h: 92, t: 9, d: 0 },
  { x: 16, w: 62, h: 150, t: 11, d: -3 },
  { x: 27, w: 40, h: 78, t: 8, d: -5.5 },
  { x: 38, w: 70, h: 170, t: 12, d: -1.5 },
  { x: 50, w: 48, h: 105, t: 9.5, d: -7 },
  { x: 61, w: 66, h: 160, t: 11.5, d: -4 },
  { x: 72, w: 42, h: 84, t: 8.5, d: -6 },
  { x: 83, w: 64, h: 140, t: 10.5, d: -2 },
  { x: 94, w: 44, h: 96, t: 9, d: -8 },
];

export function CheeseAmbient() {
  return (
    <div className="cheese-amb" aria-hidden>
      <div className="cheese-amb__glow" />
      <div className="cheese-amb__drips">
        {DRIPS.map((d, i) => (
          <i key={i} style={{ "--x": `${d.x}%`, "--w": `${d.w}px`, "--h": `${d.h}px`, "--t": `${d.t}s`, "--delay": `${d.d}s` } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}
