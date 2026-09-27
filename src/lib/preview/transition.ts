import { cubicOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";

/** How far, in px, the preview rises as it fades in. */
export const RISE = 6;

/**
 * Preview's entrance and exit: a quick dissolve over the editor, rising slightly on the way in.
 * Reduce Motion keeps the dissolve but drops the movement, as macOS and Windows do.
 */
export function previewFade(
  _node: Element,
  { entering, reduceMotion }: { entering: boolean; reduceMotion: boolean },
): TransitionConfig {
  const rise = entering && !reduceMotion ? RISE : 0;
  return {
    duration: entering ? 180 : 140,
    easing: cubicOut,
    css: (t, u) => (rise ? `opacity: ${t}; transform: translateY(${u * rise}px)` : `opacity: ${t}`),
  };
}

export function prefersReducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
