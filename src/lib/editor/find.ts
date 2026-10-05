import { flushSync, mount, unmount } from "svelte";
import {
  closeSearchPanel,
  getSearchQuery,
  openSearchPanel,
  search,
  setSearchQuery,
} from "@codemirror/search";
import { EditorView, ViewPlugin, keymap } from "@codemirror/view";
import FindBar from "$lib/ui/FindBar.svelte";
import { loadPreferences, onPreferenceChanged } from "$lib/preferences";
import { applyFindOptions, editFindQuery, type FindOptions } from "./findQuery";

const savedFindOptions = ViewPlugin.define((view) => {
  let destroyed = false;
  let unlisten: (() => void) | undefined;
  // Keep changes received during the initial read authoritative over that read.
  let changes: Partial<FindOptions> = {};
  const apply = (options: Partial<FindOptions>) => {
    if (destroyed) return;
    const previous = getSearchQuery(view.state);
    const query = applyFindOptions(previous, options);
    if (!query.eq(previous)) view.dispatch({ effects: setSearchQuery.of(query) });
  };
  onPreferenceChanged((change) => {
    if (change.findMatchCase !== undefined) changes.findMatchCase = change.findMatchCase;
    if (change.findWholeWord !== undefined) changes.findWholeWord = change.findWholeWord;
    apply(changes);
  }).then((stop) => { if (destroyed) stop(); else unlisten = stop; }).catch(() => {});
  loadPreferences().then((prefs) => apply({ ...prefs, ...changes })).catch(() => {});
  return { destroy() { destroyed = true; unlisten?.(); } };
});

/** The open find bar of each editor. */
const bars = new WeakMap<EditorView, { setReplacing(on: boolean): void }>();

/**
 * CodeMirror's search (state, match highlighting, find/replace commands) with
 * our own find bar in place of its default panel. Searches are literal and
 * use the saved case and whole-word options. `onLockedEdit` runs when replacing in a locked document.
 */
export function find(onLockedEdit: () => void) {
  return [
    savedFindOptions,
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
      editFindQuery(spec, view.state.doc.sliceString(from, to, "\n")),
    ),
  });
}
