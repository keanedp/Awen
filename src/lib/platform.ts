import { invoke } from "@tauri-apps/api/core";

export type OS = "mac" | "windows" | "linux";

export function detectOS(): OS {
  const ua = navigator.userAgent;
  if (ua.includes("Mac")) return "mac";
  if (ua.includes("Windows")) return "windows";
  return "linux";
}

/** Selects the platform token set in styles/tokens.*.css. */
export function applyPlatform(): OS {
  const os = detectOS();
  document.documentElement.dataset.os = os;
  return os;
}

/**
 * Feeds the system accent colour to the token files. Read natively (see
 * src-tauri/src/accent.rs), so call it again when the window comes forward.
 */
export async function applyAccent() {
  const accent = await invoke<{
    light: string;
    dark: string;
    textLight: string;
    textDark: string;
  } | null>("accent_colors");
  if (!accent) return;
  const root = document.documentElement.style;
  root.setProperty("--system-accent", accent.light);
  root.setProperty("--system-accent-dark", accent.dark);
  root.setProperty("--system-accent-text", accent.textLight);
  root.setProperty("--system-accent-text-dark", accent.textDark);
}
