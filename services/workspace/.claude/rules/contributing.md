---
paths:
  - "package.json"
  - "package-lock.json"
  - "__tests__/**/*"
  - "*.md"
  - ".github/**/*"
  - ".husky/**/*"
  - ".prettier*"
---

# Contributing Guidelines

## Testing Requirements

- **100% test coverage is enforced** — all changes must maintain full coverage
- Add tests for every new feature or behavior change
- Use Jest for unit and integration tests
- Use Supertest for API endpoint testing
- Place tests in `__tests__/` directory mirroring the `src/` structure

## Code Style

- Use Prettier for code formatting (enforced via pre-commit hook)
- Follow JavaScript standard practices
- Use descriptive variable and function names
- Keep functions focused and single-purpose
- Write clear, concise comments for complex logic

## Pre-commit Hooks

- Husky and lint-staged automatically format files before commits
- Formatting checks run in CI pipeline
- Run `npm run format` manually if needed before committing

## Git Workflow

- Use conventional commit messages when possible
- Keep commits focused and atomic
- Include tests with code changes
- Update documentation when APIs change

## Branch Naming

- Use descriptive branch names: `feature/user-auth`, `bugfix/path-validation`, etc.
- Prefix with type when helpful: `feature/`, `bugfix/`, `chore/`, `refactor/`

## Pull Request Process

- Include a clear description of the change
- Link to related issues if applicable
- Ensure all tests pass
- Verify 100% test coverage is maintained
- Have another team member review before merging

## Development Setup

```bash
npm install
cp .env.example .env  # then configure appropriately
npm start
```

## Running Tests

```bash
npm run test:run        # run tests once
npm run test:coverage   # run with coverage report
npm test               # run tests in watch mode (development)
```

## Before Submitting Changes

1. Run all tests to ensure nothing is broken
2. Verify code is properly formatted (`npm run format:check`)
3. Confirm test coverage remains at 100%
4. Test manually if making UI/API changes
