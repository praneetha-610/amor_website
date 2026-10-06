"use client";

import { useEffect } from "react";

import type { BurgerKey } from "@/config/site";

const FONTS: Record<BurgerKey, Record<string, string>> = {
  cheese: { "has-font-sloop": '"Sloop Script Pro"' },
  nashville: {
    "has-font-boardley-base": '"Boardley Script Base"',
    "has-font-boardley-shadow": '"Boardley Script Shadow"',
    "has-font-boardley-detail": '"Boardley Script Detail"',
  },
};

/**
 * Detects which licensed font files were actually supplied (public/fonts/) and flags <html>
 * so the CSS can switch the burger titles to script. A missing file simply never sets its flag —
 * the existing sans title stays, and no generic script font is ever substituted.
 */
export function ScriptFonts({ burger }: { burger: BurgerKey }) {
  useEffect(() => {
    if (!("fonts" in document)) return;
    const root = document.documentElement;
    let cancelled = false;
    for (const [cls, family] of Object.entries(FONTS[burger])) {
      document.fonts
        .load(`64px ${family}`, "Aa")
        .then((faces) => { if (!cancelled && faces.length) root.classList.add(cls); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [burger]);
  return null;
}
