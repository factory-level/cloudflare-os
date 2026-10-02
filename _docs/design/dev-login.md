---
title: Dev Login
status: draft
updated: 2026-10-02
---

# Dev Login

## Purpose

During local development, a developer signs in to the Workshop by typing a username and password into the login page after every fresh profile, cleared storage, or user switch. Dev Login lets the developer sign in from the command line instead: one command signs a chosen user in and opens a browser that is already signed in.

## Relationship to Upstream

Upstream's `VITE_DEV_AUTO_LOGIN` (in `packages/workshop-frontend/src/main.tsx`) already skips the login page, but it is inlined at build time and signs in one fixed account. Dev Login works for any username without a rebuild, and it lives in the fork's `gadgets` CLI next to the other local-development commands.

## Requirements

- `gadgets dev-login` must sign a named user in to a local Workshop, creating the account when it does not exist.
- An account created this way must also accept the same password on the normal login page.
- The browser must end up signed in as that user without the developer typing a password.
- The session token must not stay in the address bar or browser history.
- Neither the CLI nor the frontend may hand a session to a non-loopback Workshop.

## Behavior

- The default user is `admin`, which the dev server lists in `ADMINS`. The default password is `devpassword`, the same as upstream's auto-login. `--user`, `--password` and `GADGETS_DEV_PASSWORD` override them.
- An existing account with a different password is an error. The command does not reset it.
- `--no-open` prints the sign-in link instead of opening a browser. `--print-token` prints the raw session token for scripting.
- Running the command again for another user replaces the browser's session.

## Non-Goals

- Signing in to deployed or Cloudflare Access Workshops. `gadgets login` covers Access.
- Storing the session for the CLI's own Workshop calls. Harness pairing covers that.
- Session revocation or expiry, which upstream does not have.

## Open Questions

- Should `dev-login` also save the session as the CLI's harness pairing, so that `gadgets try` works without pairing through the browser?

## Related

- Architecture: [`../architecture/dev-login.md`](../architecture/dev-login.md)
- [Local Skill Push](local-skill-push.md), which owns the rest of the `gadgets` CLI
