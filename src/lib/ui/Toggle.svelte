<script lang="ts">
  import { Switch } from "bits-ui";

  let {
    checked,
    label,
    onchange,
  }: {
    checked: boolean;
    /** For assistive tech; the settings row shows it beside the switch. */
    label: string;
    onchange: (checked: boolean) => void;
  } = $props();
</script>

<!-- A switch, as in System Settings and Windows 11 Settings; Windows labels it On/Off. -->
<span class="toggle">
  <span class="state" aria-hidden="true">{checked ? "On" : "Off"}</span>
  <Switch.Root class="switch" {checked} onCheckedChange={onchange} aria-label={label}>
    <Switch.Thumb class="thumb" />
  </Switch.Root>
</span>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }
  .state {
    display: none;
  }
  .toggle :global(.switch) {
    position: relative;
    flex: none;
    padding: 0;
    border: 0;
    border-radius: 999px;
  }
  .toggle :global(.thumb) {
    position: absolute;
    top: 50%;
    border-radius: 50%;
    transition:
      left 0.15s ease,
      width 0.1s ease,
      height 0.1s ease;
  }

  /* macOS: a small switch, accent when on, with a white knob. */
  :global([data-os="mac"]) .toggle :global(.switch) {
    width: 32px;
    height: 18px;
    background: color-mix(in srgb, var(--text) 12%, transparent);
    box-shadow: inset 0 0 0 0.5px var(--control-border);
  }
  :global([data-os="mac"]) .toggle :global(.switch[data-state="checked"]) {
    background: var(--accent);
  }
  :global([data-os="mac"]) .toggle :global(.thumb) {
    left: 1px;
    width: 16px;
    height: 16px;
    transform: translateY(-50%);
    background: #fff;
    box-shadow:
      0 0 0 0.5px rgb(0 0 0 / 0.15),
      0 1px 2px rgb(0 0 0 / 0.2);
  }
  :global([data-os="mac"]) .toggle :global(.thumb[data-state="checked"]) {
    left: 15px;
  }

  /* Windows 11: Fluent ToggleSwitch, outlined when off, accent-filled when on. */
  :global([data-os="windows"]) .state {
    display: inline;
    min-width: 2em;
    text-align: right;
  }
  :global([data-os="windows"]) .toggle :global(.switch) {
    width: 40px;
    height: 20px;
    border: 1px solid var(--field-underline);
    background: var(--control-bg);
  }
  :global([data-os="windows"]) .toggle :global(.switch[data-state="checked"]) {
    border-color: var(--accent);
    background: var(--accent);
  }
  :global([data-os="windows"]) .toggle :global(.thumb) {
    left: 3px;
    width: 12px;
    height: 12px;
    transform: translateY(-50%);
    background: var(--text);
    opacity: 0.8;
  }
  :global([data-os="windows"]) .toggle :global(.switch:hover .thumb) {
    width: 14px;
    height: 14px;
    left: 2px;
  }
  :global([data-os="windows"]) .toggle :global(.thumb[data-state="checked"]) {
    left: 23px;
    background: var(--text-on-accent);
    opacity: 1;
  }
  :global([data-os="windows"]) .toggle :global(.switch:hover .thumb[data-state="checked"]) {
    left: 22px;
  }
</style>
