"use client";

import { useState } from "react";

/**
 * Molten cheese that drips from the top of the screen on load, stretches, settles,
 * then melts away (~2.3s total). Pure CSS transforms (GPU-friendly, no video/canvas).
 * Never blocks input (pointer-events: none) and unmounts itself when finished.
 * Hidden entirely for prefers-reduced-motion (see styles/burger.css).
 */
const DRIPS = [
  { x: 6, w: 30, len: 30, lenM: 20, delay: 0.3, dur: 1.15 },
  { x: 17, w: 44, len: 46, lenM: 31, delay: 0.2, dur: 1.3 },
  { x: 29, w: 26, len: 24, lenM: 17, delay: 0.5, dur: 1.0 },
  { x: 41, w: 38, len: 38, lenM: 26, delay: 0.25, dur: 1.25 },
  { x: 53, w: 48, len: 52, lenM: 35, delay: 0.15, dur: 1.4 },
  { x: 65, w: 28, len: 27, lenM: 19, delay: 0.45, dur: 1.05 },
  { x: 76, w: 42, len: 42, lenM: 28, delay: 0.3, dur: 1.3 },
  { x: 88, w: 32, len: 33, lenM: 22, delay: 0.4, dur: 1.15 },
  { x: 96, w: 24, len: 22, lenM: 15, delay: 0.55, dur: 0.95 },
];

export function CheeseDrip() {
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <div
      className="cheese-drip"
      aria-hidden
      onAnimationEnd={(e) => { if (e.target === e.currentTarget) setDone(true); }}
    >
      {DRIPS.map((d, i) => (
        <i
          key={i}
          className="drip"
          style={{
            "--x": `${d.x}%`, "--w": `${d.w}px`, "--len": `${d.len}vh`, "--lenm": `${d.lenM}vh`,
            "--delay": `${d.delay}s`, "--dur": `${d.dur}s`,
          } as React.CSSProperties}
        />
      ))}
      <svg className="cheese-drip__band" viewBox="0 0 1200 60" preserveAspectRatio="none" focusable="false">
        <path d="M0 0H1200V26C1160 40 1120 44 1080 30C1040 18 1000 40 950 42C900 44 860 22 810 30C760 38 720 46 660 36C610 28 560 20 510 32C460 44 410 42 360 30C310 20 260 38 210 42C160 46 110 26 60 32C30 36 12 40 0 36Z" />
        <path className="gloss" d="M20 12H1180" />
      </svg>
    </div>
  );
}
