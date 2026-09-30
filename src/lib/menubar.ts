/**
 * The Windows title bar's menu bar (W-073). The titles must match the
 * top-level submenus built in `src-tauri/src/menu.rs` on non-mac OSes. `key`
 * is each one's access key (Format uses O, as in Word).
 */
export const MENUS = [
  { title: "File", key: "f" },
  { title: "Edit", key: "e" },
  { title: "Format", key: "o" },
  { title: "View", key: "v" },
  { title: "Window", key: "w" },
  { title: "Help", key: "h" },
] as const;

type Key = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "shiftKey" | "metaKey">;

const byKey = (key: string) => MENUS.findIndex((menu) => menu.key === key.toLowerCase());

/** The menu an Alt+letter keystroke opens, or null. Ctrl+Alt is AltGr on some layouts, so it never matches. */
export function menuForKey(e: Key): number | null {
  if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return null;
  const index = byKey(e.key);
  return index < 0 ? null : index;
}

/** A title split around its access key, which is underlined when keyboard cues show. */
export function accessKeyParts({ title, key }: (typeof MENUS)[number]): [string, string, string] {
  const at = title.toLowerCase().indexOf(key);
  return [title.slice(0, at), title.slice(at, at + 1), title.slice(at + 1)];
}

export type BarAction = { move: number } | { open: number } | "exit";

/**
 * A key pressed while the menu bar has keyboard focus (after Alt or F10) and
 * no menu is open: the arrows move between titles, Enter or Up/Down opens
 * one, a title's letter opens that menu, and Esc or F10 leaves. Other keys do
 * nothing, as in a native menu bar (Alt itself is handled by `altTap`).
 */
export function barKey(index: number, e: Key): BarAction | null {
  const count = MENUS.length;
  if (e.ctrlKey || e.metaKey) return null;
  switch (e.key) {
    case "ArrowLeft":
      return { move: (index + count - 1) % count };
    case "ArrowRight":
      return { move: (index + 1) % count };
    case "Home":
      return { move: 0 };
    case "End":
      return { move: count - 1 };
    case "Enter":
    case " ":
    case "ArrowDown":
    case "ArrowUp":
      return { open: index };
    case "Escape":
    case "F10":
      return "exit";
  }
  const letter = e.key.length === 1 ? byKey(e.key) : -1;
  return letter < 0 ? null : { open: letter };
}

/**
 * Tells a tap of Alt (pressed and released with nothing in between) from Alt
 * used as a modifier. A tap focuses the menu bar, or leaves it.
 */
export function altTap() {
  let armed = false;
  return {
    keydown(e: Key) {
      armed = e.key === "Alt" && !e.ctrlKey && !e.shiftKey && !e.metaKey;
    },
    /** True when this keyup ends a tap. */
    keyup(e: Key): boolean {
      const tap = armed && e.key === "Alt";
      armed = false;
      return tap;
    },
    /** A click or losing focus in between also cancels it. */
    cancel() {
      armed = false;
    },
  };
}
