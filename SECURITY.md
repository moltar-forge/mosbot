# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| Latest (`main`) | Yes |
| Older tags | Best-effort |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

To report a vulnerability privately:

1. Open a [GitHub Security Advisory](https://github.com/bymosbot/mosbot-dashboard/security/advisories/new) in this repository.
2. Provide a clear description of the issue, steps to reproduce, and potential impact.

We aim to acknowledge reports within **48 hours** and provide a fix or mitigation within **14 days** for critical issues.

## Disclosure policy

- We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure).
- We will credit reporters in release notes unless they prefer to remain anonymous.

## Security note on `VITE_*` variables

All `VITE_*` environment variables are embedded in the built JavaScript bundle and are visible to end users. Never put secrets (tokens, passwords, API keys) in `VITE_*` variables — only public configuration belongs there.
