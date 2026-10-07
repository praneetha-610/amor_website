/**
 * Locks the page behind a pop-up without letting it scroll (or jump) — works on iOS Safari too,
 * where `overflow: hidden` on <body> is ignored. Restores the exact scroll position afterwards.
 * Safe to nest (menu + dialog): the page unlocks only when the last lock is released.
 */
let locks = 0;
let savedY = 0;

export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  if (locks++ === 0) {
    savedY = window.scrollY;
    const b = document.body.style;
    b.position = "fixed";
    b.top = `-${savedY}px`;
    b.left = "0";
    b.right = "0";
    b.width = "100%";
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) {
      const b = document.body.style;
      b.position = b.top = b.left = b.right = b.width = "";
      window.scrollTo(0, savedY);
    }
  };
}
