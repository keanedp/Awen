# Formatting Test Document

A kitchen-sink Markdown file for checking the editor, the preview, print, and HTML/PDF export. Every section exercises a different piece of syntax.

## Headings

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

Setext Heading 1
================

Setext Heading 2
----------------

## Inline Formatting

This is **bold**, this is __also bold__, this is *italic*, this is _also italic_, and this is ***bold italic***. Here is ~~strikethrough~~ and some `inline code`. Mixed: **bold with `code` inside** and *italic with a [link](https://example.com)*.

Escaped characters: \*not italic\*, \`not code\`, \# not a heading, 1\. not a list.

Typographer: "double quotes", 'single quotes', an ellipsis..., an en dash -- and an em dash ---, plus (c) (r) (tm) and +-.

A line ending with two spaces  
forces a hard break. A line ending with a backslash\
does too. This line has a soft break
that should join into one paragraph.

## Links

- Inline link: [Example](https://example.com)
- Link with title: [Example with title](https://example.com "Example title")
- Reference link: [the reference][ref] and a [collapsed reference][]
- Autolink: <https://example.com/autolink>
- Linkify bare URL: https://example.com/bare and www.example.com
- Email autolink: <someone@example.com>
- Relative link to a local file: [gradient image](images/gradient.png)
- Heading anchor: [jump to Tables](#tables)

[ref]: https://example.com/reference "Reference title"
[collapsed reference]: https://example.com/collapsed

## Lists

### Unordered

- First item
- Second item with **bold**
  - Nested item
  - Another nested item
    - Third level
      - Fourth level
- Back to the top level
* Asterisk marker (starts a new list)
+ Plus marker (starts another list)

### Ordered

1. First
2. Second
   1. Nested ordered
   2. Another nested
3. Third
10. Out-of-order number continues the list

5. List starting at five
6. Six
7. Seven

1) Parenthesis delimiter
2) Second item

### Loose list (paragraphs between items)

- A loose item with a paragraph.

  A second paragraph inside the same item.

- Another loose item.

  > A quote inside a list item.

  ```js
  // code inside a list item
  console.log("indented fence");
  ```

### Mixed

1. Ordered parent
   - Unordered child
   - Another child
     1. Ordered grandchild
2. Second ordered parent

## Task Lists

- [ ] Unchecked task
- [x] Checked task
- [X] Checked with capital X
- [ ] Task with **formatting**, `code` and a [link](https://example.com)
- [ ] Parent task
  - [x] Nested done
  - [ ] Nested not done
    - [ ] Deeply nested task
1. [ ] Task in an ordered list
2. [x] Done task in an ordered list

Not tasks (should render literally): - [] missing space, - [ x] bad spacing.

## Blockquotes

> A single-line blockquote.

> A multi-paragraph blockquote.
>
> Second paragraph with **bold** and `code`.
>
> > A nested blockquote.
> >
> > > Three levels deep.
>
> - A list inside a quote
> - [ ] A task inside a quote
>
> ```
> code inside a quote
> ```

## Code

Inline: `const x = 42;` and a backtick inside code: `` `tick` ``.

Indented code block:

    function indented() {
        return "four spaces";
    }

Fenced, no language:

```
plain fenced block
  with preserved    spacing
```

TypeScript:

```ts
interface Doc {
  path: string | null;
  text: string;
  dirty: boolean;
}

export function title(doc: Doc): string {
  return doc.path?.split("/").pop() ?? "Untitled";
}
```

Rust:

```rust
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}
```

Tilde fence with a very long line to test horizontal scrolling and wrapping in the preview, print, and PDF export:

~~~bash
echo "This is a deliberately long line of shell to check how code blocks handle overflow when the content is much wider than the page width allows"
~~~

## Tables

| Left aligned | Centered | Right aligned | Default |
|:-------------|:--------:|--------------:|---------|
| apple        | 1        | $1.00         | fruit   |
| banana       | 22       | $12.50        | fruit   |
| carrot       | 333      | $123.99       | veg     |
| **bold**     | `code`   | *italic*      | [link](https://example.com) |

A wide table:

| ID | Name | Email | Role | Department | Location | Start Date | Status | Notes |
|----|------|-------|------|------------|----------|------------|--------|-------|
| 1 | Ada Lovelace | ada@example.com | Engineer | Research | London | 1843-01-01 | Active | First programmer |
| 2 | Grace Hopper | grace@example.com | Admiral | Navy | Arlington | 1943-12-01 | Retired | Wrote the first compiler and coined the term "debugging" |
| 3 | Alan Turing | alan@example.com | Mathematician | Bletchley | Manchester | 1939-09-04 | Legacy | — |

Table with escaped pipe and empty cells:

| Expression | Meaning |
|------------|---------|
| `a \| b`   | a or b  |
|            | empty left cell |
| only left  |         |

## Images

Local relative image (resolved against the document's folder):

![A blue-purple gradient](images/gradient.png "Local gradient")

Inline data-URI image (should render without any file access): ![checkerboard](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAIklEQVR42mP4hQSeBdjAES5xhkGogRhFyOKDUcNoPAwKDQAKVjAf01gXRwAAAABJRU5ErkJggg==)

Remote image (blocked by the CSP, so it shows as broken):

![Placeholder](https://placehold.co/300x100.png "Remote placeholder")

Missing image (alt text should show):

![This image does not exist](images/missing.png)

Linked image:

[![Gradient as a link](images/gradient.png)](https://example.com)

Reference-style image:

![Reference gradient][gradient]

[gradient]: images/gradient.png

## Horizontal Rules

Three styles:

---

***

___

## Raw HTML (should be escaped, not rendered)

<div style="color: red">This div should appear as literal text.</div>

<script>alert("this must never run")</script>

Inline <b>bold tag</b> and <kbd>Cmd</kbd>+<kbd>S</kbd> should also show as text.

## Unicode and Special Characters

- Accents: café, naïve, Ångström, façade
- CJK: 日本語のテキスト, 中文文本, 한국어 텍스트
- RTL: مرحبا بالعالم, שלום עולם
- Emoji: 🎉 ✅ 📝 👩🏽‍💻 🇬🇧
- Symbols: → ← ↑ ↓ ≠ ≤ ≥ ∞ ∑ π ° © ™
- HTML entities: &amp; &lt; &gt; &copy; &nbsp;(nbsp) &#9731;

## Long Paragraph

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Averyveryveryverylongwordwithoutanybreakstocheckhowtheeditorandpreviewhandleoverflowingunbreakabletext.

## Edge Cases

Empty emphasis markers: ** ** and __ __.

Intraword: snake_case_word stays plain, but intra**word**bold works.

A heading immediately followed by content:
### Tight heading
Text right under it.

#Not a heading (no space)

Trailing content at the end of the file without a final newline.