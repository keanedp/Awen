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
