import { flushSync, mount, unmount } from "svelte";
import {
  SearchQuery,
  closeSearchPanel,
  getSearchQuery,
  openSearchPanel,
  search,
  setSearchQuery,
} from "@codemirror/search";
import { EditorView, keymap } from "@codemirror/view";
import FindBar from "$lib/ui/FindBar.svelte";

/** The open find bar of each editor. */
const bars = new WeakMap<EditorView, { setReplacing(on: boolean): void }>();

/**
 * CodeMirror's search (state, match highlighting, find/replace commands) with
 * our own find bar in place of its default panel. Searches are literal and
 * ignore case. `onLockedEdit` runs when replacing in a locked document.
 */
export function find(onLockedEdit: () => void) {
  return [
    search({
      top: true,
      literal: true,
      // Keep the match clear of the find bar (Windows floats it over the text).
      scrollToMatch: (range) => EditorView.scrollIntoView(range, { yMargin: 80 }),
      createPanel: (view) => {
        const dom = document.createElement("div");
        const bar = mount(FindBar, { target: dom, props: { view, onLockedEdit } });
        // mount() defers effects, including bind:this; run them so the bar can focus its field.
        flushSync();
        bars.set(view, bar);
        return {
          dom,
          top: true,
          mount: () => bar.focus(),
          update: (u) => bar.update(u),
          destroy: () => {
            bars.delete(view);
            unmount(bar);
          },
        };
      },
    }),
    keymap.of([{ key: "Escape", run: closeSearchPanel }]),
  ];
}

/** Opens the find bar (or focuses it), with the replace field if `replace`. */
export function openFind(view: EditorView, replace: boolean) {
  openSearchPanel(view);
  bars.get(view)?.setReplacing(replace);
}

/** macOS Use Selection for Find: searches for the selected text next. */
export function findSelection(view: EditorView) {
  const { from, to } = view.state.selection.main;
  if (from === to) return;
  const spec = getSearchQuery(view.state);
  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({ ...spec, search: view.state.sliceDoc(from, to), literal: true }),
    ),
  });
}
