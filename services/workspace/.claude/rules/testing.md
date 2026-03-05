---
paths:
  - "__tests__/**/*"
  - "src/**/*.js"
  - "jest.config.js"
  - "package.json"
---

# Testing Standards

## Do

## Test Coverage Requirements

- **100% test coverage is enforced** — all code must be covered by tests
- No code changes should reduce test coverage
- Edge cases and error conditions must be tested
- Security-related functionality requires comprehensive testing

## Testing Approach

- Use Jest for all testing needs
- Use Supertest for API endpoint testing
- Test both positive and negative cases
- Mock external dependencies and file system operations appropriately
- Test environment variable validation separately
- Verify path validation and security controls

## Test Structure

- Mirror the file structure of `src/` in `__tests__/`
- Name test files consistently: `module.test.js`
- Group related tests with `describe()` blocks
- Use descriptive test names with `it()`/`test()` statements
- Set up proper test fixtures and cleanup

## Security Testing

- Test path traversal prevention mechanisms
- Verify authentication requirements work correctly
- Test invalid input handling
- Verify error responses don't leak sensitive information
- Test boundary conditions for file operations

## File System Operations Testing

- Mock file system operations to avoid actual file writes during tests
- Test various file path scenarios safely
- Verify path normalization and validation
- Test error conditions for file access

## Continuous Integration

- Tests must pass in CI environment before merging
- Coverage threshold is enforced at 100%
- Tests should not rely on specific environment configurations
- All tests must be hermetic (no external dependencies)

## Test Categories

- Unit tests: individual functions and utilities
- Integration tests: API endpoints and request/response handling
- Security tests: authentication, path validation, error handling
- Edge case tests: boundary conditions, malformed inputs
