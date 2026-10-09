---
title: Dev Login
covers:
  - packages/gadgets-cli/src/devLogin.ts
  - packages/gadgets-cli/src/devLogin.test.ts
  - packages/gadgets-cli/src/passwordHash.ts
  - packages/gadgets-cli/src/passwordHash.test.ts
  - packages/workshop-frontend/src/features/dev-login
touchpoints:
  - packages/workshop-frontend/src/main.tsx
  - pnpm-lock.yaml
  - scripts/env-passthrough.test.ts
updated: 2026-10-08
---

# Dev Login

## Overview

`gadgets dev-login` signs a user in to a local dev Workshop over Cap'n Web, the same way the login page does, and opens the app with a one-time link that carries the session token in the URL fragment. A small frontend module stores the token where the login page would and strips it from the address bar.

```sh
node packages/gadgets-cli/src/bin.ts dev-login                      # admin / devpassword on http://localhost:8787
node packages/gadgets-cli/src/bin.ts dev-login --user alice --app http://localhost:3000   # pnpm dev-server
```

## Components

| Path | Responsibility |
| --- | --- |
| `packages/gadgets-cli/src/devLogin.ts` | Loopback check, username normalization, log in then create, link building, opening the browser |
| `packages/gadgets-cli/src/passwordHash.ts` | Argon2id password hash identical to the frontend's, with `SERVICE_SALT` copied in |
| `packages/gadgets-cli/src/bin.ts` | The `dev-login` command and its flags (file covered by [Local Skill Push](local-skill-push.md)) |
| `packages/workshop-frontend/src/features/dev-login/consumeDevLoginToken.ts` | Reads `#gadgets-dev-token=` on a loopback host, writes `localStorage.authToken`, removes the fragment with `history.replaceState` |

## Data and Control Flow

1. The CLI rejects `--api` or `--app` unless the host is `localhost`, `127.0.0.1` or `[::1]`.
2. It lowercases the username and validates it against the backend's pattern, then hashes the password with the lowercase name as salt.
3. It opens an unauthenticated session (`connectSession`) and calls `login`. If that returns null, it calls `createAccount`. If both return null, the account exists with another password and the command fails. Logging in first means an existing account still works when signups are disabled.
4. It opens `<app>/#gadgets-dev-token=<encoded token>` with `xdg-open`, `open` or `start`.
5. `main.tsx` calls `consumeDevLoginToken()` at module load, before the RPC connection, `devAutoLogin` and React. `useAuth` then finds the token on first mount and authenticates as usual.

## Configuration

| Flag or variable | Default | Meaning |
| --- | --- | --- |
| `--user` | `admin` | Username. `admin` is an admin in `pnpm run-local` / `pnpm dev-server` (`ADMINS` in `scripts/run-dev-server.ts`) |
| `--password`, then `GADGETS_DEV_PASSWORD` | `devpassword` | Password, also valid on the login page |
| `--api` | `http://localhost:8787` | Workshop backend |
| `--app` | value of `--api` | Frontend origin to open. Use `http://localhost:3000` for the Vite dev server |
| `--no-open` | off | Print the link instead of opening it |
| `--print-token` | off | Print the raw `<user>:<secret>` session token |

## Upstream Touchpoints

| Upstream file | Edit | Why it could not be a net-new file |
| --- | --- | --- |
| `packages/workshop-frontend/src/main.tsx` | Imports and calls `consumeDevLoginToken()` at module top | The token must be in `localStorage` before `useAuth` reads it, and `main.tsx` is the only entry point that runs earlier |
| `pnpm-lock.yaml` | Adds `hash-wasm` to the `packages/gadgets-cli` importer | Generated from the CLI's new dependency |
| `scripts/env-passthrough.test.ts` | Lists `GADGETS_DEV_PASSWORD` among the CLI's external variables | The test enumerates every environment read in the workspace |

## Upstream Dependencies

| Upstream path | Relied on for |
| --- | --- |
| `packages/workshop-shared/src/api.ts` | `PublicApi.login` / `createAccount` signatures, `SERVICE_SALT`, the documented argon2id parameters |
| `packages/workshop-frontend/src/passwordHash.ts` | The browser's hash, which `passwordHash.test.ts` compares against |
| `packages/workshop-backend/src/user.ts` | `normalizeUsername` rules, and `login` returning null for an unknown user |
| `packages/workshop-frontend/src/useAuth.ts` | Reading the session from `localStorage.authToken` |

## Divergences from Design

None.

## Open Questions

- The browser's login page salts the hash with the username as typed, while the backend lowercases it. An account created here signs in on the login page only when the name is typed in lowercase. This is upstream behavior and affects accounts created in the UI the same way.
