<script lang="ts" generics="T extends string">
  import { Select } from "bits-ui";

  let {
    value,
    options,
    label,
    onchange,
  }: {
    value: T;
    options: { value: T; label: string }[];
    /** For assistive tech; the settings row shows it beside the button. */
    label: string;
    onchange: (value: T) => void;
  } = $props();

  const current = $derived(options.find((o) => o.value === value)?.label ?? "");
</script>

<!-- A pop-up button on macOS, a ComboBox on Windows. -->
<Select.Root type="single" {value} items={options} onValueChange={(v) => onchange(v as T)}>
  <Select.Trigger class="choice" aria-label={label}>
    <span class="choice-label">{current}</span>
    <svg class="chevron mac-only" viewBox="0 0 8 12" aria-hidden="true">
      <path d="M1.5 4.5 4 2l2.5 2.5M1.5 7.5 4 10l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span class="chevron windows-only" aria-hidden="true">&#xE70D;</span>
  </Select.Trigger>
  <Select.Portal>
    <Select.Content class="choice-menu chrome" sideOffset={4} align="end">
      <Select.Viewport>
        {#each options as option (option.value)}
          <Select.Item class="choice-item" value={option.value} label={option.label}>
            {#snippet children({ selected })}
              <span class="check" aria-hidden="true">{selected ? "✓" : ""}</span>
              {option.label}
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>

<style>
  /* The menu is portalled to <body>, so its styles are global. */
  :global(.choice) {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: var(--control-height);
    border: 0;
    border-radius: var(--radius-control);
    color: var(--text);
    font: inherit;
    white-space: nowrap;
  }
  .chevron {
    flex: none;
  }
  :global(.choice-menu) {
    z-index: 10;
    min-width: var(--bits-select-anchor-width);
    font-family: var(--font-ui);
    font-size: var(--ui-size);
    color: var(--text);
    outline: none;
  }
  :global(.choice-item) {
    display: flex;
    align-items: center;
    gap: 6px;
    outline: none;
    white-space: nowrap;
  }
  .check {
    flex: none;
    width: 1em;
    text-align: center;
  }

  /* macOS: a pop-up button (label and up/down chevrons) opening a menu with checkmarks. */
  :global([data-os="mac"]) .windows-only,
  :global([data-os="windows"]) .mac-only {
    display: none;
  }
  :global([data-os="mac"] .choice) {
    padding: 0 6px 0 9px;
    background: var(--control-bg);
    box-shadow:
      0 0 0 0.5px var(--control-border),
      0 0.5px 1px var(--control-border);
  }
  :global([data-os="mac"]) .chevron {
    width: 7px;
    height: 11px;
  }
  :global([data-os="mac"] .choice-menu) {
    padding: 5px;
    border-radius: 8px;
    background: var(--menu-bg);
    box-shadow: var(--menu-shadow);
    -webkit-backdrop-filter: blur(30px) saturate(1.5);
    backdrop-filter: blur(30px) saturate(1.5);
  }
  :global([data-os="mac"] .choice-item) {
    height: 22px;
    padding: 0 12px 0 4px;
    border-radius: 4px;
  }
  :global([data-os="mac"] .choice-item[data-highlighted]) {
    background: var(--accent);
    color: #fff;
  }

  /* Windows 11: a ComboBox opening a Fluent list, the selection marked with an accent pill. */
  :global([data-os="windows"] .choice) {
    min-width: 160px;
    justify-content: space-between;
    padding: 0 11px;
    border: 1px solid var(--control-border);
    border-bottom-color: var(--field-underline);
    background: var(--control-bg);
  }
  :global([data-os="windows"] .choice:hover) {
    background: color-mix(in srgb, var(--control-bg) 80%, var(--text) 4%);
  }
  :global([data-os="windows"]) .chevron {
    font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets";
    font-size: 12px;
    color: var(--text-muted);
  }
  :global([data-os="windows"] .choice-menu) {
    padding: 4px;
    border: 1px solid var(--flyout-border);
    border-radius: 8px;
    background: var(--flyout);
    box-shadow: var(--flyout-shadow);
  }
  :global([data-os="windows"] .choice-item) {
    position: relative;
    height: 32px;
    padding: 0 12px;
    border-radius: var(--radius-control);
  }
  :global([data-os="windows"]) .check {
    display: none;
  }
  :global([data-os="windows"] .choice-item[data-highlighted]) {
    background: color-mix(in srgb, var(--text) 6%, transparent);
  }
  :global([data-os="windows"] .choice-item[data-selected]) {
    background: color-mix(in srgb, var(--text) 4%, transparent);
  }
  :global([data-os="windows"] .choice-item[data-selected])::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    width: 3px;
    height: 16px;
    border-radius: 2px;
    background: var(--accent);
    transform: translateY(-50%);
  }
</style>
