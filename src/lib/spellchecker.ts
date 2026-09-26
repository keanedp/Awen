import { invoke } from "@tauri-apps/api/core";
import { Menu, type MenuOptions } from "@tauri-apps/api/menu";
import { correctSpelling, recheckSpelling, type SpellChecker } from "./editor/spelling";
import { detectOS } from "./platform";

/** Worded as each OS's own text views word them. */
const labels =
  detectOS() === "windows"
    ? { none: "No suggestions", ignore: "Ignore", learn: "Add to dictionary" }
    : { none: "No Guesses Found", ignore: "Ignore Spelling", learn: "Learn Spelling" };

/** The system spell checker, through `spelling.rs`. */
export const systemSpellChecker: SpellChecker = {
  check: (text) => invoke("check_spelling", { text }),

  async menu(view, misspelling) {
    const { word } = misspelling;
    const guesses = await invoke<string[]>("spelling_guesses", { word }).catch(() => []);
    // Learning or ignoring a word applies everywhere; this window rechecks now, others on their next check.
    const accept = (command: string) => () => invoke(command, { word }).then(() => recheckSpelling(view));
    const items: MenuOptions["items"] = [
      ...(guesses.length
        ? guesses.map((guess) => ({
            text: guess,
            enabled: !view.state.readOnly,
            action: () => correctSpelling(view, misspelling, guess),
          }))
        : [{ text: labels.none, enabled: false }]),
      { item: "Separator" },
      { text: labels.ignore, action: accept("ignore_spelling") },
      { text: labels.learn, action: accept("learn_spelling") },
      { item: "Separator" },
      { item: "Cut" },
      { item: "Copy" },
      { item: "Paste" },
    ];
    const menu = await Menu.new({ items });
    await menu.popup();
  },
};
