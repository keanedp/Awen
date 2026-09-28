import { Compartment, EditorState, type Extension, type Transaction } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

/**
 * Typewriter scrolling (W-018): the caret's line stays in the middle of the
 * editor. Wherever CodeMirror would scroll the caret into view (typing, keys
 * that move it, undo, find), it's centred instead. A click or drag centres it
 * once the button is released, so the text doesn't move under the pointer
 * while selecting.
 */

const centre = (head: number) => EditorView.scrollIntoView(head, { y: "center" });

/** Centres the caret, rather than just bringing it into view. */
const centreCaret = EditorState.transactionExtender.of((tr: Transaction) =>
  tr.scrollIntoView ? { effects: centre(tr.newSelection.main.head) } : null,
);

/**
 * Centres the caret when a mouse button pressed in the editor is released.
 * CodeMirror ends its own mouse selection on `document`, so by the time this
 * `window` listener runs the selection is final.
 */
const centreOnRelease = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0) return false;
    window.addEventListener("mouseup", () => view.dispatch({ effects: centre(view.state.selection.main.head) }), {
      once: true,
    });
    return false;
  },
});

/**
 * Pads the text above and below by half the editor's height, less half a line,
 * so the first and last lines can reach the middle too. The page opens with the
 * first line there, where the caret starts.
 */
const inset = ViewPlugin.fromClass(
  class {
    constructor(private view: EditorView) {
      view.dom.classList.add("cm-typewriter");
      this.measure();
    }

    update(update: ViewUpdate) {
      if (update.geometryChanged) this.measure();
    }

    measure() {
      this.view.requestMeasure({
        read: (view) => Math.max(0, (view.scrollDOM.clientHeight - view.defaultLineHeight) / 2),
        write: (px, view) => {
          const value = `${Math.round(px)}px`;
          if (view.dom.style.getPropertyValue("--typewriter-inset") !== value)
            view.dom.style.setProperty("--typewriter-inset", value);
        },
      });
    }

    destroy() {
      this.view.dom.classList.remove("cm-typewriter");
      this.view.dom.style.removeProperty("--typewriter-inset");
    }
  },
);

const typewriter = new Compartment();
const on: Extension = [centreCaret, centreOnRelease, inset];
const off: Extension = [];

/** Typewriter scrolling, on or off. */
export function typewriterScrolling(enabled: boolean): Extension {
  return typewriter.of(enabled ? on : off);
}

/** Turns typewriter scrolling on or off in an open editor, centring the caret when it comes on. */
export function setTypewriterScrolling(view: EditorView, enabled: boolean) {
  const wanted = enabled ? on : off;
  if (typewriter.get(view.state) === wanted) return;
  view.dispatch({
    effects: [typewriter.reconfigure(wanted), ...(enabled ? [centre(view.state.selection.main.head)] : [])],
  });
}
