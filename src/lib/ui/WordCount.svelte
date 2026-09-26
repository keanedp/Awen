<script lang="ts">
  let { text }: { text: string } = $props();
</script>

<!-- Not a live region: it changes with every keystroke. -->
<footer class="word-count chrome">{text}</footer>

<style>
  .word-count {
    flex: none;
    padding: 4px 16px 6px;
    text-align: center;
    color: var(--text-muted);
    font-size: calc(var(--ui-size) - 2px);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
