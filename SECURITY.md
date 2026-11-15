# Security policy

This is a public educational portfolio project. The latest default-branch revision is the supported development version; older coursework snapshots are not maintained security releases.

## Report a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/saadh472/telegram-clone/security/advisories/new) to send reproduction steps, affected paths, and impact. Do not publish credentials, personal records, or exploit details in a public issue. A response time is not guaranteed for this student-maintained project.

## Safe demonstrations

Use fictional records and dedicated demo accounts. Keep credentials in environment variables, runtime data outside source control, and databases backed up locally. Public source access does not grant access to a running application's records. Review the README's deployment limits before exposing a server.

Dependency updates and code scanning help identify issues; passing scans do not establish that the application is secure. Dependency changes still require review and the project's automated checks.

## Messaging-specific limits

- Set a unique `JWT_SECRET` before any shared or public deployment.
- Do not commit `backend/.env` or real database connection strings.
- The experimental client-side encryption mode is a learning feature; it is not an audited secure messaging protocol.
- Demo attachment payloads are stored in message content. Use fictional messages and non-private test files.

