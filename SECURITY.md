# Security

Smooth Family keeps a family's calendar, documents, passwords and children's information. Security
problems are taken seriously and handled before anything else.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub:
**Security → Report a vulnerability** on this repository
(<https://github.com/burnwalled/smoothfamily/security/advisories/new>).

Tell us what you found, how to reproduce it and what it lets someone do. You'll get an answer within a
week; we'll agree on when the fix and the advisory are published, and credit you if you want.

## Supported versions

Fixes go into the newest release. Server admins update from the app (Server settings → Updates) or
with `git pull && docker compose up -d --build`.

## How the app protects a family

- Passwords are hashed with bcrypt; sign-in can require passkeys or an authenticator app; failed
  sign-ins are throttled.
- Documents, files in the vault and saved passwords are encrypted with a key per family, sealed with
  the server's key.
- Backups are sealed with a key made in the admin's browser – the server keeps only its public half.
- A Content Security Policy with a nonce per page (enforced in the Synology production stack, set
  `CSP_MODE=enforce` elsewhere), no third-party scripts, containers without root and with
  capabilities dropped, the database and Redis on an internal network.
- The gateway to another home connects out with a key only it has, runs only code signed on the
  maintainer's computer, and can be given only the Home Assistant domains the family allows.
- The server admin sees families' names, sizes and devices by kind – never their content.
