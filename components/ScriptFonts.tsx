"use client";

import { useEffect } from "react";
import type { BurgerKey } from "@/config/site";

/**
 * Only job: detect whether the licensed Boardley *Extrude* file exists, because that layer
 * has no free stand-in (drawing it with a different font would look wrong). Everything else
 * falls back to the stand-in script fonts through plain CSS font stacks.
 */
export function ScriptFonts({ burger }: { burger: BurgerKey }) {
  useEffect(() => {
    if (burger !== "nashville" || !("fonts" in document)) return;
    let cancelled = false;
    document.fonts
      .load('64px "Boardley Extrude"', "Aa")
      .then((faces) => { if (!cancelled && faces.length) document.documentElement.classList.add("has-font-boardley-extrude"); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [burger]);
  return null;
}
