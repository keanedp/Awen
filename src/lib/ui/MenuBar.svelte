<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { trackMenuBar } from "$lib/menu";
  import { accessKeyParts, altTap, barKey, MENUS, menuForKey, showMenuAccessKeys, updateMenuCues, type MenuCueState } from "$lib/menubar";

  // The Windows menu bar (W-073): titles drawn here, menus opened as
  // native popups by Rust (`menubar.rs`), which also moves between them.

  const appWindow = getCurrentWindow();
  const buttons: HTMLButtonElement[] = [];
  /** The menu showing its popup. */
  let open = $state<number | null>(null);
  /** The title highlighted by the keyboard (after Alt, F10 or Esc), with no menu open. */
  let focus = $state<number | null>(null);
  let cueState = $state<MenuCueState>({ altHeld: false, keyboardOpen: false });
  /** Access keys are underlined only while the keyboard is driving the bar, as in Windows. */
  const cues = $derived(showMenuAccessKeys(cueState, focus !== null, open !== null));

  async function openMenu(index: number, keyboard = false) {
    cueState = updateMenuCues(cueState, keyboard ? "open-keyboard" : "open-pointer");
    focus = null;
    const titles = MENUS.map(({ title }, i) => {
      const { left, top, right, bottom } = buttons[i].getBoundingClientRect();
      return { name: title, left, top, right, bottom };
    });
    open = index;
    try {
      focus = await trackMenuBar(titles, index);
    } catch (e) {
      console.error(e);
    } finally {
      open = null;
      cueState = updateMenuCues(cueState, "closed");
    }
  }

  onMount(() => {
    const tap = altTap();

    // Captured before the editor sees them: while the bar has focus, every key is the bar's.
    const keydown = (e: KeyboardEvent) => {
      tap.keydown(e);
      if (e.key === "Alt") cueState = updateMenuCues(cueState, "alt-down");
      if (open !== null) return;
      let action;
      if (focus !== null) action = barKey(focus, e);
      else if (e.key === "F10" && !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) action = { move: 0 };
      else {
        const index = menuForKey(e);
        if (index === null) return;
        action = { open: index };
      }
      e.preventDefault();
      e.stopPropagation();
      if (action === "exit") focus = null;
      else if (action && "move" in action) focus = action.move;
      else if (action) openMenu(action.open, true);
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.key !== "Alt") return tap.keyup(e);
      cueState = updateMenuCues(cueState, "alt-up");
      if (tap.keyup(e) && open === null) {
        e.preventDefault();
        focus = focus === null ? 0 : null;
      }
    };
    const reset = () => {
      tap.cancel();
      focus = null;
    };
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("keyup", keyup, true);
    window.addEventListener("mousedown", reset, true);
    const unlisten = [
      // Rust names each menu as it opens, including when the pointer or arrows move to another.
      appWindow.listen<string>("menu-bar", ({ payload }) => {
        open = MENUS.findIndex(({ title }) => title === payload);
      }),
      appWindow.onFocusChanged(({ payload }) => {
        if (payload) return;
        reset();
        cueState = updateMenuCues(cueState, "closed");
      }),
    ];
    return () => {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("mousedown", reset, true);
      unlisten.forEach((p) => p.then((fn) => fn()));
    };
  });
</script>

<nav class="menus" class:cues aria-label="Menu bar">
  {#each MENUS as menu, i (menu.title)}
    {@const [before, key, after] = accessKeyParts(menu)}
    <!-- mousedown is cancelled so opening a menu doesn't take focus from the editor. -->
    <button
      type="button"
      class="menu"
      class:open={open === i}
      class:focus={focus === i}
      tabindex="-1"
      aria-haspopup="menu"
      aria-expanded={open === i}
      aria-keyshortcuts="Alt+{key.toUpperCase()}"
      bind:this={buttons[i]}
      onmousedown={(e) => e.preventDefault()}
      onclick={() => openMenu(i)}
    >{before}<span class="key">{key}</span>{after}</button>
  {/each}
</nav>

<style>
  .menus {
    display: flex;
    flex-shrink: 0;
  }
  /* Like Windows 11 Notepad's menu bar: text buttons with a rounded hover fill. */
  .menu {
    height: var(--toolbar-button-height);
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: inherit;
    font: inherit;
  }
  .menu:hover,
  .menu.focus,
  .menu.open {
    background: color-mix(in srgb, var(--text) 8%, transparent);
  }
  .cues .key {
    text-decoration: underline;
  }
</style>
