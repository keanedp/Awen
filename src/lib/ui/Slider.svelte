<script lang="ts">
  import type { Snippet } from "svelte";
  import { Slider } from "bits-ui";

  let {
    value,
    steps,
    label,
    onchange,
    start,
    end,
  }: {
    value: number;
    /** The values it snaps to, each marked with a tick. */
    steps: number[];
    label: string;
    onchange: (value: number) => void;
    /** Shown before and after the track, e.g. a small and a large "A". */
    start?: Snippet;
    end?: Snippet;
  } = $props();
</script>

<span class="slider">
  {@render start?.()}
  <Slider.Root
    type="single"
    class="slider-root"
    {value}
    step={steps}
    min={steps[0]}
    max={steps[steps.length - 1]}
    onValueChange={onchange}
    aria-label={label}
  >
    {#snippet children({ ticks, thumbs })}
      <span class="track"></span>
      <Slider.Range class="range" />
      {#each ticks as index (index)}
        <Slider.Tick class="tick" {index} />
      {/each}
      {#each thumbs as index (index)}
        <Slider.Thumb class="thumb" {index} aria-label={label} />
      {/each}
    {/snippet}
  </Slider.Root>
  {@render end?.()}
</span>

<style>
  .slider {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .slider :global(.slider-root) {
    position: relative;
    display: flex;
    align-items: center;
    width: 180px;
    height: 24px;
    touch-action: none;
  }
  /* Bits positions the range, ticks and thumb horizontally (with `translate`); these center them vertically. */
  .track,
  .slider :global(.range) {
    top: 50%;
    height: 4px;
    margin-top: -2px;
    border-radius: 2px;
  }
  .track {
    position: absolute;
    left: 0;
    right: 0;
    background: color-mix(in srgb, var(--text) 15%, transparent);
  }
  .slider :global(.range) {
    background: var(--accent);
  }
  .slider :global(.tick) {
    width: 2px;
    height: 6px;
    top: calc(50% + 6px);
    border-radius: 1px;
    background: color-mix(in srgb, var(--text) 25%, transparent);
  }
  .slider :global(.thumb) {
    display: block;
    top: 50%;
    border-radius: 50%;
    outline-offset: 2px;
  }

  /* macOS: a round white knob over the track, ticks below. */
  :global([data-os="mac"]) .slider :global(.thumb) {
    width: 18px;
    height: 18px;
    margin-top: -9px;
    background: #fff;
    box-shadow:
      0 0 0 0.5px rgb(0 0 0 / 0.2),
      0 1px 2px rgb(0 0 0 / 0.25);
  }

  /* Windows 11: Fluent slider, an accent dot in a ring that grows on hover. */
  :global([data-os="windows"]) .slider :global(.thumb) {
    width: 20px;
    height: 20px;
    margin-top: -10px;
    background: radial-gradient(circle, var(--accent) 0 5px, var(--flyout) 6px);
    box-shadow: 0 0 0 1px var(--control-border);
  }
  :global([data-os="windows"]) .slider :global(.thumb:hover) {
    background: radial-gradient(circle, var(--accent) 0 6px, var(--flyout) 7px);
  }
</style>
