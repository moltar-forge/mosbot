# Security

No paths frontmatter — these rules apply globally at all times.

## Do

- Use placeholder values in all examples, consistently:
  - Tokens/secrets: `your-token-here`, `<your-api-key>`, `change-me`
  - Hostnames: `example.com`, `your-domain.com`
  - Emails: `admin@example.com`
  - Passwords: `your-password-here`
- Keep placeholder values consistent throughout a guide — use the same fake hostname/token across
  all code blocks in a page.

## Don't

- Don't include real API keys, tokens, passwords, secrets, or connection strings anywhere.
- Don't include internal hostnames, cluster addresses, IP ranges, or deployment-specific URLs.
- Don't reference specific user names, org names, or real infrastructure details.

## If a secret is accidentally committed

1. Immediately revoke/rotate the exposed credential — assume it is compromised.
2. Report via GitHub Security Advisory (see `SECURITY.md`).
3. Remove from history: use `git filter-repo` or BFG Repo Cleaner.
4. Force-push the cleaned branch and notify maintainers.

## CI enforcement

- Gitleaks scans all staged files in the pre-commit hook — commit will be blocked if patterns are
  detected.
- Gitleaks also runs in CI on every PR.
