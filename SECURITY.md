# Security

Smooth Family keeps a family's calendar, documents, passwords and children's information. Security
problems are taken seriously and come before other work on the project.

Smooth Family is a hobby project, built in spare time and shared for free. There is no company or
support team behind it, so there are no promised response times – reports are handled on a
best-effort basis.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub:
**Security → Report a vulnerability** on this repository
(<https://github.com/burnwalled/smoothfamily/security/advisories/new>).

Tell us what you found, how to reproduce it and what it lets someone do. Please give the project a
reasonable time to fix it before you publish anything; the advisory is published together with the
fix, with credit to you if you want it.

## Supported versions

Only the newest release gets fixes. Server admins update from the app (Server settings → Updates)
or with `git pull && docker compose up -d --build`.

## Running it safely

How the server is reached matters more than anything else: see [docs/ACCESS.md](docs/ACCESS.md) for
the choices (home network, VPN, HTTPS on the internet) and a checklist before publishing a server
on the internet.

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
- A server that updates itself only installs a build whose manifest is signed: stable releases
  with a key that exists only on the maintainer's computer, beta builds with a separate key held by
  GitHub's build. The images are pulled by digest, so what runs is exactly what was signed.
- The server admin sees families' names, sizes and devices by kind – never their content.
