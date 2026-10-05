<script lang="ts">
  import {
    closeSearchPanel,
    findNext,
    findPrevious,
    getSearchQuery,
    replaceAll,
    replaceNext,
    setSearchQuery,
  } from "@codemirror/search";
  import type { EditorState } from "@codemirror/state";
  import { EditorView, type ViewUpdate } from "@codemirror/view";
  import { detectOS } from "$lib/platform";
  import { showFindOptions } from "$lib/findoptions";
  import { setPreferences } from "$lib/preferences";
  import { applyFindOptions, editFindQuery, type FindOptions } from "$lib/editor/findQuery";

  let { view, onLockedEdit }: { view: EditorView; onLockedEdit: () => void } = $props();

  const os = detectOS();
  /** Counting stops here, so a huge document stays responsive. */
  const countLimit = 1000;

  let findText = $state("");
  let replaceText = $state("");
  let replacing = $state(false);
  let total = $state(0);
  /** 1-based index of the match that is selected, or 0. */
  let current = $state(0);
  let options = $state<FindOptions>({ findMatchCase: false, findWholeWord: false });
  let field = $state<HTMLInputElement>();
  /** Marks the find field, which CodeMirror focuses when Find is chosen again. */
  const mainField = { "main-field": "true" };

  // The bar lives as long as its panel, so `view` never changes.
  // svelte-ignore state_referenced_locally
  sync(view.state);

  /** Focuses the find field with its text selected. */
  export function focus() {
    field?.focus();
    field?.select();
  }

  export function setReplacing(on: boolean) {
    replacing = on;
  }

  export function update(u: ViewUpdate) {
    const queryChanged = !getSearchQuery(u.state).eq(getSearchQuery(u.startState));
    if (queryChanged || u.docChanged || u.selectionSet) sync(u.state);
  }

  /** Shows the query (which Use Selection for Find may have set) and counts its matches. */
  function sync(state: EditorState) {
    const query = getSearchQuery(state);
    options = { findMatchCase: query.caseSensitive, findWholeWord: query.wholeWord };
    findText = query.search;
    replaceText = query.replace;
    total = current = 0;
    if (!query.valid) return;
    const { from, to } = state.selection.main;
    const matches = query.getCursor(state);
    for (let m = matches.next(); !m.done && total < countLimit; m = matches.next()) {
      total++;
      if (m.value.from === from && m.value.to === to) current = total;
    }
  }

  function setQuery() {
    const query = editFindQuery(getSearchQuery(view.state), findText, replaceText);
    view.dispatch({ effects: setSearchQuery.of(query) });
    return query;
  }

  /** Selects the first match from the caret on, as you type, like native find bars. */
  function findAsYouType() {
    const query = setQuery();
    if (!query.valid) return;
    const start = view.state.selection.main.from;
    let m = query.getCursor(view.state, start).next();
    if (m.done) m = query.getCursor(view.state).next();
    if (m.done) return;
    view.dispatch({
      selection: { anchor: m.value.from, head: m.value.to },
      effects: EditorView.scrollIntoView(m.value.from, { yMargin: 80 }),
      userEvent: "select.search",
    });
  }

  function replace(command: typeof replaceNext) {
    if (view.state.readOnly) return onLockedEdit();
    command(view);
  }

  async function openOptions(event: MouseEvent) {
    const anchor = (event.currentTarget as HTMLElement).getBoundingClientRect();
    await showFindOptions(os, options, anchor, (change) => {
      view.dispatch({ effects: setSearchQuery.of(applyFindOptions(getSearchQuery(view.state), change)) });
      findAsYouType();
      void setPreferences(change);
    });
    field?.focus();
  }

  function close() {
    closeSearchPanel(view);
  }

  function findKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.shiftKey ? findPrevious : findNext)(view);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function replaceKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      replace(replaceNext);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  const status = $derived.by(() => {
    if (!findText) return "";
    if (!total) return os === "windows" ? "No results" : "Not found";
    const count = total >= countLimit ? `${countLimit}+` : String(total);
    return current ? `${current} of ${count}` : os === "windows" ? `${count} results` : `${count} found`;
  });

  /** Buttons act without taking focus from the field or the editor. */
  const keepFocus = (e: MouseEvent) => e.preventDefault();
</script>

{#if os === "windows"}
  <!-- Windows 11: a flyout over the top right of the text, as in Notepad. -->
  <div class="find windows" role="search">
    <button
      type="button"
      class="icon chrome"
      aria-label={replacing ? "Hide replace" : "Show replace"}
      aria-expanded={replacing}
      title={replacing ? "Hide replace" : "Show replace"}
      onmousedown={keepFocus}
      onclick={() => (replacing = !replacing)}
    >{@html replacing ? "&#xE70D;" : "&#xE76C;"}</button>
    <div class="rows">
      <div class="row">
        <div class="field">
          <input
            bind:this={field}
            value={findText}
            {...mainField}
            placeholder="Find"
            aria-label="Find"
            spellcheck="false"
            oninput={(e) => ((findText = e.currentTarget.value), findAsYouType())}
            onkeydown={findKeyDown}
          />
          <span class="status chrome" aria-live="polite">{status}</span>
        </div>
        <button type="button" class="icon chrome" aria-label="Find options" aria-haspopup="menu" title="Find options" onmousedown={keepFocus} onclick={openOptions}>&#xE713;</button>
        <button type="button" class="icon chrome" aria-label="Find next" title="Find next (F3)" onmousedown={keepFocus} onclick={() => findNext(view)}>&#xE74B;</button>
        <button type="button" class="icon chrome" aria-label="Find previous" title="Find previous (Shift+F3)" onmousedown={keepFocus} onclick={() => findPrevious(view)}>&#xE74A;</button>
        <button type="button" class="icon chrome" aria-label="Close" title="Close (Esc)" onmousedown={keepFocus} onclick={close}>&#xE711;</button>
      </div>
      {#if replacing}
        <div class="row">
          <div class="field">
            <input
              value={replaceText}
              placeholder="Replace"
              aria-label="Replace"
              spellcheck="false"
              oninput={(e) => ((replaceText = e.currentTarget.value), setQuery())}
              onkeydown={replaceKeyDown}
            />
          </div>
          <button type="button" class="text chrome" onmousedown={keepFocus} onclick={() => replace(replaceNext)}>Replace</button>
          <button type="button" class="text chrome" onmousedown={keepFocus} onclick={() => replace(replaceAll)}>Replace all</button>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <!-- macOS: a find bar under the title bar, as in TextEdit and Safari. -->
  <div class="find mac" role="search">
    <div class="field">
      <!-- Lucide "search" (MIT) -->
      <button type="button" class="glass-button chrome" aria-label="Find options" aria-haspopup="menu" title="Find options" onmousedown={keepFocus} onclick={openOptions}>
      <svg class="glass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
      </button>
      <input
        bind:this={field}
        value={findText}
        {...mainField}
        placeholder="Find"
        aria-label="Find"
        spellcheck="false"
        oninput={(e) => ((findText = e.currentTarget.value), findAsYouType())}
        onkeydown={findKeyDown}
      />
      <span class="status chrome" aria-live="polite">{status}</span>
    </div>
    <div class="segmented chrome">
      <button type="button" aria-label="Previous" title="Previous (⇧⌘G)" tabindex="-1" onmousedown={keepFocus} onclick={() => findPrevious(view)}>
        <!-- Lucide "chevron-left" (MIT) -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <button type="button" aria-label="Next" title="Next (⌘G)" tabindex="-1" onmousedown={keepFocus} onclick={() => findNext(view)}>
        <!-- Lucide "chevron-right" (MIT) -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>
    </div>
    <button type="button" class="push chrome" tabindex="-1" onmousedown={keepFocus} onclick={close}>Done</button>
    {#if replacing}
      <div class="field">
        <input
          value={replaceText}
          placeholder="Replace"
          aria-label="Replace"
          spellcheck="false"
          oninput={(e) => ((replaceText = e.currentTarget.value), setQuery())}
          onkeydown={replaceKeyDown}
        />
      </div>
      <button type="button" class="push chrome" tabindex="-1" onmousedown={keepFocus} onclick={() => replace(replaceNext)}>Replace</button>
      <button type="button" class="push chrome" tabindex="-1" onmousedown={keepFocus} onclick={() => replace(replaceAll)}>All</button>
    {/if}
  </div>
{/if}

<style>
  .find {
    font-family: var(--font-ui);
    font-size: var(--ui-size);
    color: var(--text);
  }
  .field {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    padding: 0;
    background: none;
    color: inherit;
    font: inherit;
    outline: none;
  }
  input::placeholder {
    color: var(--text-muted);
  }
  .status {
    flex-shrink: 0;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  button {
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
  }

  /* macOS: grid so the replace row lines up under the find row. */
  .mac {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 6px 8px;
    align-items: center;
    padding: 6px 10px;
    background: var(--surface);
    border-bottom: 1px solid var(--separator);
  }
  .mac .field {
    gap: 4px;
    height: var(--control-height);
    padding: 0 6px;
    border-radius: var(--radius-control);
    background: var(--field-bg);
    box-shadow: 0 0 0 0.5px var(--control-border);
  }
  .mac .field:focus-within {
    box-shadow: 0 0 0 3px var(--focus-ring);
  }
  .mac .glass {
    flex-shrink: 0;
    width: 12px;
    height: 12px;
    color: var(--text-muted);
  }
  .mac .glass-button {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    width: 16px;
    height: 100%;
  }
  .mac .status {
    font-size: 11px;
  }
  .mac .push,
  .mac .segmented {
    height: var(--control-height);
    border-radius: var(--radius-control);
    background: var(--control-bg);
    box-shadow:
      0 0 0 0.5px var(--control-border),
      0 0.5px 1px var(--control-border);
  }
  .mac .push {
    padding: 0 12px;
  }
  .mac .segmented {
    display: flex;
    overflow: hidden;
  }
  .mac .segmented button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    background: none;
  }
  .mac .segmented button + button {
    border-left: 1px solid var(--control-border);
  }
  .mac .segmented svg {
    width: 12px;
    height: 12px;
  }
  .mac .push:active,
  .mac .segmented button:active {
    background: color-mix(in srgb, var(--text) 12%, transparent);
  }

  /* Reserve the flyout's rows in CodeMirror's panel so even a first-line match
     stays visible. An absolute overlay cannot scroll past the document's top. */
  .windows {
    position: relative;
    margin: 8px 20px 8px auto;
    display: flex;
    align-items: flex-start;
    gap: 4px;
    width: min(420px, calc(100% - 40px));
    padding: 6px;
    border: 1px solid var(--flyout-border);
    border-radius: 8px;
    background: var(--flyout);
    box-shadow: var(--flyout-shadow);
  }
  .windows .rows {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .windows .row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .windows .field {
    flex: 1;
    gap: 6px;
    height: var(--control-height);
    padding: 0 10px;
    border: 1px solid var(--control-border);
    border-bottom-color: var(--field-underline);
    border-radius: var(--radius-control);
    background: var(--field-bg);
  }
  .windows .field:focus-within {
    border-bottom: 2px solid var(--accent);
  }
  .windows .status {
    font-size: 12px;
  }
  .windows .icon {
    flex-shrink: 0;
    width: var(--control-height);
    height: var(--control-height);
    border-radius: var(--radius-control);
    background: transparent;
    font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets";
    font-size: 12px;
  }
  .windows .text {
    flex-shrink: 0;
    height: var(--control-height);
    padding: 0 12px;
    border: 1px solid var(--control-border);
    border-radius: var(--radius-control);
    background: var(--control-bg);
  }
  .windows .icon:hover,
  .windows .text:hover {
    background: color-mix(in srgb, var(--text) 6%, transparent);
  }
  .windows .icon:active,
  .windows .text:active {
    background: color-mix(in srgb, var(--text) 4%, transparent);
    color: var(--text-muted);
  }
</style>
