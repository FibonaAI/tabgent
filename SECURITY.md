# Security

This is an early-preview extension with access to browser content and a local
Codex process. Treat it accordingly when choosing which pages to expose.

## Report privately

Do not publish working exploits, credentials, private URLs, or conversation logs
in a public issue. Use the repository's private vulnerability-reporting feature
if enabled, or contact the maintainers privately to arrange a report. This project
does not currently promise a response SLA or a bug-bounty program.

Include the affected version, reproduction steps with non-sensitive fixtures,
expected scope, observed scope, and potential impact.

## Areas that need particular care

- Tab/window scope validation and cross-frame selection ownership.
- Native-message caller restrictions, file paths, and input size limits.
- Authentication and handling of untrusted page text.
- HTML rendering, external links, attachments, and leaked secrets in diagnostics.

Use the latest project version while fixes are being developed. No long-term
support policy for older versions has been established.
