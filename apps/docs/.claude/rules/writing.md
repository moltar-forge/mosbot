---
paths:
  - 'docs/**/*.md'
---

# Writing Conventions

## Frontmatter (required on every page)

```yaml
---
id: page-id # unique, matches sidebar reference
title: Page Title # displayed in browser tab and page header
sidebar_label: Label # shorter label shown in sidebar (optional, defaults to title)
sidebar_position: 1 # order within sidebar section (1 = first)
---
```

## Voice and style

- Write for **end users**, not developers — assume first-time setup perspective.
- Use **second person** ("you"): "You can configure this by..." not "Users can configure..."
- Use **active voice**: "Run the command" not "The command should be run".
- Keep **sentences short and direct** — one idea per sentence.
- Start each page with a one-sentence summary of what the page covers.

## Structure

- Use a single `#` H1 matching the `title` frontmatter — do not repeat the title in the body.
- Organize with `##` and `###` sections — don't skip heading levels.
- Lead with the "why" before the "how" when introducing a concept.
- End setup guides with a "Next steps" or "Verify" section.

## Code blocks

- Always specify the language for syntax highlighting: ` ```bash `, ` ```yaml `, ` ```json `.
- Use `bash` for terminal commands, `yaml` for config files, `json` for JSON examples.
- Add a brief comment or description before long code blocks.
- Prefer complete, runnable examples over fragments.

## Admonitions

Use Docusaurus admonitions for callouts — pick the right type:

```
:::tip
Optional shortcut or best practice.
:::

:::info
Background context the user should know.
:::

:::warning
Common mistake or gotcha — read before proceeding.
:::

:::caution
Action that could cause data loss or security risk.
:::
```

## Links

- Use relative paths for internal links: `./quickstart` or `../openclaw/overview`.
- Don't use absolute URLs for internal docs pages.
- External links open in the same tab by default — that's fine for docs.

## Images

- Store in `static/img/screenshots/` with descriptive filenames: `mosbot-task-board.png`.
- Always include alt text:
  `![Task board showing drag-and-drop columns](../../static/img/screenshots/mosbot-task-board.png)`.
- Prefer screenshots that show the full relevant UI context, not cropped fragments.

## New pages checklist

- [ ] Frontmatter present with `id`, `title`, `sidebar_position`
- [ ] Page added to correct section in `sidebars.js`
- [ ] No real secrets or internal URLs in examples
- [ ] `npm run build` passes (catches broken links)
