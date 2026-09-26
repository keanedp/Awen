<script lang="ts">
  import { onMount, tick } from "svelte";
  import { LogicalSize } from "@tauri-apps/api/dpi";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { setFormatEnabled, setMenuChecked } from "$lib/menu";
  import { applyAccent, applyPlatform, type OS } from "$lib/platform";
  import {
    defaults,
    loadPreferences,
    onPreferenceChanged,
    setPreference,
    setPreferences,
    type Preferences,
  } from "$lib/preferences";
  import { textSizes, viewChange, type ColumnWidth, type LineSpacing, type Theme } from "$lib/settings";
  import Choice from "$lib/ui/Choice.svelte";
  import Slider from "$lib/ui/Slider.svelte";
  import Toggle from "$lib/ui/Toggle.svelte";

  let os = $state<OS>("mac");
  let prefs = $state<Preferences>({ ...defaults });
  /** Until then `prefs` holds defaults, which mustn't reach the menu. */
  let prefsLoaded = $state(false);
  let content: HTMLElement;

  const appWindow = getCurrentWebviewWindow();

  const columnWidths: { value: ColumnWidth; label: string }[] = [
    { value: "narrow", label: "Narrow" },
    { value: "medium", label: "Medium" },
    { value: "wide", label: "Wide" },
  ];
  const lineSpacings: { value: LineSpacing; label: string }[] = [
    { value: "tight", label: "Tight" },
    { value: "normal", label: "Normal" },
    { value: "loose", label: "Loose" },
  ];
  // Each OS's own words for following the system.
  const themes = $derived<{ value: Theme; label: string }[]>([
    { value: "system", label: os === "windows" ? "Use system setting" : "Match System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ]);

  // Document windows keep these in step too, but Settings may be the only window open.
  $effect(() => {
    if (prefsLoaded) setMenuChecked("word_count", prefs.wordCount);
  });
  $effect(() => {
    if (prefsLoaded) setMenuChecked("code_highlighting", prefs.codeHighlighting);
  });

  /** Applies a setting here at once, so dragging and key repeats build on it, then in every window. */
  function set<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    prefs[key] = value;
    setPreference(key, value);
  }

  /** The View menu reaches Settings when it is the focused window. */
  function onMenu(id: string) {
    if (id === "close") return appWindow.close();
    const change = viewChange(id, prefs);
    if (!change) return;
    Object.assign(prefs, change);
    setPreferences(change);
  }

  /** Sets the window's height to the page's (on macOS that includes the title bar). */
  function fit() {
    const height = Math.ceil(content.getBoundingClientRect().height);
    if (height !== window.innerHeight) return appWindow.setSize(new LogicalSize(window.innerWidth, height));
  }

  /**
   * Rust opens the window hidden; it appears once it fits its content. Fonts
   * and the controls can still change the height after the first render, so
   * it measures once they have loaded, and refits if the height changes later.
   */
  async function fitAndShow() {
    await tick();
    await document.fonts.ready;
    await fit();
    new ResizeObserver(() => fit()).observe(content);
    await appWindow.show();
    await appWindow.setFocus();
  }

  onMount(() => {
    os = applyPlatform();
    applyAccent();

    // Settings is all app chrome: no web context menu.
    const blockMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", blockMenu);

    loadPreferences()
      .then((saved) => {
        prefs = saved;
        prefsLoaded = true;
      })
      .finally(fitAndShow);

    const unlisten = [
      onPreferenceChanged((change) => Object.assign(prefs, change)),
      appWindow.listen<string>("menu", ({ payload }) => onMenu(payload)),
      appWindow.onFocusChanged(({ payload: focused }) => {
        if (!focused) return;
        // There's no text to format here.
        setFormatEnabled(false);
        // The user may have changed it in System Settings meanwhile.
        applyAccent();
      }),
    ];

    return () => {
      document.removeEventListener("contextmenu", blockMenu);
      unlisten.forEach((p) => p.then((fn) => fn()));
    };
  });
</script>

<div class="settings chrome">
  <!-- macOS: the page runs under the title bar, which still has to drag the window. -->
  <div class="drag" data-tauri-drag-region></div>
  <div class="content" bind:this={content}>
    <section>
      <h2>Editor</h2>
      <div class="group">
        <div class="row">
          <span>Text size</span>
          <Slider value={prefs.textSize} steps={textSizes} label="Text size" onchange={(v) => set("textSize", v)}>
            {#snippet start()}<span class="size small" aria-hidden="true">A</span>{/snippet}
            {#snippet end()}<span class="size large" aria-hidden="true">A</span>{/snippet}
          </Slider>
        </div>
        <div class="row">
          <span>Column width</span>
          <Choice
            value={prefs.columnWidth}
            options={columnWidths}
            label="Column width"
            onchange={(v) => set("columnWidth", v)}
          />
        </div>
        <div class="row">
          <span>Line spacing</span>
          <Choice
            value={prefs.lineSpacing}
            options={lineSpacings}
            label="Line spacing"
            onchange={(v) => set("lineSpacing", v)}
          />
        </div>
        <div class="row">
          <span>Check spelling while typing</span>
          <Toggle
            checked={prefs.spellcheck}
            label="Check spelling while typing"
            onchange={(v) => set("spellcheck", v)}
          />
        </div>
      </div>
    </section>

    <section>
      <h2>View</h2>
      <div class="group">
        <div class="row">
          <span>{os === "windows" ? "App theme" : "Appearance"}</span>
          <Choice
            value={prefs.theme}
            options={themes}
            label={os === "windows" ? "App theme" : "Appearance"}
            onchange={(v) => set("theme", v)}
          />
        </div>
        <div class="row">
          <span>Word count</span>
          <Toggle checked={prefs.wordCount} label="Word count" onchange={(v) => set("wordCount", v)} />
        </div>
        <div class="row">
          <span>Code highlighting</span>
          <Toggle
            checked={prefs.codeHighlighting}
            label="Code highlighting"
            onchange={(v) => set("codeHighlighting", v)}
          />
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  .settings {
    position: relative;
    min-height: 100%;
    background: var(--settings-bg);
    color: var(--text);
    font-size: var(--ui-size);
  }
  h2 {
    margin: 0;
    font-size: inherit;
    font-weight: 600;
  }
  .group {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .size {
    color: var(--text-muted);
    line-height: 1;
  }
  .size.small {
    font-size: 10px;
  }
  .size.large {
    font-size: 16px;
  }

  /* macOS: System Settings' grouped form, rows in one rounded box. */
  .drag {
    display: none;
  }
  :global([data-os="mac"]) .drag {
    display: block;
    position: absolute;
    inset: 0 0 auto;
    height: var(--titlebar-height);
  }
  :global([data-os="mac"]) .content {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 20px;
    padding-top: calc(var(--titlebar-height) + 20px);
  }
  :global([data-os="mac"]) h2 {
    margin: 0 0 6px 10px;
  }
  :global([data-os="mac"]) .group {
    padding: 0 10px;
    border: 1px solid var(--group-border);
    border-radius: 10px;
    background: var(--group-bg);
  }
  :global([data-os="mac"]) .row {
    min-height: 40px;
  }
  :global([data-os="mac"]) .row + .row {
    border-top: 1px solid var(--group-border);
  }

  /* Windows 11: Settings cards, one per setting. */
  :global([data-os="windows"]) .content {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 16px 20px 24px;
  }
  :global([data-os="windows"]) h2 {
    margin-bottom: 8px;
  }
  :global([data-os="windows"]) .group {
    gap: 4px;
  }
  :global([data-os="windows"]) .row {
    min-height: 64px;
    padding: 0 16px;
    border: 1px solid var(--group-border);
    border-radius: var(--radius-control);
    background: var(--group-bg);
  }
</style>
