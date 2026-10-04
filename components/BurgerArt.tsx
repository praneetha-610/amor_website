import { getBurger, type BurgerKey } from "@/config/site";
import Image from "next/image";

/** Deterministic pseudo-random so SSR and client render identical SVG. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const BUN = "#E3A03A";
const BUN_HI = "#F5C873";
const BUN_LOW = "#CB8628";
const SESAME = "#FFF4DA";
const PATTY = "#2A1A14";
const PATTY_HI = "#45302A";

function Bun({ top }: { top?: boolean }) {
  return top ? (
    <g>
      <path d="M62 204 C62 104 128 52 200 52 C272 52 338 104 338 204 Q338 212 330 212 H70 Q62 212 62 204 Z" fill={BUN} />
      <path d="M92 160 C96 112 132 80 176 70 C146 90 124 120 118 166 Z" fill={BUN_HI} />
      <path d="M300 200 C312 150 306 118 284 92 C322 118 338 160 336 204 Z" fill={BUN_LOW} />
      {[
        [150, 98, -24], [200, 82, 6], [250, 98, 28], [124, 136, -40], [176, 122, -8],
        [228, 122, 12], [276, 136, 40], [150, 160, -20], [204, 156, 4], [256, 162, 22],
      ].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx="9" ry="4.6" transform={`rotate(${r} ${x} ${y})`} fill={SESAME} />
      ))}
    </g>
  ) : (
    <g>
      <path d="M70 322 H330 V338 Q330 366 302 366 H98 Q70 366 70 338 Z" fill={BUN_LOW} />
      <rect x="70" y="322" width="260" height="10" fill={BUN} />
    </g>
  );
}

function Patty({ y, seed }: { y: number; seed: number }) {
  const r = rng(seed);
  return (
    <g>
      <rect x="58" y={y} width="284" height="54" rx="27" fill={PATTY} />
      {Array.from({ length: 22 }).map((_, i) => (
        <circle key={i} cx={84 + r() * 232} cy={y + 12 + r() * 30} r={1.6 + r() * 2.2} fill={PATTY_HI} />
      ))}
    </g>
  );
}

function Cheese({ y }: { y: number }) {
  // A square slice draped over the patty with melted drips.
  return (
    <g transform={`translate(0 ${y - 196})`}>
      <path
        d="M52 196 H348 V214 Q348 222 340 222 H312 Q302 222 302 232 V252 Q302 266 288 266 Q274 266 274 252 V236 Q274 226 264 226 H150 Q140 226 140 236 V246 Q140 258 128 258 Q116 258 116 246 V232 Q116 222 106 222 H60 Q52 222 52 214 Z"
        fill="#FFD000"
      />
      <path d="M52 196 H348 V202 H52 Z" fill="#FFE36B" />
    </g>
  );
}

function CheeseBurger() {
  return (
    <>
      <Bun />
      <Patty y={278} seed={7} />
      <Cheese y={262} />
      <Patty y={228} seed={31} />
      <Cheese y={208} />
      <Bun top />
    </>
  );
}

function NashvilleBurger() {
  const r = rng(11);
  const bumps = Array.from({ length: 13 }).flatMap((_, i) => [
    { cx: 56 + i * 24, cy: 214 + (i % 2) * 3, r: 15 + (i % 3) * 3 },
    { cx: 60 + i * 24, cy: 292 - (i % 2) * 3, r: 15 + ((i + 1) % 3) * 3 },
  ]);
  const crust = Array.from({ length: 70 }).map(() => ({
    cx: 70 + r() * 260,
    cy: 212 + r() * 82,
    r: 2 + r() * 4.5,
    hi: r() > 0.5,
  }));
  return (
    <>
      <Bun />
      {/* mayo */}
      <path d="M62 316 Q110 300 160 314 T262 314 T338 312 V324 H62 Z" fill="#fff" />
      {/* chicken */}
      <g>
        <rect x="48" y="206" width="304" height="90" rx="45" fill="#D68A2D" />
        {bumps.map((b, i) => <circle key={i} {...b} fill="#D68A2D" />)}
        {crust.map((c, i) => (
          <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill={c.hi ? "#F0B04F" : "#A9591B"} opacity={c.hi ? 0.9 : 0.7} />
        ))}
        {/* hot glaze + drips */}
        <path
          d="M52 214 Q110 196 200 204 T348 212 V226 Q330 236 316 232 Q306 258 292 252 Q282 238 270 240 Q252 246 244 232 Q222 244 206 232 Q186 240 170 230 Q150 262 134 246 Q124 232 108 238 Q84 236 72 228 Q56 226 52 224 Z"
          fill="#C8102E"
        />
        <path d="M84 214 Q130 206 176 210" stroke="#E8505F" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".8" />
      </g>
      {/* pickles */}
      {[[104, 196], [200, 190], [296, 196]].map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={x} cy={y} rx="30" ry="9" fill="#5E8A2E" />
          <ellipse cx={x} cy={y - 1} rx="22" ry="5" fill="#9CC25A" />
        </g>
      ))}
      {/* lettuce frill */}
      <path
        d="M54 196 q14 -16 28 0 q14 -16 28 0 q14 -16 28 0 q14 -16 28 0 q14 -16 28 0 q14 -16 28 0 q14 -16 28 0 q14 -16 28 0 q14 -16 28 0 q14 -16 28 0 q14 -16 28 0 V210 H54 Z"
        fill="#7FAE3E"
        transform="translate(0 4)"
      />
      <Bun top />
    </>
  );
}

export function BurgerArt({
  burger,
  className = "",
  priority = false,
}: {
  burger: BurgerKey;
  className?: string;
  priority?: boolean;
}) {
  const cfg = getBurger(burger);
  // Real photography wins when configured in config/site.ts
  if (cfg.photo) {
    return (
      <Image
        src={cfg.photo}
        alt={cfg.alt}
        width={900}
        height={900}
        priority={priority}
        sizes="(max-width: 800px) 90vw, 560px"
        className={`burger-art burger-art--photo ${className}`}
      />
    );
  }
  return (
    <svg
      viewBox="0 0 400 400"
      className={`burger-art ${className}`}
      role="img"
      aria-label={cfg.alt}
      focusable="false"
    >
      <ellipse cx="200" cy="382" rx="132" ry="9" fill="#000" opacity=".16" />
      {burger === "cheese" ? <CheeseBurger /> : <NashvilleBurger />}
    </svg>
  );
}
