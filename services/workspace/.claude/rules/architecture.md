---
paths:
  - "src/**/*.js"
  - "__tests__/**/*"
---

# Architecture & Design Patterns

## Do

## Do

- Separate concerns between `src/app.js` (Express app factory) and `src/index.js` (server startup).
- Keep `createApp()` pure for testability — inject dependencies rather than accessing globals.
- Follow RESTful API conventions for endpoint design.
- Use consistent error response formats with appropriate HTTP status codes.
- Implement proper request/response validation.
- Keep route handlers thin — delegate business logic to helper functions.
- Maintain backwards compatibility for public API endpoints.
- Use environment variables for configuration.
- Structure tests to match the app module structure.

## Don't

- Don't mix server startup logic with app configuration in the same module.
- Don't hardcode paths or configuration values.
- Don't implement custom authentication schemes — use the existing bearer token system.
- Don't create circular dependencies between modules.
- Don't handle file operations directly without using the established path validation utilities.
- Don't modify global state or use global variables.

## API Design Standards

- Use standard HTTP methods: GET, POST, PUT, DELETE
- Return appropriate status codes (200, 201, 400, 401, 403, 404, 500)
- Include Content-Type headers for request/response bodies
- Support optional query parameters for filtering and configuration
- Implement health checks at `/health` endpoint

## Module Organization

- `src/app.js`: Express app factory, middleware configuration, route definitions
- `src/index.js`: Environment validation, server initialization, error handling
- `__tests__/`: Mirror the src structure with corresponding tests
- Keep utility functions separate from route handlers

## Error Handling

- Catch errors and return appropriate HTTP status codes
- Log server-side errors without exposing internal details to clients
- Validate inputs early in the request lifecycle
- Provide meaningful error messages without revealing system details
