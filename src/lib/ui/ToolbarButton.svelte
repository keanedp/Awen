<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    shortcut,
    pressed,
    onclick,
    children,
  }: {
    label: string;
    /** Shown in the tooltip, e.g. "⌘R" or "Ctrl+R". */
    shortcut?: string;
    /** Set for toggle buttons; omit for plain actions. */
    pressed?: boolean;
    onclick: () => void;
    children: Snippet;
  } = $props();
</script>

<!-- mousedown is cancelled so clicking never takes focus (or the caret) from the editor. -->
<button
  type="button"
  class="toolbar-button chrome"
  aria-label={label}
  aria-pressed={pressed}
  title={shortcut ? `${label} (${shortcut})` : label}
  onmousedown={(e) => e.preventDefault()}
  {onclick}
>
  {@render children()}
</button>

<style>
  .toolbar-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--toolbar-button-width);
    height: var(--toolbar-button-height);
    padding: 0;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--text-muted);
  }
  .toolbar-button:hover {
    background: color-mix(in srgb, var(--text) 8%, transparent);
  }
  .toolbar-button:active {
    background: color-mix(in srgb, var(--text) 14%, transparent);
  }
  .toolbar-button[aria-pressed="true"] {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .toolbar-button :global(svg) {
    width: var(--toolbar-icon-size);
    height: var(--toolbar-icon-size);
  }
</style>
