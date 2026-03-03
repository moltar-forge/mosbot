---
paths:
  - "src/**/*.test.js"
  - "src/**/*.test.jsx"
---

# Testing Conventions

## Structure

- Tests are colocated with source files — same directory, `.test.js` / `.test.jsx` suffix.
  - `src/stores/taskStore.js` → `src/stores/taskStore.test.js`
  - `src/components/Header.jsx` → `src/components/Header.test.jsx`
- Use `describe()` to group by feature/behaviour, `it()` for individual cases.
- Use descriptive test names: `it('fetches tasks and updates store on success')` not `it('works')`.

## Framework

- Test runner: **Vitest** (not Jest — APIs are compatible but imports differ).
- Global setup: `src/test/setup.js`.
- Shared mocks: `src/test/mocks/`.

## Mocking

- Mock the shared API client (`src/api/client.js`) for all store and component tests.
- Use `vi.mock()` at the top of the file for module-level mocks (Vitest equivalent of `jest.mock()`).
- Clear mocks between tests: `afterEach(() => vi.clearAllMocks())`.
- Don't make real HTTP requests in tests.

## Store tests

- Test store actions directly — call the action and assert on the resulting state.
- Mock `api.client` responses using `vi.mocked()` or `vi.spyOn()`.
- Test both success and error paths for every async action.

## Component tests

- Use React Testing Library (`@testing-library/react`).
- Assert on user-visible behaviour, not internal implementation details.
- Mock stores with `vi.mock()` to control state in isolation.

## Running tests

```bash
make test-run    # run once (CI mode)
npm run test:run # without Make
```
