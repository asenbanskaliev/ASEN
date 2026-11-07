# Security

To report a vulnerability, open a private issue or contact maintainers directly.
Do not post secrets in issue text, pull requests, or CI logs.

ASEN keeps sensitive paths out of delegated reads by default, for example:
- `.git`
- `.env`
- `.pem`
- `.key`
- `.npmrc`
- `.netrc`
- `.aws/`
- `.ssh/`
- common secret token prefixes

If you find an issue, include the affected command, platform, and a minimal reproduction.
