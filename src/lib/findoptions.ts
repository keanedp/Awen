import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu } from "@tauri-apps/api/menu";
import type { FindOptions } from "./editor/findQuery";

/** macOS words its first choice as the inverse of Windows Match case. */
export function findOptionItems(os: string, options: FindOptions, change: (value: Partial<FindOptions>) => void) {
  const mac = os !== "windows";
  return [
    {
      text: mac ? "Ignore Case" : "Match case",
      checked: mac ? !options.findMatchCase : options.findMatchCase,
      action: () => change({ findMatchCase: !options.findMatchCase }),
    },
    {
      text: mac ? "Full Word" : "Match whole word",
      checked: options.findWholeWord,
      action: () => change({ findWholeWord: !options.findWholeWord }),
    },
  ];
}

/** Use the same native popup menus as spelling, anchored below the options button. */
export async function showFindOptions(
  os: string,
  options: FindOptions,
  anchor: { left: number; bottom: number },
  change: (value: Partial<FindOptions>) => void,
) {
  const menu = await Menu.new({ items: findOptionItems(os, options, change) });
  try {
    await menu.popup(new LogicalPosition(anchor.left, anchor.bottom));
  } finally {
    await menu.close();
  }
}
