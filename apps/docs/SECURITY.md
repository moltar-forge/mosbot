# Security Policy

## Supported versions

| Version         | Supported   |
| --------------- | ----------- |
| Latest (`main`) | Yes         |
| Older tags      | Best-effort |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

To report a vulnerability privately:

1. Open a
   [GitHub Security Advisory](https://github.com/bymosbot/mosbot-docs/security/advisories/new) in
   this repository.
2. Provide a clear description of the issue, steps to reproduce, and potential impact.

We aim to acknowledge reports within **48 hours** and provide a fix or mitigation within **14 days**
for critical issues.

## Disclosure policy

- We follow
  [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure).
- We will credit reporters in release notes unless they prefer to remain anonymous.

## Security notes for this repository

This repository contains only documentation — no application code, secrets, or credentials. However:

- Do not commit any real API keys, tokens, or passwords in documentation examples.
- Use placeholder values in all code samples (e.g. `your-token-here`, `<your-api-key>`).
- If you discover a real secret accidentally committed, report it via the advisory process above.
