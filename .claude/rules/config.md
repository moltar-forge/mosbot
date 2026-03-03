---
paths:
  - 'docusaurus.config.js'
  - 'sidebars.js'
  - 'eslint.config.js'
  - 'babel.config.js'
  - 'src/**/*.js'
---

# Configuration Conventions

## docusaurus.config.js

- Site title, tagline, base URL, and organization name are set here — don't duplicate in docs.
- Base URL is `/mosbot-docs/` (GitHub Pages subdirectory) — keep this consistent with deployment.
- Navbar and footer links are defined here — update when adding major new sections.
- Plugin config (image-zoom, etc.) lives here — don't add plugins without updating this file.
- Use single quotes for strings (ESLint enforced).

## sidebars.js

- Every new `.md` page **must** be added here — Docusaurus will not include it otherwise.
- Items are referenced by their `id` frontmatter value.
- Use `type: 'category'` with `collapsed: false` for top-level sections.
- Use `type: 'category'` with `collapsed: true` for sub-sections (e.g. skill reference).
- `sidebar_position` in frontmatter controls ordering within a category.
- When adding a new section, add a corresponding entry in the `navbar` in `docusaurus.config.js` if
  it warrants top-level navigation.

## Code style (JS config files)

- 2-space indentation.
- Single quotes.
- Semicolons required.
- No `console.log` (ESLint warns).
- CommonJS modules (`require`/`module.exports`) — Docusaurus config uses CJS.

## Prettier

Rules from `.prettierrc.json` — run `npm run format` to apply:

- `singleQuote: true`
- `semi: true`
- `trailingComma: 'all'`
- `printWidth: 100`
- `proseWrap: 'always'` (wraps Markdown prose at 100 chars)
