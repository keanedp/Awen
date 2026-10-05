import { describe, expect, it } from "vitest";
import { accessKeyParts, altTap, barKey, MENUS, menuForKey, showMenuAccessKeys, updateMenuCues } from "./menubar";

const key = (key: string, mods: Partial<Record<"altKey" | "ctrlKey" | "shiftKey" | "metaKey", boolean>> = {}) => ({
  key,
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});
const alt = { altKey: true };

describe("menuForKey", () => {
  it("maps Alt+letter to each menu", () => {
    expect(["f", "e", "o", "v", "w"].map((k) => menuForKey(key(k, alt)))).toEqual([0, 1, 2, 3, 4]);
  });

  it("ignores case", () => {
    expect(menuForKey(key("F", alt))).toBe(0);
  });

  it("ignores other letters and plain keys", () => {
    expect(menuForKey(key("x", alt))).toBeNull();
    expect(menuForKey(key("f"))).toBeNull();
    expect(menuForKey(key("Alt", alt))).toBeNull();
  });

  it("ignores Alt with other modifiers, including AltGr (Ctrl+Alt)", () => {
    expect(menuForKey(key("f", { altKey: true, ctrlKey: true }))).toBeNull();
    expect(menuForKey(key("f", { altKey: true, shiftKey: true }))).toBeNull();
    expect(menuForKey(key("f", { altKey: true, metaKey: true }))).toBeNull();
  });
});

describe("accessKeyParts", () => {
  it("splits each title around its access key", () => {
    expect(accessKeyParts(MENUS[0])).toEqual(["", "F", "ile"]);
    expect(accessKeyParts(MENUS[2])).toEqual(["F", "o", "rmat"]);
  });

  it("finds every menu's key in its title", () => {
    for (const menu of MENUS) expect(accessKeyParts(menu)[1].toLowerCase()).toBe(menu.key);
  });
});

describe("barKey", () => {
  it("moves between titles with the arrows, wrapping around", () => {
    expect(barKey(1, key("ArrowRight"))).toEqual({ move: 2 });
    expect(barKey(1, key("ArrowLeft"))).toEqual({ move: 0 });
    expect(barKey(0, key("ArrowLeft"))).toEqual({ move: 5 });
    expect(barKey(5, key("ArrowRight"))).toEqual({ move: 0 });
  });

  it("jumps to the ends with Home and End", () => {
    expect(barKey(2, key("Home"))).toEqual({ move: 0 });
    expect(barKey(2, key("End"))).toEqual({ move: 5 });
  });

  it("opens the highlighted menu", () => {
    for (const k of ["Enter", " ", "ArrowDown", "ArrowUp"]) expect(barKey(3, key(k))).toEqual({ open: 3 });
  });

  it("opens a menu by its letter, with or without Alt", () => {
    expect(barKey(0, key("o"))).toEqual({ open: 2 });
    expect(barKey(0, key("V", alt))).toEqual({ open: 3 });
  });

  it("leaves with Esc or F10", () => {
    expect(barKey(0, key("Escape"))).toBe("exit");
    expect(barKey(0, key("F10"))).toBe("exit");
  });

  it("does nothing for other keys and Ctrl shortcuts", () => {
    expect(barKey(0, key("x"))).toBeNull();
    expect(barKey(0, key("Tab"))).toBeNull();
    expect(barKey(0, key("o", { ctrlKey: true }))).toBeNull();
  });
});

describe("altTap", () => {
  it("is a tap when Alt goes down and up alone", () => {
    const tap = altTap();
    tap.keydown(key("Alt", alt));
    expect(tap.keyup(key("Alt"))).toBe(true);
  });

  it("is not a tap when another key comes in between", () => {
    const tap = altTap();
    tap.keydown(key("Alt", alt));
    tap.keydown(key("f", alt));
    expect(tap.keyup(key("Alt"))).toBe(false);
  });

  it("is not a tap with another modifier held, or after a cancel", () => {
    const tap = altTap();
    tap.keydown(key("Alt", { altKey: true, ctrlKey: true }));
    expect(tap.keyup(key("Alt"))).toBe(false);
    tap.keydown(key("Alt", alt));
    tap.cancel();
    expect(tap.keyup(key("Alt"))).toBe(false);
  });

  it("stays a tap while Alt repeats", () => {
    const tap = altTap();
    tap.keydown(key("Alt", alt));
    tap.keydown(key("Alt", alt));
    expect(tap.keyup(key("Alt"))).toBe(true);
  });
});

describe("menu access cues", () => {
  const initial = { altHeld: false, keyboardOpen: false };

  it("clears Alt cues after the native menu consumed its key release", () => {
    let state = updateMenuCues(initial, "alt-down");
    state = updateMenuCues(state, "open-keyboard");
    expect(showMenuAccessKeys(state, false, true)).toBe(true);
    // TrackPopupMenu ate the keyup: the next frontend event is closing the popup.
    state = updateMenuCues(state, "closed");
    expect(showMenuAccessKeys(state, false, false)).toBe(false);
  });

  it("keeps the title's cues after Escape until keyboard focus leaves the bar", () => {
    let state = updateMenuCues(initial, "open-keyboard");
    state = updateMenuCues(state, "closed");
    expect(showMenuAccessKeys(state, true, false)).toBe(true);
    expect(showMenuAccessKeys(state, false, false)).toBe(false);
  });

  it("shows no access cues when a pointer opens or switches menus", () => {
    let state = updateMenuCues(initial, "open-pointer");
    expect(showMenuAccessKeys(state, false, true)).toBe(false);
    state = updateMenuCues(state, "closed");
    state = updateMenuCues(state, "open-pointer");
    expect(showMenuAccessKeys(state, false, true)).toBe(false);
  });

  it("keeps keyboard-origin cues after Alt is released while the popup is open", () => {
    let state = updateMenuCues(initial, "alt-down");
    state = updateMenuCues(state, "open-keyboard");
    state = updateMenuCues(state, "alt-up");
    expect(showMenuAccessKeys(state, false, true)).toBe(true);
  });
});
