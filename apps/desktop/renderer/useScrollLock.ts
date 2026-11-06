import { useEffect } from "react";

/**
 * Locks the page behind a modal. The app scrolls the document itself (the
 * shell is min-height:100vh with a sticky sidebar), so the lock lives on
 * <html>. The scrollbar width is re-added as body padding so nothing shifts,
 * and everything touched is restored on cleanup. CSSOM writes only: they are
 * allowed under the nonce-based style CSP.
 */
export function useScrollLock() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const x = window.scrollX;
    const y = window.scrollY;
    const overflow = root.style.overflow;
    const padding = body.style.paddingRight;
    const gutter = Math.max(0, window.innerWidth - root.clientWidth);
    if (gutter > 0) {
      const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + gutter}px`;
    }
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
      body.style.paddingRight = padding;
      if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
    };
  }, []);
}
