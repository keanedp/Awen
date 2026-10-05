<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import type { OS } from "$lib/platform";
  import MenuBar from "./MenuBar.svelte";
  import ToolbarButton from "./ToolbarButton.svelte";

  let {
    os,
    name,
    dirty,
    locked,
    previewing,
    renaming,
    onTogglePreview,
    onRename,
  }: {
    os: OS;
    name: string;
    dirty: boolean;
    /** The file is locked (macOS); shown instead of "Edited". */
    locked: boolean;
    previewing: boolean;
    /** The title popover (macOS) is open. */
    renaming: boolean;
    onTogglePreview: () => void;
    onRename: () => void;
  } = $props();

  const appWindow = getCurrentWindow();
  let maximized = $state(false);
  let focused = $state(true);
  let chevron = $state<SVGElement>();

  /** Where the title popover points: the chevron after the title. */
  export function anchor(): DOMRect {
    return chevron!.getBoundingClientRect();
  }

  // A click on the title while the popover is open closes it (AppKit does that
  // on mouse-down), and must not reopen it. The close can reach us just before
  // or just after the mouse-down, so both cases are checked.
  let closedAt = 0;
  $effect(() => {
    if (!renaming) closedAt = performance.now();
  });

  /** A click opens the popover; a drag moves the window, as on the rest of the title bar. */
  function titleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault(); // keep focus and the caret in the editor
    if (e.detail > 1 || renaming || performance.now() - closedAt < 300) return;
    const [x, y] = [e.screenX, e.screenY];
    const move = (m: MouseEvent) => {
      if (Math.hypot(m.screenX - x, m.screenY - y) < 3) return;
      done();
      appWindow.startDragging();
    };
    const up = () => {
      done();
      onRename();
    };
    const done = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  // Windows draws its own caption buttons, so it tracks maximize and focus state.
  $effect(() => {
    if (os !== "windows") return;
    const sync = async () => (maximized = await appWindow.isMaximized());
    let resizeTimer: ReturnType<typeof setTimeout>;
    const afterResize = () => {
      // Maximizing via the native title bar emits several resize events. Query
      // after the final one so the custom caption follows OS double-clicks too.
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sync, 80);
    };
    sync();
    const unlisten = [
      appWindow.onResized(afterResize),
      appWindow.onFocusChanged(({ payload }) => (focused = payload)),
    ];
    return () => {
      clearTimeout(resizeTimer);
      unlisten.forEach((p) => p.then((fn) => fn()));
    };
  });

  async function toggleMaximize() {
    await appWindow.toggleMaximize();
    maximized = await appWindow.isMaximized();
  }
</script>

{#snippet previewButton()}
  <ToolbarButton
    label="Preview"
    shortcut={os === "mac" ? "⌘R" : "Ctrl+R"}
    pressed={previewing}
    onclick={onTogglePreview}
  >
    <!-- Lucide "play" (MIT) -->
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  </ToolbarButton>
{/snippet}

{#if os === "mac"}
  <!-- Traffic lights sit over the left edge (Overlay title bar). -->
  <header class="titlebar mac chrome" data-tauri-drag-region>
    <button type="button" class="title" class:open={renaming} tabindex="-1" onmousedown={titleMouseDown}>
      <span class="name">{name}{#if locked}<span class="edited"> — Locked</span>{:else if dirty}<span class="edited"> — Edited</span>{/if}</span>
      <!-- Lucide "chevron-down" (MIT) -->
      <svg bind:this={chevron} class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <div class="actions">{@render previewButton()}</div>
  </header>
{:else if os === "windows"}
  <header class="titlebar windows chrome" class:inactive={!focused} data-tauri-drag-region>
    <div class="lead" data-tauri-drag-region>
      <MenuBar />
      <span class="title">{dirty ? "*" : ""}{name} - Awen</span>
    </div>
    <div class="actions">
      {@render previewButton()}
      <div class="captions">
        <button type="button" class="caption" aria-label="Minimize" tabindex="-1" onclick={() => appWindow.minimize()}>&#xE921;</button>
        <button type="button" class="caption" aria-label={maximized ? "Restore" : "Maximize"} tabindex="-1" onclick={toggleMaximize}>
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
  /* The title opens the rename popover, so unlike on Windows it takes clicks.
     The padding keeps it clear of the traffic lights and toolbar buttons. */
  .mac .title {
    display: flex;
    align-items: center;
    gap: 3px;
    max-width: calc(100% - 160px);
    pointer-events: auto;
    border: 0;
    padding: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: default;
  }
  .mac .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mac .chevron {
    flex-shrink: 0;
    width: 11px;
    height: 11px;
    opacity: 0;
  }
  .mac .title:hover .chevron,
  .mac .title.open .chevron {
    opacity: 1;
  }
  .mac .edited {
    opacity: 0.7;
  }
  .mac .actions {
    position: absolute;
    right: 8px;
  }

  /* Windows 11: menus and title on the left, caption buttons flush right. */
  .windows {
    justify-content: space-between;
    padding-left: 4px;
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
  .lead {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .windows.inactive .lead {
    color: var(--text-muted);
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
