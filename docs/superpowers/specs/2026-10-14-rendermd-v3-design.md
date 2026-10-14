# rendermd v3 — Design

- **Date:** 2026-10-14
- **Status:** approved (scope confirmed in chat)
- **Builds on:** v1 and v2 specs. Ideas taken from render-md.com's interface (ideas only, not its code or look).

## 1. Goal

Bring writing and reading up to the level of the best Markdown tools, keeping rendermd's sharing strengths (short encrypted links, passwords, presentation) and principles (no account, no server reads documents, privacy-safe metrics).

## 2. Scope

**Batch A — editing and reading core**
1. Write / Split / Read modes, with editor → preview scroll sync in Split.
2. Formatting toolbar above the editor (the Insert diagram picker moves into it).
3. GitHub-style callouts (`> [!NOTE]`, TIP, IMPORTANT, WARNING, CAUTION).
4. Copy button on code blocks.
5. Diagram actions: expand (full-screen view) and copy as image, besides SVG/PNG download.

**Batch B — finish**
6. Line numbers and active-line highlight in the editor.
7. Status bar: words, characters, lines, reading time, and "Saved on this device".
8. Document title (front matter `title`, else first heading) in the header and the browser tab.
9. YAML front matter rendered as a metadata table.
10. Footnotes, `==highlight==`, `<kbd>`, emoji shortcodes (`:sparkles:`).

**Batch C — polish**
11. Typeset styles: Modern, Editorial, Technical.
12. Paper-style preview with a "N words · N min read" line.
13. Command palette (Ctrl/Cmd+K).

Out: section permalinks (the URL fragment holds the document, so a section link can't exist), import from URL (declined in v2).

## 3. Design

### 3.1 Modes and scroll sync
- A tab group **Write | Split | Read** replaces Code | Preview. Split appears only when the viewport is at least 900 px wide; on narrower screens a saved Split falls back to Write. The choice is saved (`rendermd.mode`); default Split on wide screens, Write otherwise.
- Block elements in rendered HTML carry `data-source-line` (from markdown-it token maps; data attributes survive sanitization).
- With **Sync scroll** on (default; toggle in the status bar, saved as `rendermd.syncScroll`), scrolling the editor scrolls the preview so the element whose source line is the last one at or above the editor's top visible line sits at the top. One way only (editor → preview), to avoid feedback loops.

### 3.2 Formatting toolbar
Buttons with icons and accessible names: Heading 1, Heading 2, Heading 3, Bold, Italic, Strikethrough, Inline code, Link, Image, Bulleted list, Numbered list, Task list, Quote, Code block, Table, Math, Mermaid diagram (opens the picker), Divider.
- Inline styles wrap the selection (or insert a placeholder and select it) and toggle off when already wrapped.
- Line styles (headings, lists, quote) apply to every selected line, replacing an existing heading or list prefix and toggling off when it matches.
- Blocks (code block, table, math, divider) insert on their own lines.
- Shortcuts: Ctrl/Cmd+B bold, Ctrl/Cmd+I italic. (Ctrl/Cmd+K is the command palette.)
- Pure functions over CodeMirror `EditorState`, unit tested.

### 3.3 Callouts
`markdown-it-github-alerts`: the five GitHub alert types render as titled, colored boxes with an icon, in both themes.

### 3.4 Copy code
Every non-Mermaid code block gets a **Copy** button (top-right, on hover and keyboard focus) that copies the code text and shows "Copied" for 2 s. Added during hydration.

### 3.5 Diagram actions
Next to SVG and PNG: **Expand** opens the diagram in a full-screen overlay (fit to screen, Esc or click to close), and **Copy image** puts a PNG on the clipboard (`ClipboardItem`); when the browser refuses, a notice suggests downloading instead.

### 3.6 Editor extras
Line numbers and active-line highlight (theme colors).

### 3.7 Status bar
Below the editor: `N words · N chars · N lines · N min read` (200 words per minute, at least 1), the Sync scroll toggle (Split only), and "Saved on this device" after the draft is saved.

### 3.8 Title
`documentTitle(markdown)`: front matter `title`, else the first heading's text, else none. Shown in the header next to the brand (truncated with ellipsis), and as the browser tab title `"<title> · rendermd"`. The tab title never reaches analytics (events send no titles).

### 3.9 Front matter
`markdown-it-front-matter` captures a leading `---` YAML block. A small parser reads `key: value` lines and `[a, b]` lists (no YAML library); the block renders as a two-column metadata table above the document. Unparseable lines show as raw text.

### 3.10 Extra syntax
`markdown-it-footnote`, `markdown-it-mark`, `markdown-it-emoji` (light set). `<kbd>` and `<mark>` HTML already pass the sanitizer; style them.

### 3.11 Typeset styles
An **Aa** menu on the reader and preview: Modern (current sans), Editorial (serif text, larger leading), Technical (monospace headings, compact). System font stacks only; no web fonts. Saved as `rendermd.typeset`; it applies to the reading view and to slides.

### 3.12 Paper preview
On screens ≥ 900 px, the document sits on a card (surface color, border, soft shadow) with a small "N words · N min read" line above it. Print and presentation ignore the card.

### 3.13 Command palette
Ctrl/Cmd+K (and a toolbar button) opens a Downshift combobox listing actions available on the current page: switch mode, open file, generate link, insert each diagram type, export PDF/.md, present, edit a copy, toggle theme, switch language, change typeset. Typing filters; Enter runs; Esc closes.

## 4. Analytics
New events: `mode_changed` (`mode`), `format_applied` (`format`), `code_copied`, `diagram_expanded`, `diagram_copied` (`ok`), `typeset_changed` (`style`), `command_run` (`command` id). None carries document text.

## 5. Testing
Unit: formatting commands, front-matter parser, title extraction, word/reading counts, source-line attributes, sync-scroll target lookup. E2E: each feature's main flow, mobile fallback of Split, scroll sync, clipboard flows, palette. Visual baselines refreshed only where rendering intentionally changed (callouts, front matter, footnotes are new examples added to the reference document as separate visual checks).
