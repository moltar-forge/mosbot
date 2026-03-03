---
paths:
  - "src/**/*.jsx"
  - "src/**/*.js"
---

# Contributing — Code Style & Quality

## Do

- Use **single quotes** for string literals.
- Use functional components with hooks — no class components.
- Use the shared Axios instance from `src/api/client.js` — never instantiate a new one.
- Use Zustand stores for all shared state — never lift state above what's necessary.
- Always handle loading and error states explicitly — no silent async failures.
- Lazy-load tab data: fetch on tab click, not on modal/panel open.
- Keep components focused — extract sub-components when JSX exceeds ~100 lines.
- Name branches: `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`.
- Keep PRs focused — one logical change per PR.

## Don't

- Don't create new Axios instances — use `src/api/client.js`.
- Don't use `useEffect` to sync derived state — compute it inline or via a selector.
- Don't put business logic in components — it belongs in stores or utils.
- Don't use inline styles — use Tailwind utility classes.
- Don't merge a PR with failing lint or test checks.
- Don't commit `node_modules/` or `dist/`.

## Tailwind conventions

- Dark theme is the default — always design for dark background first.
- Use shared component classes from `src/index.css` for repeated patterns.
- Prefer `classNames()` helper from `src/utils/helpers.js` for conditional classes.

## PR Checklist

- [ ] `make lint` passes with no new errors
- [ ] `make test-run` passes
- [ ] Loading and error states handled for any new async operations
- [ ] No secrets, tokens, or hardcoded URLs in code or comments
- [ ] `.env.example` updated if a new env var was added