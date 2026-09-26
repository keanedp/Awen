<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import type { OS } from "$lib/platform";
  import ToolbarButton from "./ToolbarButton.svelte";

  let {
    os,
    name,
    dirty,
    previewing,
    onTogglePreview,
  }: {
    os: OS;
    name: string;
    dirty: boolean;
    previewing: boolean;
    onTogglePreview: () => void;
  } = $props();

  const appWindow = getCurrentWindow();
  let maximized = $state(false);
  let focused = $state(true);

  // Windows draws its own caption buttons, so it tracks maximize and focus state.
  onMount(() => {
    if (os !== "windows") return;
    const sync = async () => (maximized = await appWindow.isMaximized());
    sync();
    const unlisten = [
      appWindow.onResized(sync),
      appWindow.onFocusChanged(({ payload }) => (focused = payload)),
    ];
    return () => unlisten.forEach((p) => p.then((fn) => fn()));
  });
</script>

{#snippet previewButton()}
  <ToolbarButton
    label="Preview"
    shortcut={os === "mac" ? "⌘R" : "Ctrl+R"}
    pressed={previewing}
    onclick={onTogglePreview}
  >
    <!-- Lucide "play" (MIT) -->
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  </ToolbarButton>
{/snippet}

{#if os === "mac"}
  <!-- Traffic lights sit over the left edge (Overlay title bar). -->
  <header class="titlebar mac chrome" data-tauri-drag-region>
    <span class="title">
      {name}{#if dirty}<span class="edited"> — Edited</span>{/if}
    </span>
    <div class="actions">{@render previewButton()}</div>
  </header>
{:else if os === "windows"}
  <header class="titlebar windows chrome" class:inactive={!focused} data-tauri-drag-region>
    <span class="title">{dirty ? "*" : ""}{name} - Writer</span>
    <div class="actions">
      {@render previewButton()}
      <div class="captions">
        <button type="button" class="caption" aria-label="Minimize" tabindex="-1" onclick={() => appWindow.minimize()}>&#xE921;</button>
        <button type="button" class="caption" aria-label={maximized ? "Restore" : "Maximize"} tabindex="-1" onclick={() => appWindow.toggleMaximize()}>
          {@html maximized ? "&#xE923;" : "&#xE922;"}
        </button>
        <button type="button" class="caption close" aria-label="Close" tabindex="-1" onclick={() => appWindow.close()}>&#xE8BB;</button>
      </div>
    </div>
  </header>
{/if}

<style>
  .titlebar {
    position: relative;
    display: flex;
    flex-shrink: 0;
    align-items: center;
    height: var(--titlebar-height);
    font-family: var(--font-ui);
    color: var(--text-muted);
  }
  .title {
    pointer-events: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    display: flex;
    align-items: center;
    height: 100%;
  }

  /* macOS: centered title, toolbar button at the trailing edge. */
  .mac {
    justify-content: center;
    font-size: var(--ui-size);
  }
  .mac .title {
    padding: 0 80px;
  }
  .mac .edited {
    opacity: 0.7;
  }
  .mac .actions {
    position: absolute;
    right: 8px;
  }

  /* Windows 11: left-aligned title, caption buttons flush right. */
  .windows {
    justify-content: space-between;
    padding-left: 12px;
    font-size: 12px;
    background: var(--chrome);
    color: var(--text);
  }
  .windows.inactive .title,
  .windows.inactive .caption {
    color: var(--text-muted);
  }
  .windows .actions {
    gap: 4px;
  }
  .captions {
    display: flex;
    height: 100%;
  }
  .caption {
    width: 46px;
    height: 100%;
    border: 0;
    background: transparent;
    color: var(--text);
    font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets";
    font-size: 10px;
  }
  .caption:hover {
    background: color-mix(in srgb, var(--text) 8%, transparent);
  }
  .caption:active {
    background: color-mix(in srgb, var(--text) 5%, transparent);
  }
  .caption.close:hover {
    background: #c42b1c;
    color: #fff;
  }
  .caption.close:active {
    background: #c83c31;
    color: #fff;
  }
</style>
