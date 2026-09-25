declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";

  interface TaskListsOptions {
    /** Render checkboxes as clickable instead of disabled. */
    enabled?: boolean;
    /** Wrap the item text in a <label>. */
    label?: boolean;
    /** Put the label after the checkbox rather than around it. */
    labelAfter?: boolean;
  }

  const taskLists: (md: MarkdownIt, options?: TaskListsOptions) => void;
  export default taskLists;
}
