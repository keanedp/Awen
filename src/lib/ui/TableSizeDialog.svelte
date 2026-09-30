<script lang="ts">
  import { Dialog } from "bits-ui";
  import { tableLimits } from "$lib/editor/format";

  let {
    open = $bindable(false),
    onsubmit,
    onclose,
  }: {
    open: boolean;
    /** The size chosen; the fields may hold anything, so the receiver clamps it. */
    onsubmit: (columns: number, rows: number) => void;
    /** Called after the dialog closes either way, to return focus to the editor. */
    onclose: () => void;
  } = $props();

  let columns = $state("3");
  let rows = $state("3");

  function submit(e: SubmitEvent) {
    e.preventDefault();
    open = false;
    onsubmit(Number(columns), Number(rows));
  }
</script>

<!-- A sheet-like alert, as in native Markdown editors: two number fields, Cancel and OK. -->
<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="table-size-overlay" />
    <Dialog.Content
      class="table-size chrome"
      onOpenAutoFocus={(e) => {
        // Straight to the first field, with its number selected.
        e.preventDefault();
        const field = document.getElementById("table-columns") as HTMLInputElement | null;
        field?.focus();
        field?.select();
      }}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        // The focus trap is removed now, for Cancel, Esc, outside clicks and OK.
        onclose();
      }}
    >
      <form onsubmit={submit}>
        <Dialog.Title class="title">Adjust table size. First row will contain table heading.</Dialog.Title>
        <Dialog.Description class="sr-only">Choose the number of columns and rows for the new table.</Dialog.Description>
        <div class="fields">
          <label>
            <input id="table-columns" type="number" min="1" max={tableLimits.columns} step="1" bind:value={columns} />
            columns
          </label>
          <label>
            <input id="table-rows" type="number" min="1" max={tableLimits.rows} step="1" bind:value={rows} />
            rows
          </label>
        </div>
        <div class="buttons">
          <button type="button" onclick={() => (open = false)}>Cancel</button>
          <button type="submit" class="primary">OK</button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* Portalled to <body>, so these are global. */
  :global(.table-size-overlay) {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgb(0 0 0 / 0.25);
  }
  :global(.table-size) {
    position: fixed;
    top: 30%;
    left: 50%;
    z-index: 51;
    width: 320px;
    transform: translateX(-50%);
    padding: 20px;
    border-radius: 10px;
    background: var(--menu-bg, var(--surface));
    box-shadow: var(--menu-shadow, 0 8px 24px rgb(0 0 0 / 0.25));
    backdrop-filter: blur(20px);
    color: var(--text);
    font-family: var(--font-ui);
    font-size: var(--ui-size);
  }
  :global(.table-size .title) {
    margin: 0 0 16px;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
  }
  :global(.table-size .sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    margin-bottom: 20px;
  }
  label {
    display: flex;
    gap: 8px;
    align-items: center;
    width: 140px;
  }
  input {
    width: 64px;
    height: var(--control-height, 24px);
    padding: 0 6px;
    border: 0;
    border-radius: var(--radius-control);
    background: var(--field-bg, var(--surface));
    box-shadow: 0 0 0 0.5px var(--control-border, var(--separator));
    color: inherit;
    font: inherit;
    text-align: right;
    outline: none;
  }
  input:focus {
    box-shadow: 0 0 0 3px var(--focus-ring, var(--accent));
  }
  .buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  button {
    height: calc(var(--control-height, 24px) + 4px);
    border: 0;
    border-radius: var(--radius-control);
    background: var(--control-bg, var(--surface));
    box-shadow: 0 0 0 0.5px var(--control-border, var(--separator));
    color: inherit;
    font: inherit;
  }
  button.primary {
    background: var(--accent);
    color: white;
  }
  button:focus-visible {
    outline: 3px solid var(--focus-ring, var(--accent));
    outline-offset: 1px;
  }
</style>
