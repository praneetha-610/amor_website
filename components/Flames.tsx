/**
 * Slow, ambient flame glow along the top edge of the Nashville hero.
 * Blurred, additive-blended tongues animate only transform + opacity (cheap on mobile).
 * Sits behind the content (z-index 0); pointer-events none. Static for prefers-reduced-motion.
 */
const TONGUES = [
  { x: 4, w: 150, h: 120, t: 4.2, d: 0 },
  { x: 15, w: 190, h: 170, t: 5.6, d: -1.2 },
  { x: 27, w: 140, h: 110, t: 3.8, d: -2.4 },
  { x: 39, w: 210, h: 190, t: 6.1, d: -0.6 },
  { x: 52, w: 160, h: 130, t: 4.6, d: -3.1 },
  { x: 63, w: 200, h: 175, t: 5.9, d: -1.8 },
  { x: 75, w: 150, h: 120, t: 4.0, d: -2.9 },
  { x: 87, w: 190, h: 165, t: 5.3, d: -0.9 },
  { x: 97, w: 140, h: 110, t: 4.4, d: -3.6 },
];

export function Flames() {
  return (
    <div className="flames" aria-hidden>
      <div className="flames__glow" />
      {TONGUES.map((f, i) => (
        <i
          key={i}
          style={{ "--x": `${f.x}%`, "--w": `${f.w}px`, "--h": `${f.h}px`, "--t": `${f.t}s`, "--delay": `${f.d}s` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
