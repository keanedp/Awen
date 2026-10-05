import { expect, test, vi } from "vitest";
import { findOptionItems, showFindOptions } from "./findoptions";

const ipc = vi.hoisted(() => ({ popup: vi.fn(), close: vi.fn(), create: vi.fn() }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: ipc.create } }));

test("Windows menu labels and toggles", () => {
  const change = vi.fn();
  const items = findOptionItems("windows", { findMatchCase: true, findWholeWord: false }, change);
  expect(items.map(({ text, checked }) => ({ text, checked }))).toEqual([
    { text: "Match case", checked: true }, { text: "Match whole word", checked: false },
  ]);
  items[0].action(); items[1].action();
  expect(change.mock.calls).toEqual([[{ findMatchCase: false }], [{ findWholeWord: true }]]);
});

test("macOS Ignore Case uses the inverse checkmark", () => {
  const items = findOptionItems("mac", { findMatchCase: false, findWholeWord: true }, vi.fn());
  expect(items.map(({ text, checked }) => ({ text, checked }))).toEqual([
    { text: "Ignore Case", checked: true }, { text: "Full Word", checked: true },
  ]);
});

test("the menu anchors below the button and releases its native resources", async () => {
  ipc.create.mockResolvedValue({ popup: ipc.popup, close: ipc.close });
  ipc.popup.mockResolvedValue(undefined);
  await showFindOptions("windows", { findMatchCase: false, findWholeWord: false }, { left: 30, bottom: 50 }, vi.fn());
  expect(ipc.popup.mock.calls.at(-1)?.[0]).toMatchObject({ x: 30, y: 50 });
  expect(ipc.close).toHaveBeenCalled();
});
