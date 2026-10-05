import type { MenuOptions } from "@tauri-apps/api/menu";
import type { EditorState, TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createState, documentText, setReadOnly } from "./editor/setup";
import { systemSpellChecker } from "./spellchecker";

const { invoke, popup, newMenu, recheck } = vi.hoisted(() => {
  const popup = vi.fn(async () => {});
  return {
    invoke: vi.fn(),
    popup,
    newMenu: vi.fn(async (_options: MenuOptions) => ({ popup })),
    recheck: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: newMenu } }));
vi.mock("./platform", () => ({ detectOS: () => "windows" }));
vi.mock("./editor/spelling", async (importOriginal) => ({
  ...await importOriginal<typeof import("./editor/spelling")>(),
  recheckSpelling: recheck,
}));

type ActionItem = { text: string; enabled?: boolean; action?: () => unknown };
const items = () => newMenu.mock.calls[0][0].items as ActionItem[];
const find = (text: string) => items().find((item) => item.text === text)!;

function viewOf(text = "An splled word\r\nNext line") {
  const view = {
    state: createState(text, () => {}, () => {}),
    dispatch: (spec: TransactionSpec) => { view.state = view.state.update(spec).state; },
  };
  return view as unknown as EditorView & { state: EditorState };
}

const misspelling = { from: 3, to: 9, word: "splled" };

beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockImplementation(async (command: string) =>
    command === "spelling_guesses" ? ["spelled", "spilled"] : undefined,
  );
});

describe("Windows spelling menu", () => {
  test("suggestions replace the actual word while preserving Windows line endings", async () => {
    const view = viewOf();
    await systemSpellChecker.menu(view, misspelling);
    expect(invoke).toHaveBeenCalledWith("spelling_guesses", { word: "splled" });
    expect(popup).toHaveBeenCalledOnce();
    expect(find("spelled").action!()).toBe(true);
    expect(documentText(view)).toBe("An spelled word\r\nNext line");
    expect(view.state.selection.main.head).toBe(10);
    expect(items().slice(-3)).toEqual([{ item: "Cut" }, { item: "Copy" }, { item: "Paste" }]);
  });

  test("suggestions cannot change a locked document", async () => {
    const view = viewOf();
    setReadOnly(view, true);
    await systemSpellChecker.menu(view, misspelling);
    expect(find("spelled").enabled).toBe(false);
    expect(find("spelled").action!()).toBe(false);
    expect(documentText(view)).toBe("An splled word\r\nNext line");
  });

  test.each([
    ["Ignore", "ignore_spelling"],
    ["Add to dictionary", "learn_spelling"],
  ])("%s uses the native dictionary and refreshes spelling", async (label, command) => {
    const view = viewOf();
    await systemSpellChecker.menu(view, misspelling);
    await find(label).action!();
    expect(invoke).toHaveBeenCalledWith(command, { word: "splled" });
    expect(recheck).toHaveBeenCalledWith(view);
  });

  test("a failed suggestion request still offers dictionary and clipboard actions", async () => {
    invoke.mockRejectedValueOnce(new Error("No dictionary suggestions"));
    await systemSpellChecker.menu(viewOf(), misspelling);
    expect(find("No suggestions").enabled).toBe(false);
    expect(find("Ignore").action).toBeTypeOf("function");
    expect(find("Add to dictionary").action).toBeTypeOf("function");
    expect(popup).toHaveBeenCalledOnce();
  });
});
