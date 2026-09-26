declare module "markdown-it-mark" {
  import type MarkdownIt from "markdown-it";

  /** Renders `==text==` as `<mark>text</mark>`. */
  const mark: (md: MarkdownIt) => void;
  export default mark;
}
