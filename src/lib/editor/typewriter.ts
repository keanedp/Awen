import {
  Compartment,
  EditorState,
  StateEffect,
  StateField,
  type Extension,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
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

/** Sets the padding above and below the text, in pixels; `inset` measures it. */
export const setInset = StateEffect.define<number>();
/** That padding, 0 until measured. */
const insetField = StateField.define<number>({
  create: () => 0,
  update: (px, tr) => tr.effects.reduce((px, e) => (e.is(setInset) ? e.value : px), px),
  // CodeMirror applies the padding in its own update, so it re-measures and
  // redraws the caret; padding set on the DOM behind its back left the caret
  // drawn where the line used to be when typewriter scrolling was turned off.
  provide: (field) =>
    EditorView.contentAttributes.from(field, (px): Record<string, string> =>
      px ? { style: `padding-top: ${px}px; padding-bottom: ${px}px` } : {},
    ),
});

/**
 * Pads the text above and below by half the editor's height, less half a line,
 * so the first and last lines can reach the middle too, and centres the caret
 * whenever that changes: when typewriter scrolling comes on and when the window
 * is resized.
 */
const inset = ViewPlugin.fromClass(
  class {
    private destroyed = false;

    constructor(private view: EditorView) {
      this.measure();
    }

    update(update: ViewUpdate) {
      if (update.geometryChanged) this.measure();
    }

    measure() {
      this.view.requestMeasure({
        read: (view) => Math.round(Math.max(0, (view.scrollDOM.clientHeight - view.defaultLineHeight) / 2)),
        write: (px, view) => {
          if (px === view.state.field(insetField, false)) return;
          // The editor can't be updated while it's measuring.
          queueMicrotask(() => {
            if (this.destroyed) return;
            view.dispatch({ effects: [setInset.of(px), centre(view.state.selection.main.head)] });
          });
        },
      });
    }

    destroy() {
      this.destroyed = true;
    }
  },
);

const typewriter = new Compartment();
const on: Extension = [centreCaret, centreOnRelease, insetField, inset];
const off: Extension = [];

/** Typewriter scrolling, on or off. */
export function typewriterScrolling(enabled: boolean): Extension {
  return typewriter.of(enabled ? on : off);
}

/**
 * The transaction that turns typewriter scrolling on or off, or `null` if it
 * already is. Off, the text stays where it is on screen, the caret with it.
 */
export function toggleTypewriter(state: EditorState, enabled: boolean): TransactionSpec | null {
  const wanted = enabled ? on : off;
  return typewriter.get(state) === wanted ? null : { effects: typewriter.reconfigure(wanted) };
}

/**
 * Turns typewriter scrolling on or off in an open editor. Off, the padding
 * goes, and the caret's line stays where it was on screen (unless the start or
 * end of the document is too close for the scroll to allow it). Whether the
 * engine keeps the text still by itself differs (CodeMirror's anchoring ignores
 * padding; WebKit may compensate), so this measures how far the line actually
 * moved and scrolls it back, before the frame is drawn.
 */
export function setTypewriterScrolling(view: EditorView, enabled: boolean) {
  const spec = toggleTypewriter(view.state, enabled);
  if (!spec) return;
  const { head } = view.state.selection.main;
  const before = enabled ? undefined : view.coordsAtPos(head)?.top;
  view.dispatch(spec);
  if (before === undefined) return;
  view.requestMeasure({
    read: (view) => view.coordsAtPos(head)?.top,
    write: (after, view) => {
      if (after !== undefined) view.scrollDOM.scrollTop += after - before;
    },
  });
}
