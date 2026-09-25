<script lang="ts">
  import { onMount } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";

  let { html, line, onexit }: { html: string; line: number; onexit: () => void } = $props();

  let scroller: HTMLElement;

  function blocks(): HTMLElement[] {
    return Array.from(scroller.querySelectorAll<HTMLElement>("[data-line]"));
  }

  /** Source line of the first block visible at the top of the preview. */
  export function topLine(): number {
    const top = scroller.getBoundingClientRect().top;
    const visible = blocks().find((el) => el.getBoundingClientRect().bottom > top);
    return visible ? Number(visible.dataset.line) : 0;
  }

  onMount(() => {
    const target = blocks().findLast((el) => Number(el.dataset.line) <= line);
    if (target) {
      scroller.scrollTop =
        target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    }
    scroller.focus();
  });

  // The webview must never navigate away from the app.
  function onclick(e: MouseEvent) {
    const link = (e.target as Element).closest("a");
    if (!link) return;
    e.preventDefault();
    const href = link.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      const id = decodeURIComponent(href.slice(1));
      scroller.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView();
    } else if (/^(https?|mailto):/i.test(href)) {
      openUrl(href);
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onexit();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
<div
  class="h-full overflow-y-auto outline-none"
  tabindex="0"
  role="document"
  bind:this={scroller}
  {onclick}
  {onkeydown}
>
  <article class="preview">{@html html}</article>
</div>
